package com.prstyadev.wibufy.ui.player

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.prstyadev.wibufy.data.AppDatabase
import com.prstyadev.wibufy.data.EpisodeItem
import com.prstyadev.wibufy.data.JsonUtils
import com.prstyadev.wibufy.data.QualityItem
import com.prstyadev.wibufy.data.RetrofitClient
import com.prstyadev.wibufy.data.StreamData
import com.prstyadev.wibufy.data.WatchHistoryRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.net.UnknownHostException

data class PlayerUiState(
    val isLoading: Boolean = true,
    val streamData: StreamData? = null,
    val currentQuality: String? = null,
    val currentQualityUrl: String? = null,
    val initialPositionMs: Long = 0L,
    val error: String? = null,
    val episodeList: List<EpisodeItem>? = null,
    val previousEpisodeSlug: String? = null,
    val previousEpisodeName: String? = null,
    val nextEpisodeSlug: String? = null,
    val nextEpisodeName: String? = null,
    val hasPreviousEpisode: Boolean = false,
    val hasNextEpisode: Boolean = false
)

class PlayerViewModel(application: Application) : AndroidViewModel(application) {
    private val prefs = application.getSharedPreferences("wibufy_player_prefs", Context.MODE_PRIVATE)
    private val historyRepository = WatchHistoryRepository(application)
    private val animeDetailDao = AppDatabase.getDatabase(application).animeDetailDao()

    companion object {
        const val PREF_SELECTED_QUALITY = "PREF_SELECTED_QUALITY"
    }

    // In-memory stream cache
    private val streamCache = mutableMapOf<String, StreamData>()
    private var cachedEpisodeList: List<EpisodeItem>? = null

    private val _uiState = MutableStateFlow(PlayerUiState())
    val uiState: StateFlow<PlayerUiState> = _uiState.asStateFlow()

    private fun getSavedQuality(): String? {
        return prefs.getString(PREF_SELECTED_QUALITY, null)
    }

    private fun saveQualityPreference(quality: String) {
        prefs.edit().putString(PREF_SELECTED_QUALITY, quality).apply()
    }

    private fun selectBestQuality(data: StreamData?): Pair<String?, String?> {
        val savedQuality = getSavedQuality()
        val defaultQuality = data?.defaultQuality ?: "480p"

        val selectedQualityItem = if (!savedQuality.isNullOrEmpty()) {
            data?.qualities?.find { it.quality.equals(savedQuality, ignoreCase = true) }
                ?: data?.qualities?.find { it.quality.equals(defaultQuality, ignoreCase = true) }
                ?: data?.qualities?.find { it.quality.equals("480p", ignoreCase = true) }
                ?: data?.qualities?.firstOrNull()
        } else {
            data?.qualities?.find { it.quality.equals(defaultQuality, ignoreCase = true) }
                ?: data?.qualities?.find { it.quality.equals("480p", ignoreCase = true) }
                ?: data?.qualities?.firstOrNull()
        }
        return Pair(selectedQualityItem?.quality, selectedQualityItem?.url)
    }

