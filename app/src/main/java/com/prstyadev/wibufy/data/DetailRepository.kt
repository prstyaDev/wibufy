package com.prstyadev.wibufy.data

import android.content.Context

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
