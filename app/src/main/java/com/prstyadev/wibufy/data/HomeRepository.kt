package com.prstyadev.wibufy.data

import android.content.Context
import java.util.Locale

class HomeRepository(context: Context) {
    private val homeCacheDao = AppDatabase.getDatabase(context).homeCacheDao()

    companion object {
        fun mapAniListMediaToAnimeItem(media: AniListMedia): AnimeItem {
            val title = media.title?.displayTitle ?: ""
            val poster = media.coverImage?.bestImageUrl ?: ""
            val epText = media.nextAiringEpisode?.let { 
                val currentAired = (it.episode ?: 2) - 1
                "Ep ${currentAired.coerceAtLeast(1)}"
            } ?: media.episodes?.let { "Ep $it" } ?: "Ongoing"

            val scoreStr = media.averageScore?.let {
                String.format(Locale.US, "%.1f", it / 10.0)
            } ?: "7.5"
            val genresStr = media.genres?.joinToString(", ") ?: ""
            val synopsisClean = media.description?.replace(Regex("<[^>]*>"), "")?.trim()

            return AnimeItem(
                title = title,
                poster = poster,
                episodes = epText,
                releasedOn = media.seasonYear?.toString() ?: "",
                animeId = media.id.toString(),
                type = media.format ?: "TV",
                status = media.status ?: "RELEASING",
                score = scoreStr,
                synopsis = synopsisClean,
                description = synopsisClean,
                genres = genresStr
            )
        }
    }

    suspend fun getCachedRecentAnime(sectionKey: String = "recent_anime_page1"): List<AnimeItem>? {
        val entity = homeCacheDao.getHomeCache(sectionKey) ?: return null
        return try {
            JsonUtils.animeItemListAdapter.fromJson(entity.jsonContent)
        } catch (e: Exception) {
            null
        }
    }

    suspend fun getCachedPage2Anime(sectionKey: String = "recent_anime_page2"): List<AnimeItem>? {
        val entity = homeCacheDao.getHomeCache(sectionKey) ?: return null
        return try {
            JsonUtils.animeItemListAdapter.fromJson(entity.jsonContent)
        } catch (e: Exception) {
            null
        }
    }