    private suspend fun resolveEpisodes(episodeSlug: String): Triple<List<EpisodeItem>?, Pair<String?, String?>?, Pair<String?, String?>?> {
        // 1. Try finding matching anime in local cache database
        var episodes = cachedEpisodeList
        if (episodes.isNullOrEmpty()) {
            // Extract potential animeId/base slug from episode slug e.g. "shangri-la-frontier-episode-12" -> "shangri-la-frontier"
            val baseSlug = episodeSlug
                .replace(Regex("(?i)-episode-\\d+.*"), "")
                .replace(Regex("(?i)-ep-\\d+.*"), "")
                .trim()

            // Try exact animeId from cache
            val cachedDetail = if (baseSlug.isNotBlank()) {
                animeDetailDao.getAnimeDetail(baseSlug)
            } else null

            val rawDetail = cachedDetail?.rawDetailJson
            if (!rawDetail.isNullOrBlank()) {
                try {
                    val anime = JsonUtils.animeDetailAdapter.fromJson(rawDetail)
                    episodes = anime?.episodeList
                } catch (e: Exception) {
                    // ignore
                }
            }
            if (episodes.isNullOrEmpty() && cachedDetail?.episodesJson != null) {
                try {
                    episodes = JsonUtils.episodeListAdapter.fromJson(cachedDetail.episodesJson)
                } catch (e: Exception) {
                    // ignore
                }
            }

            if (episodes != null) {
                cachedEpisodeList = episodes
            }
        }

        // If we have actual episodeList from anime details
        if (!episodes.isNullOrEmpty()) {
            val currentIndex = episodes.indexOfFirst { ep ->
                val id = ep.episodeId?.trim()
                id != null && (id.equals(episodeSlug.trim(), ignoreCase = true) || id.contains(episodeSlug.trim(), ignoreCase = true) || episodeSlug.trim().contains(id, ignoreCase = true))
            }

            // If found in episodeList
            if (currentIndex >= 0) {
                // Samehadaku API episodeList is usually ordered newest first (e.g. Ep 12 at index 0, Ep 1 at index 11)
                // Let's check chronological ordering based on parsed number
                val currentEpNumber = episodes[currentIndex].title.toString().toDoubleOrNull()?.toInt()
                    ?: Regex("\\d+").find(episodes[currentIndex].title.toString())?.value?.toIntOrNull()
                    ?: (episodes.size - currentIndex)

                // Try to find previous episode (currentEpNumber - 1) and next episode (currentEpNumber + 1)
                val prevEpItem = if (currentEpNumber > 1) {
                    episodes.find { ep ->
                        val num = ep.title.toString().toDoubleOrNull()?.toInt()
                            ?: Regex("\\d+").find(ep.title.toString())?.value?.toIntOrNull()
                        num == currentEpNumber - 1
                    } ?: if (currentIndex + 1 < episodes.size && currentEpNumber > 1) episodes[currentIndex + 1] else null
                } else null

                val nextEpItem = episodes.find { ep ->
                    val num = ep.title.toString().toDoubleOrNull()?.toInt()
                        ?: Regex("\\d+").find(ep.title.toString())?.value?.toIntOrNull()
                    num == currentEpNumber + 1
                } ?: if (currentIndex - 1 >= 0) episodes[currentIndex - 1] else null

                val prevPair = if (prevEpItem?.episodeId != null && currentEpNumber > 1) {
                    val prevNum = prevEpItem.title.toString().toDoubleOrNull()?.toInt()?.toString() ?: prevEpItem.title.toString()
                    Pair(prevEpItem.episodeId, "Episode $prevNum")
                } else null

                val nextPair = if (nextEpItem?.episodeId != null) {
                    val nextNum = nextEpItem.title.toString().toDoubleOrNull()?.toInt()?.toString() ?: nextEpItem.title.toString()
                    Pair(nextEpItem.episodeId, "Episode $nextNum")
                } else null

                return Triple(episodes, prevPair, nextPair)
            }
        }

        // Fallback: Pure regex pattern computation
        val epMatch = Regex("(?i)episode[-_]?(\\d+)").find(episodeSlug)
            ?: Regex("(?i)ep[-_]?(\\d+)").find(episodeSlug)
        val epInt = epMatch?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 1

        val prevPair = if (epInt > 1) {
            val prevEpInt = epInt - 1
            val slugRegex = Regex("(?i)(episode[-_]?)(\\d+)")
            val prevSlug = if (slugRegex.containsMatchIn(episodeSlug)) {
                slugRegex.replace(episodeSlug) { m -> "${m.groupValues[1]}$prevEpInt" }
            } else {
                val altRegex = Regex("(?i)(ep[-_]?)(\\d+)")
                if (altRegex.containsMatchIn(episodeSlug)) {
                    altRegex.replace(episodeSlug) { m -> "${m.groupValues[1]}$prevEpInt" }
                } else {
                    "${episodeSlug}-$prevEpInt"
                }
            }
            Pair(prevSlug, "Episode $prevEpInt")
        } else {
            null // Episode 1 has NO previous episode!
        }

        // For next episode fallback: if episode > 0 and slug is formatted
        val nextEpInt = epInt + 1
        val slugRegex = Regex("(?i)(episode[-_]?)(\\d+)")
        val nextSlug = if (slugRegex.containsMatchIn(episodeSlug)) {
            slugRegex.replace(episodeSlug) { m -> "${m.groupValues[1]}$nextEpInt" }
        } else {
            val altRegex = Regex("(?i)(ep[-_]?)(\\d+)")
            if (altRegex.containsMatchIn(episodeSlug)) {
                altRegex.replace(episodeSlug) { m -> "${m.groupValues[1]}$nextEpInt" }
            } else {
                "${episodeSlug}-$nextEpInt"
            }
        }
        val nextPair = Pair(nextSlug, "Episode $nextEpInt")

        return Triple(episodes, prevPair, nextPair)
    }

