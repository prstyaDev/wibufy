package com.prstyadev.wibufy.data

import android.content.Context
import java.util.Locale

class DetailRepository(context: Context) {
    private val animeDetailDao = AppDatabase.getDatabase(context).animeDetailDao()

    suspend fun getCachedAnimeDetail(animeId: String): AnimeDetailData? {
        val entity = animeDetailDao.getAnimeDetail(animeId) ?: return null

        // Try rawDetailJson first for full fidelity
        if (!entity.rawDetailJson.isNullOrBlank()) {
            try {
                val anime = JsonUtils.animeDetailAdapter.fromJson(entity.rawDetailJson)
                if (anime != null) {
                    val fixedAnime = if (anime.title.isNullOrBlank() && !entity.title.isNullOrBlank()) {
                        anime.copy(title = entity.title)
                    } else {
                        anime
                    }
                    return AnimeDetailData(provider = "cache", anime = fixedAnime)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        // Reconstruct from entity columns
        val genres = try {
            entity.genresJson?.let { JsonUtils.genreListAdapter.fromJson(it) }
        } catch (e: Exception) { null }

        val episodes = try {
            entity.episodesJson?.let { JsonUtils.episodeListAdapter.fromJson(it) }
        } catch (e: Exception) { null }

        val synopsisDetail = entity.synopsis?.let { 
            SynopsisDetail(paragraphs = it.split("\n\n")) 
        }

        val anime = AnimeDetail(
            title = entity.title,
            poster = entity.poster,
            score = entity.rating?.let { ScoreDetail(value = it, users = null) },
            japanese = entity.japanese,
            synonyms = entity.synonyms,
            english = entity.english,
            status = entity.status,
            type = entity.type,
            duration = entity.duration,
            season = entity.season,
            studios = entity.studios,
            producers = entity.producers,
            aired = entity.aired,
            trailer = entity.trailer,
            synopsis = synopsisDetail,
            genreList = genres,
            episodeList = episodes
        )

        return AnimeDetailData(provider = "cache", anime = anime)
    }

    suspend fun fetchAndCacheAnimeDetail(animeId: String): AnimeDetailData? {
        val anilistIdInt = animeId.toIntOrNull()
        if (anilistIdInt != null) {
            // Fetch from AniList GraphQL + Reconsumet Episodes
            try {
                val query = """
                    query (${'$'}id: Int) {
                      Media(id: ${'$'}id, type: ANIME) {
                        id
                        title {
                          romaji
                          english
                          native
                          userPreferred
                        }
                        coverImage {
                          extraLarge
                          large
                          medium
                        }
                        bannerImage
                        description(asHtml: false)
                        season
                        seasonYear
                        format
                        status
                        episodes
                        duration
                        genres
                        averageScore
                        studios(isMain: true) {
                          nodes {
                            name
                          }
                        }
                        trailer {
                          id
                          site
                        }
                      }
                    }
                """.trimIndent()

                val request = GraphQLRequest(query = query, variables = mapOf("id" to anilistIdInt))
                val aniListResponse = RetrofitClient.aniListService.getMediaDetail(request)
                val media = aniListResponse.data?.Media

                if (media != null) {
                    // Fetch episodes from Reconsumet
                    val episodesList = mutableListOf<EpisodeItem>()
                    var selectedProvider = "AnikotoTV"
                    try {
                        val reconsumetResponse = RetrofitClient.reconsumetService.getEpisodes(animeId)
                        val provider = reconsumetResponse.provider ?: "AnikotoTV"
                        selectedProvider = provider
                        val rawEpisodes = reconsumetResponse.episodes ?: emptyList()
                        for (ep in rawEpisodes) {
                            val epNumStr = ep.episodeNumberString.ifBlank { "1" }
                            val epId = "${provider}::${ep.id}"
                            episodesList.add(
                                EpisodeItem(
                                    title = epNumStr,
                                    episodeId = epId,
                                    date = ep.releaseDate,
                                    releasedOn = ep.releaseDate
                                )
                            )
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }

                    val titleDisplay = media.title?.displayTitle.orEmpty()
                    val bannerOrPoster = media.bannerImage?.takeIf { it.isNotBlank() }
                        ?: media.coverImage?.bestImageUrl.orEmpty()
                    val posterImage = media.coverImage?.bestImageUrl.orEmpty()

                    val cleanSynopsis = media.description?.replace(Regex("<[^>]*>"), "")?.trim().orEmpty()
                    val synopsisObj = SynopsisDetail(paragraphs = if (cleanSynopsis.isNotBlank()) listOf(cleanSynopsis) else emptyList())

                    val scoreValue = media.averageScore?.let { String.format(Locale.US, "%.2f", it / 10.0) } ?: "7.50"
                    val scoreDetail = ScoreDetail(value = scoreValue, users = null)

                    val genreItems = media.genres?.map { g ->
                        GenreItem(
                            title = g,
                            genreId = g.lowercase().replace(" ", "-"),
                            isMovie = media.format == "MOVIE"
                        )
                    } ?: emptyList()

                    val studioName = media.studios?.nodes?.firstOrNull()?.name

                    val animeDetail = AnimeDetail(
                        title = titleDisplay,
                        poster = posterImage,
                        score = scoreDetail,
                        japanese = media.title?.native,
                        synonyms = media.title?.romaji,
                        english = media.title?.english,
                        status = media.status ?: "RELEASING",
                        type = media.format ?: "TV",
                        duration = media.duration?.let { "$it Menit" },
                        season = media.season?.let { "$it ${media.seasonYear ?: ""}".trim() },
                        studios = studioName,
                        trailer = media.trailer?.let { if (it.site == "youtube") "https://www.youtube.com/watch?v=${it.id}" else null },
                        synopsis = synopsisObj,
                        genreList = genreItems,
                        episodeList = episodesList
                    )

                    val genresJson = JsonUtils.genreListAdapter.toJson(genreItems)
                    val episodesJson = JsonUtils.episodeListAdapter.toJson(episodesList)
                    val rawJson = try {
                        JsonUtils.animeDetailAdapter.toJson(animeDetail)
                    } catch (e: Exception) { null }

                    val entity = AnimeDetailEntity(
                        animeId = animeId,
                        title = titleDisplay,
                        poster = posterImage,
                        synopsis = cleanSynopsis,
                        rating = scoreValue,
                        genresJson = genresJson,
                        episodesJson = episodesJson,
                        status = animeDetail.status,
                        type = animeDetail.type,
                        duration = animeDetail.duration,
                        japanese = animeDetail.japanese,
                        synonyms = animeDetail.synonyms,
                        english = animeDetail.english,
                        season = animeDetail.season,
                        studios = animeDetail.studios,
                        producers = null,
                        aired = media.seasonYear?.toString(),
                        trailer = animeDetail.trailer,
                        rawDetailJson = rawJson,
                        updatedAt = System.currentTimeMillis()
                    )
                    animeDetailDao.insertAnimeDetail(entity)

                    return AnimeDetailData(provider = selectedProvider, anime = animeDetail)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        // Fallback to old API service for legacy anime slugs if any
        try {
            val response = RetrofitClient.apiService.getAnimeDetail(animeId)
            val data = response.data
            val anime = data?.anime

            if (anime != null) {
                val genresJson = anime.genreList?.let { JsonUtils.genreListAdapter.toJson(it) }
                val episodesJson = anime.episodeList?.let { JsonUtils.episodeListAdapter.toJson(it) }
                val rawJson = try {
                    JsonUtils.animeDetailAdapter.toJson(anime)
                } catch (e: Exception) { null }

                val synopsisStr = anime.synopsis?.paragraphs?.joinToString("\n\n")
                val resolvedTitle = anime.displayTitle.ifBlank { animeId.replace("-", " ").split(" ").joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } } }

                val entity = AnimeDetailEntity(
                    animeId = animeId,
                    title = resolvedTitle,
                    poster = anime.poster,
                    synopsis = synopsisStr,
                    rating = anime.score?.value,
                    genresJson = genresJson,
                    episodesJson = episodesJson,
                    status = anime.status,
                    type = anime.type,
                    duration = anime.duration,
                    japanese = anime.japanese,
                    synonyms = anime.synonyms,
                    english = anime.english,
                    season = anime.season,
                    studios = anime.studios,
                    producers = anime.producers,
                    aired = anime.aired,
                    trailer = anime.trailer,
                    rawDetailJson = rawJson,
                    updatedAt = System.currentTimeMillis()
                )

                animeDetailDao.insertAnimeDetail(entity)
            }
            return data
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return getCachedAnimeDetail(animeId)
    }

    suspend fun getCachedSynopses(animeIds: List<String>): Map<String, String> {
        if (animeIds.isEmpty()) return emptyMap()
        return try {
            val entities = animeDetailDao.getAnimeDetails(animeIds)
            entities.mapNotNull { entity ->
                val syn = entity.synopsis
                if (!syn.isNullOrBlank()) {
                    entity.animeId to syn
                } else null
            }.toMap()
        } catch (e: Exception) {
            emptyMap()
        }
    }

    suspend fun getOrFetchSynopsis(animeId: String): String? {
        try {
            val cached = animeDetailDao.getAnimeDetail(animeId)
            if (cached != null && !cached.synopsis.isNullOrBlank()) {
                return cached.synopsis
            }
            val fresh = fetchAndCacheAnimeDetail(animeId)
            return fresh?.anime?.synopsis?.paragraphs?.joinToString("\n\n")
        } catch (e: Exception) {
            return null
        }
    }
}