    suspend fun fetchAndCacheRecentAnime(page: Int = 1): Pair<RecentData?, List<AnimeItem>> {
        val sectionKey = if (page == 1) "recent_anime_page1" else "recent_anime_page2"
        try {
            val query = """
                query (${'$'}page: Int, ${'$'}perPage: Int) {
                  Page(page: ${'$'}page, perPage: ${'$'}perPage) {
                    pageInfo {
                      hasNextPage
                    }
                    media(type: ANIME, status_in: [RELEASING], sort: [TRENDING_DESC]) {
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
                      episodes
                      nextAiringEpisode {
                        episode
                        airingAt
                        timeUntilAiring
                      }
                      averageScore
                      genres
                      format
                      status
                      seasonYear
                      description(asHtml: false)
                    }
                  }
                }
            """.trimIndent()

            val request = GraphQLRequest(
                query = query,
                variables = mapOf("page" to page, "perPage" to 12)
            )

            val response = RetrofitClient.aniListService.getSearchData(request)
            val mediaList = response.data?.Page?.media ?: emptyList()
            if (mediaList.isNotEmpty()) {
                val items = mediaList.map { mapAniListMediaToAnimeItem(it) }
                val json = JsonUtils.animeItemListAdapter.toJson(items)
                homeCacheDao.insertHomeCache(
                    HomeCacheEntity(
                        sectionKey = sectionKey,
                        jsonContent = json,
                        updatedAt = System.currentTimeMillis()
                    )
                )
                val recentData = RecentData(
                    provider = "AniList",
                    page = page,
                    itemCount = items.size,
                    animeList = items
                )
                return Pair(recentData, items)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // Fallback to cache if available
        val cached = if (page == 1) getCachedRecentAnime() else getCachedPage2Anime()
        if (!cached.isNullOrEmpty()) {
            return Pair(RecentData(animeList = cached, page = page), cached)
        }

        return Pair(null, emptyList())
    }

    suspend fun getCachedCompletedAnime(): List<AnimeItem>? {
        val entity = homeCacheDao.getHomeCache("completed_anime") ?: return null
        return try {
            JsonUtils.animeItemListAdapter.fromJson(entity.jsonContent)
        } catch (e: Exception) {
            null
        }
    }

    suspend fun fetchAndCacheCompletedAnime(): List<AnimeItem> {
        try {
            val query = """
                query {
                  Page(page: 1, perPage: 33) {
                    media(type: ANIME, status: FINISHED, sort: [POPULARITY_DESC]) {
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
                      episodes
                      averageScore
                      genres
                      format
                      status
                      seasonYear
                      description(asHtml: false)
                    }
                  }
                }
            """.trimIndent()

            val request = GraphQLRequest(query = query)
            val response = RetrofitClient.aniListService.getSearchData(request)
            val mediaList = response.data?.Page?.media ?: emptyList()
            if (mediaList.isNotEmpty()) {
                val items = mediaList.map { media ->
                    val item = mapAniListMediaToAnimeItem(media)
                    item.copy(status = "Completed", episodes = media.episodes?.let { "$it" } ?: "12")
                }
                val json = JsonUtils.animeItemListAdapter.toJson(items)
                homeCacheDao.insertHomeCache(
                    HomeCacheEntity(
                        sectionKey = "completed_anime",
                        jsonContent = json,
                        updatedAt = System.currentTimeMillis()
                    )
                )
                return items
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return getCachedCompletedAnime() ?: getDefaultCompletedAnime()
    }

    fun getDefaultCompletedAnime(): List<AnimeItem> {
        return listOf(
            AnimeItem(title = "Needy Girl Overdose", animeId = "needy-girl-overdose-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/04/Needy-Girl-Overdose.jpg", episodes = "13", score = "7.01"),
            AnimeItem(title = "Snowball Earth", animeId = "snowball-earth-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/04/Snowball-Earth.jpg", episodes = "13", score = "6.53"),
            AnimeItem(title = "Koori no Jouheki", animeId = "koori-no-jouheki-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/04/Koori-no-Jouheki.jpg", episodes = "14", score = "7.02"),
            AnimeItem(title = "Hidarikiki no Eren", animeId = "hidarikiki-no-eren-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/04/Hidarikiki-no-Eren.jpg", episodes = "13", score = "6.54"),
            AnimeItem(title = "Replica datte, Koi wo Suru.", animeId = "replica-datte-koi-wo-suru-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/04/Replica-datte-Koi-wo-Suru.jpg", episodes = "13", score = "6.84"),
            AnimeItem(title = "Aishiteru Game wo Owarasetai", animeId = "aishiteru-game-wo-owarasetai-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/04/Aishiteru-Game-wo-Owarasetai.jpg", episodes = "12", score = "7.01"),
            AnimeItem(title = "Sousou no Frieren", animeId = "sousou-no-frieren-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/09/Sousou-no-Frieren.jpg", episodes = "28", score = "9.38"),
            AnimeItem(title = "Oshi no Ko", animeId = "oshi-no-ko-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/04/Oshi-no-Ko.jpg", episodes = "11", score = "8.75"),
            AnimeItem(title = "Chainsaw Man", animeId = "chainsaw-man-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/10/Chainsaw-Man.jpg", episodes = "12", score = "8.52"),
            AnimeItem(title = "Cyberpunk: Edgerunners", animeId = "cyberpunk-edgerunners-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/09/Cyberpunk-Edgerunners.jpg", episodes = "10", score = "8.60"),
            AnimeItem(title = "Kimetsu no Yaiba: Yuukaku-hen", animeId = "kimetsu-no-yaiba-yuukaku-hen-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2021/12/Kimetsu-no-Yaiba-Yuukaku-hen.jpg", episodes = "11", score = "8.81"),
            AnimeItem(title = "Jujutsu Kaisen Season 2", animeId = "jujutsu-kaisen-s2-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/07/Jujutsu-Kaisen-Season-2.jpg", episodes = "23", score = "8.84"),
            AnimeItem(title = "Bocchi the Rock!", animeId = "bocchi-the-rock-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/10/Bocchi-the-Rock.jpg", episodes = "12", score = "8.78"),
            AnimeItem(title = "Mob Psycho 100 III", animeId = "mob-psycho-100-s3-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/10/Mob-Psycho-100-III.jpg", episodes = "12", score = "8.89"),
            AnimeItem(title = "Bleach: Sennen Kessen-hen", animeId = "bleach-sennen-kessen-hen-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/10/Bleach-Sennen-Kessen-hen.jpg", episodes = "13", score = "9.05"),
            AnimeItem(title = "Spy x Family Season 2", animeId = "spy-x-family-s2-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/10/Spy-x-Family-Season-2.jpg", episodes = "12", score = "8.15"),
            AnimeItem(title = "Mashle: Magic and Muscles", animeId = "mashle-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/04/Mashle.jpg", episodes = "12", score = "7.58"),
            AnimeItem(title = "Dr. Stone: New World", animeId = "dr-stone-s3-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/04/Dr.-Stone-New-World.jpg", episodes = "11", score = "8.25"),
            AnimeItem(title = "Hell's Paradise", animeId = "jigokuraku-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/04/Jigokuraku.jpg", episodes = "13", score = "8.12"),
            AnimeItem(title = "Vinland Saga Season 2", animeId = "vinland-saga-s2-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/01/Vinland-Saga-Season-2.jpg", episodes = "24", score = "8.78"),
            AnimeItem(title = "Horimiya: Piece", animeId = "horimiya-piece-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/07/Horimiya-Piece.jpg", episodes = "13", score = "8.22"),
            AnimeItem(title = "Zom 100: Bucket List of the Dead", animeId = "zom-100-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/07/Zom-100.jpg", episodes = "12", score = "7.84"),
            AnimeItem(title = "Mushoku Tensei Season 2", animeId = "mushoku-tensei-s2-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/07/Mushoku-Tensei-Season-2.jpg", episodes = "12", score = "8.48"),
            AnimeItem(title = "Tengoku Daimakyou", animeId = "tengoku-daimakyou-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2023/04/Tengoku-Daimakyou.jpg", episodes = "13", score = "8.18"),
            AnimeItem(title = "Blue Lock", animeId = "blue-lock-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/10/Blue-Lock.jpg", episodes = "24", score = "8.26"),
            AnimeItem(title = "Kage no Jitsuryokusha ni Naritakute!", animeId = "kage-no-jitsuryokusha-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/10/Kage-no-Jitsuryokusha-ni-Naritakute.jpg", episodes = "20", score = "8.31"),
            AnimeItem(title = "Overlord IV", animeId = "overlord-s4-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/07/Overlord-IV.jpg", episodes = "13", score = "8.06"),
            AnimeItem(title = "Made in Abyss Season 2", animeId = "made-in-abyss-s2-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/07/Made-in-Abyss-Retsujitsu-no-Ougonkyou.jpg", episodes = "12", score = "8.72"),
            AnimeItem(title = "Call of the Night", animeId = "yofukashi-no-uta-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/07/Yofukashi-no-Uta.jpg", episodes = "13", score = "7.96"),
            AnimeItem(title = "Lycoris Recoil", animeId = "lycoris-recoil-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/07/Lycoris-Recoil.jpg", episodes = "13", score = "8.14"),
            AnimeItem(title = "Summer Time Rendering", animeId = "summer-time-rendering-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/04/Summer-Time-Rendering.jpg", episodes = "25", score = "8.51"),
            AnimeItem(title = "Kaguya-sama: Ultra Romantic", animeId = "kaguya-sama-s3-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/04/Kaguya-sama-wa-Kokurasetai-Ultra-Romantic.jpg", episodes = "13", score = "9.05"),
            AnimeItem(title = "Classroom of the Elite Season 2", animeId = "youkoso-jitsuryoku-s2-sub-indo", poster = "https://samehadaku.email/wp-content/uploads/2022/07/Youkoso-Jitsuryoku-Shijou-Shugi-no-Kyoushitsu-e-2nd-Season.jpg", episodes = "13", score = "8.11")
        )
    }

    suspend fun getCachedGenres(): List<GenreItem>? {
        val entity = homeCacheDao.getHomeCache("genres_list") ?: return null
        return try {
            JsonUtils.genreListAdapter.fromJson(entity.jsonContent)
        } catch (e: Exception) {
            null
        }
    }

    suspend fun fetchAndCacheGenres(): List<GenreItem> {
        val defaultList = getDefaultGenres()
        val fetchedList = try {
            val response = RetrofitClient.apiService.getGenres()
            val apiGenres = response.data?.genreList ?: emptyList()
            if (apiGenres.isNotEmpty()) {
                val cleanedApiGenres = apiGenres
                    .filter { genre ->
                        val title = genre.title ?: ""
                        val id = genre.genreId ?: title.lowercase().replace(" ", "-")
                        !title.equals("movie", ignoreCase = true) && !id.equals("movie", ignoreCase = true)
                    }
                    .map { genre ->
                        val title = genre.title ?: ""
                        val id = genre.genreId ?: title.lowercase().replace(" ", "-")
                        val displayTitle = if (title.equals("ecchi", ignoreCase = true)) "Ec*hi" else title
                        genre.copy(title = displayTitle, genreId = id, isMovie = false)
                    }

                // Merge with default list so all 37+ mockup genres are guaranteed to exist
                val mergedMap = mutableMapOf<String, GenreItem>()
                defaultList.forEach { item ->
                    val key = item.genreId ?: item.title?.lowercase().orEmpty()
                    mergedMap[key] = item
                }
                cleanedApiGenres.forEach { item ->
                    val key = item.genreId ?: item.title?.lowercase().orEmpty()
                    mergedMap[key] = item
                }

                val movieItem = GenreItem(title = "Movie", genreId = "movie", isMovie = true)
                val result = mutableListOf<GenreItem>()
                result.add(movieItem)
                val others = mergedMap.values
                    .filter { !it.isMovie && !it.title.equals("movie", ignoreCase = true) }
                    .sortedBy { it.title?.lowercase() }
                result.addAll(others)
                result
            } else {
                defaultList
            }
        } catch (e: Exception) {
            getCachedGenres() ?: defaultList
        }

        try {
            val json = JsonUtils.genreListAdapter.toJson(fetchedList)
            homeCacheDao.insertHomeCache(
                HomeCacheEntity(
                    sectionKey = "genres_list",
                    jsonContent = json,
                    updatedAt = System.currentTimeMillis()
                )
            )
        } catch (e: Exception) {
            // ignore cache write error
        }

        return fetchedList
    }

    fun getDefaultGenres(): List<GenreItem> {
        val defaultList = listOf(
            GenreItem(title = "Movie", genreId = "movie", isMovie = true),
            GenreItem(title = "Action", genreId = "action"),
            GenreItem(title = "Adventure", genreId = "adventure"),
            GenreItem(title = "Comedy", genreId = "comedy"),
            GenreItem(title = "Demons", genreId = "demons"),
            GenreItem(title = "Drama", genreId = "drama"),
            GenreItem(title = "Ec*hi", genreId = "ecchi"),
            GenreItem(title = "Fantasy", genreId = "fantasy"),
            GenreItem(title = "Game", genreId = "game"),
            GenreItem(title = "Harem", genreId = "harem"),
            GenreItem(title = "Historical", genreId = "historical"),
            GenreItem(title = "Horror", genreId = "horror"),
            GenreItem(title = "Josei", genreId = "josei"),
            GenreItem(title = "Magic", genreId = "magic"),
            GenreItem(title = "Martial Arts", genreId = "martial-arts"),
            GenreItem(title = "Mecha", genreId = "mecha"),
            GenreItem(title = "Military", genreId = "military"),
            GenreItem(title = "Music", genreId = "music"),
            GenreItem(title = "Mystery", genreId = "mystery"),
            GenreItem(title = "Psychological", genreId = "psychological"),
            GenreItem(title = "Parody", genreId = "parody"),
            GenreItem(title = "Police", genreId = "police"),
            GenreItem(title = "Romance", genreId = "romance"),
            GenreItem(title = "Samurai", genreId = "samurai"),
            GenreItem(title = "School", genreId = "school"),
            GenreItem(title = "Sci-Fi", genreId = "sci-fi"),
            GenreItem(title = "Seinen", genreId = "seinen"),
            GenreItem(title = "Shoujo", genreId = "shoujo"),
            GenreItem(title = "Shoujo Ai", genreId = "shoujo-ai"),
            GenreItem(title = "Shounen", genreId = "shounen"),
            GenreItem(title = "Slice of Life", genreId = "slice-of-life"),
            GenreItem(title = "Sports", genreId = "sports"),
            GenreItem(title = "Space", genreId = "space"),
            GenreItem(title = "Super Power", genreId = "super-power"),
            GenreItem(title = "Supernatural", genreId = "supernatural"),
            GenreItem(title = "Thriller", genreId = "thriller"),
            GenreItem(title = "Vampire", genreId = "vampire")
        )
        return defaultList
    }
}