    fun loadStream(episodeSlug: String) {
        viewModelScope.launch {
            val savedHistory = historyRepository.getHistory(episodeSlug)
            val initialPos = savedHistory?.lastPositionMs ?: 0L

            val (resolvedEpisodes, prevPair, nextPair) = resolveEpisodes(episodeSlug)

            // Check cache first
            val cachedStream = streamCache[episodeSlug]
            if (cachedStream != null) {
                val (qualityName, qualityUrl) = selectBestQuality(cachedStream)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        streamData = cachedStream,
                        currentQuality = qualityName,
                        currentQualityUrl = qualityUrl,
                        initialPositionMs = initialPos,
                        error = null,
                        episodeList = resolvedEpisodes,
                        previousEpisodeSlug = prevPair?.first,
                        previousEpisodeName = prevPair?.second,
                        nextEpisodeSlug = nextPair?.first,
                        nextEpisodeName = nextPair?.second,
                        hasPreviousEpisode = prevPair != null && !prevPair.first.isNullOrBlank(),
                        hasNextEpisode = nextPair != null && !nextPair.first.isNullOrBlank()
                    )
                }
                return@launch
            }

            _uiState.update { 
                it.copy(
                    isLoading = true, 
                    error = null, 
                    initialPositionMs = initialPos,
                    episodeList = resolvedEpisodes,
                    previousEpisodeSlug = prevPair?.first,
                    previousEpisodeName = prevPair?.second,
                    nextEpisodeSlug = nextPair?.first,
                    nextEpisodeName = nextPair?.second,
                    hasPreviousEpisode = prevPair != null && !prevPair.first.isNullOrBlank(),
                    hasNextEpisode = nextPair != null && !nextPair.first.isNullOrBlank()
                ) 
            }
            try {
                val data: StreamData? = if (episodeSlug.contains("::")) {
                    val parts = episodeSlug.split("::")
                    val provider = parts[0]
                    val epId = parts.drop(1).joinToString("::")
                    val watchRes = RetrofitClient.reconsumetService.getWatchSources(provider = provider, episodeId = epId)
                    val server = watchRes.sub?.firstOrNull() ?: watchRes.dub?.firstOrNull()
                    val sources = server?.sources ?: emptyList()
                    val qualityItems = sources.map { src ->
                        val rawQ = src.quality?.trim() ?: "Auto"
                        val normalizedQuality = when {
                            rawQ.equals("auto", ignoreCase = true) -> "Auto"
                            rawQ.equals("900", ignoreCase = true) -> "1080p"
                            rawQ.contains("1080") -> "1080p"
                            rawQ.contains("720") -> "720p"
                            rawQ.contains("480") -> "480p"
                            rawQ.contains("360") -> "360p"
                            rawQ.endsWith("p", ignoreCase = true) -> rawQ
                            else -> "${rawQ}p"
                        }
                        QualityItem(
                            quality = normalizedQuality,
                            provider = provider,
                            type = if (src.isM3U8 == true) "m3u8" else "mp4",
                            url = src.url,
                            rawUrl = src.rawUrl,
                            headers = server?.headers
                        )
                    }

                    StreamData(
                        title = null,
                        episodeSlug = episodeSlug,
                        defaultQuality = qualityItems.firstOrNull()?.quality ?: "Auto",
                        qualities = qualityItems,
                        subtitles = server?.subtitles,
                        headers = server?.headers
                    )
                } else {
                    val response = RetrofitClient.apiService.getStreamEngine(episodeSlug)
                    response.data
                }

                if (data != null) {
                    streamCache[episodeSlug] = data
                }

                val (qualityName, qualityUrl) = selectBestQuality(data)

                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        streamData = data,
                        currentQuality = qualityName,
                        currentQualityUrl = qualityUrl,
                        initialPositionMs = initialPos
                    )
                }
            } catch (e: UnknownHostException) {
                _uiState.update { it.copy(isLoading = false, error = "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.") }
            } catch (e: IOException) {
                _uiState.update { it.copy(isLoading = false, error = "Kesalahan jaringan: ${e.message}") }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "Terjadi kesalahan") }
            }
        }
    }

    fun saveProgress(
        episodeSlug: String,
        animeTitle: String?,
        episodeName: String?,
        posterUrl: String?,
        lastPositionMs: Long,
        totalDurationMs: Long
    ) {
        if (lastPositionMs <= 0 && totalDurationMs <= 0) return
        viewModelScope.launch {
            historyRepository.saveProgress(
                episodeSlug = episodeSlug,
                animeTitle = animeTitle,
                episodeName = episodeName,
                posterUrl = posterUrl,
                lastPositionMs = lastPositionMs,
                totalDurationMs = totalDurationMs
            )
        }
    }

    fun changeQuality(qualityItem: QualityItem) {
        val qualityName = qualityItem.quality
        val url = qualityItem.url ?: return
        if (!qualityName.isNullOrEmpty()) {
            saveQualityPreference(qualityName)
        }
        _uiState.update { 
            it.copy(
                currentQuality = qualityName,
                currentQualityUrl = url
            ) 
        }
    }
}
