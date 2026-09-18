package com.prstyadev.wibufy.data

import android.content.Context
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale

data class ScheduleFetchResult(
    val scheduleMap: Map<Int, List<ScheduleAnimeItem>>,
    val ongoingList: List<AnimeItem>
)

class ScheduleRepository(context: Context) {
    private val database = AppDatabase.getDatabase(context)
    private val scheduleCacheDao = database.scheduleCacheDao()
    private val homeCacheDao = database.homeCacheDao()

    suspend fun getCachedSchedule(): Map<Int, List<ScheduleAnimeItem>> {
        val cachedEntities = scheduleCacheDao.getAllScheduleCache()
        if (cachedEntities.isEmpty()) return emptyMap()

        val resultMap = mutableMapOf<Int, List<ScheduleAnimeItem>>()
        for (entity in cachedEntities) {
            val dayIndex = entity.dayName.toIntOrNull() ?: continue
            try {
                val animeList = JsonUtils.scheduleAnimeListAdapter.fromJson(entity.jsonContent)
                if (animeList != null) {
                    resultMap[dayIndex] = animeList
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        return resultMap
    }

    suspend fun getCachedOngoingAnime(): List<AnimeItem> {
        val list = mutableListOf<AnimeItem>()
        try {
            val page1Entity = homeCacheDao.getHomeCache("recent_anime_page1")
            if (page1Entity != null) {
                val p1 = JsonUtils.animeItemListAdapter.fromJson(page1Entity.jsonContent)
                if (!p1.isNullOrEmpty()) list.addAll(p1)
            }
            val page2Entity = homeCacheDao.getHomeCache("recent_anime_page2")
            if (page2Entity != null) {
                val p2 = JsonUtils.animeItemListAdapter.fromJson(page2Entity.jsonContent)
                if (!p2.isNullOrEmpty()) list.addAll(p2)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return list
    }

    suspend fun fetchAndCacheSchedule(): ScheduleFetchResult = coroutineScope {
        val zone = try { ZoneId.systemDefault() } catch (e: Exception) { ZoneId.of("Asia/Jakarta") }
        val today = LocalDate.now(zone)
        val dayOfWeekValue = today.dayOfWeek.value % 7
        val sunday = today.minusDays(dayOfWeekValue.toLong())
        val weekStartEpoch = sunday.atStartOfDay(zone).toEpochSecond()
        val weekEndEpoch = weekStartEpoch + (7 * 24 * 3600)

        val scheduleDeferred = async {
            try {
                val query = """
                    query (${'$'}start: Int, ${'$'}end: Int) {
                      Page(page: 1, perPage: 50) {
                        airingSchedules(airingAt_greater: ${'$'}start, airingAt_lesser: ${'$'}end, sort: TIME) {
                          id
                          episode
                          airingAt
                          timeUntilAiring
                          media {
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
                            averageScore
                            genres
                            format
                          }
                        }
                      }
                    }
                """.trimIndent()

                val request = GraphQLRequest(
                    query = query,
                    variables = mapOf(
                        "start" to weekStartEpoch.toInt(),
                        "end" to weekEndEpoch.toInt()
                    )
                )

                val response = RetrofitClient.aniListService.getScheduleData(request)
                response.data?.Page?.airingSchedules ?: emptyList()
            } catch (e: Exception) {
                e.printStackTrace()
                emptyList()
            }
        }

        val ongoingDeferred = async {
            try {
                val query = """
                    query {
                      Page(page: 1, perPage: 24) {
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
                          episodes
                          nextAiringEpisode {
                            episode
                          }
                          averageScore
                          genres
                          format
                          status
                        }
                      }
                    }
                """.trimIndent()
                val request = GraphQLRequest(query = query)
                val response = RetrofitClient.aniListService.getSearchData(request)
                response.data?.Page?.media?.map { HomeRepository.mapAniListMediaToAnimeItem(it) } ?: emptyList()
            } catch (e: Exception) {
                e.printStackTrace()
                emptyList()
            }
        }

        val airingList = scheduleDeferred.await()
        val ongoingList = ongoingDeferred.await()

        val scheduleMap = mutableMapOf<Int, MutableList<ScheduleAnimeItem>>()
        for (i in 0..6) {
            scheduleMap[i] = mutableListOf()
        }

        for (item in airingList) {
            val airingAtSeconds = item.airingAt ?: continue
            val media = item.media ?: continue
            val dateTime = Instant.ofEpochSecond(airingAtSeconds).atZone(zone)
            val dayIndex = dateTime.dayOfWeek.value % 7
            val timeStr = String.format(Locale.US, "%02d:%02d", dateTime.hour, dateTime.minute)
            val scoreStr = media.averageScore?.let { String.format(Locale.US, "%.1f", it / 10.0) } ?: "7.5"
            val estimation = if ((item.timeUntilAiring ?: 0) > 0) timeStr else "Sudah Tayang"

            val scheduleItem = ScheduleAnimeItem(
                title = media.title?.displayTitle ?: "",
                poster = media.coverImage?.bestImageUrl ?: "",
                type = media.format ?: "TV",
                score = scoreStr,
                estimation = estimation,
                genres = media.genres?.joinToString(", ") ?: "",
                animeId = media.id.toString(),
                episodes = "Ep ${item.episode ?: 1}",
                time = timeStr
            )
            scheduleMap[dayIndex]?.add(scheduleItem)
        }

        // Cache schedule
        if (airingList.isNotEmpty()) {
            val entities = scheduleMap.map { (dayIndex, animeList) ->
                val json = JsonUtils.scheduleAnimeListAdapter.toJson(animeList)
                ScheduleCacheEntity(
                    dayName = dayIndex.toString(),
                    jsonContent = json,
                    updatedAt = System.currentTimeMillis()
                )
            }
            scheduleCacheDao.insertAll(entities)
        }

        // Cache ongoing
        if (ongoingList.isNotEmpty()) {
            val p1 = ongoingList.take(12)
            val p2 = ongoingList.drop(12).take(12)
            if (p1.isNotEmpty()) {
                homeCacheDao.insertHomeCache(
                    HomeCacheEntity(
                        sectionKey = "recent_anime_page1",
                        jsonContent = JsonUtils.animeItemListAdapter.toJson(p1),
                        updatedAt = System.currentTimeMillis()
                    )
                )
            }
            if (p2.isNotEmpty()) {
                homeCacheDao.insertHomeCache(
                    HomeCacheEntity(
                        sectionKey = "recent_anime_page2",
                        jsonContent = JsonUtils.animeItemListAdapter.toJson(p2),
                        updatedAt = System.currentTimeMillis()
                    )
                )
            }
        }

        val finalOngoing = if (ongoingList.isNotEmpty()) ongoingList else getCachedOngoingAnime()
        val finalScheduleMap: Map<Int, List<ScheduleAnimeItem>> = if (airingList.isNotEmpty()) {
            scheduleMap
        } else {
            getCachedSchedule()
        }

        ScheduleFetchResult(
            scheduleMap = finalScheduleMap,
            ongoingList = finalOngoing
        )
    }
}
