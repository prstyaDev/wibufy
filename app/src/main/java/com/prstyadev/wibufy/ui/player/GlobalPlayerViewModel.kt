package com.prstyadev.wibufy.ui.player

import android.app.Application
import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import com.prstyadev.wibufy.data.AppDatabase
import com.prstyadev.wibufy.data.BookmarkEntity
import com.prstyadev.wibufy.data.EpisodeItem
import com.prstyadev.wibufy.data.JsonUtils
import com.prstyadev.wibufy.data.QualityItem
import com.prstyadev.wibufy.data.RetrofitClient
import com.prstyadev.wibufy.data.StreamData
import com.prstyadev.wibufy.data.WatchHistoryRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.IOException
import java.net.UnknownHostException

data class GlobalPlayerUiState(
    val isActive: Boolean = false,
    val isMinimized: Boolean = false,
    val episodeSlug: String = "",
    val animeTitle: String? = null,
    val episodeName: String? = null,
    val posterUrl: String? = null,
    val streamData: StreamData? = null,
    val currentQuality: String? = null,
    val currentQualityUrl: String? = null,
    val isLoading: Boolean = false,
    val isBuffering: Boolean = false,
    val isPlaying: Boolean = false,
    val currentPositionMs: Long = 0L,
    val totalDurationMs: Long = 0L,
    val bufferedPositionMs: Long = 0L,
    val initialPositionMs: Long = 0L,
    val playbackSpeed: Float = 1.0f,
    val isAutonextEnabled: Boolean = true,
    val error: String? = null,
    val releaseDate: String? = null,
    val episodeList: List<EpisodeItem>? = null,
    val previousEpisodeSlug: String? = null,
    val previousEpisodeName: String? = null,
    val nextEpisodeSlug: String? = null,
    val nextEpisodeName: String? = null,
    val hasPreviousEpisode: Boolean = false,
    val hasNextEpisode: Boolean = false,
    val synopsis: String? = null,
    val animeId: String? = null,
    val isBookmarked: Boolean = false
)

@OptIn(UnstableApi::class)
class GlobalPlayerViewModel(application: Application) : AndroidViewModel(application) {
    private val context = application.applicationContext
    private val prefs = context.getSharedPreferences("wibufy_player_prefs", Context.MODE_PRIVATE)
    private val historyRepository = WatchHistoryRepository(application)
    private val animeDetailDao = AppDatabase.getDatabase(application).animeDetailDao()
    private val bookmarkDao = AppDatabase.getDatabase(application).bookmarkDao()
    private var bookmarkObserveJob: Job? = null

    companion object {
        const val PREF_SELECTED_QUALITY = "PREF_SELECTED_QUALITY"
        private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }

    val exoPlayer: ExoPlayer by lazy {
        val renderersFactory = DefaultRenderersFactory(context).apply {
            setEnableDecoderFallback(true)
        }
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .build()

        ExoPlayer.Builder(context, renderersFactory).build().apply {
            setAudioAttributes(audioAttributes, true)
            playWhenReady = true
        }
    }

    private val streamCache = mutableMapOf<String, StreamData>()
    private var cachedEpisodeList: List<EpisodeItem>? = null
    private var progressTrackingJob: Job? = null
    private var hasAppliedInitialSeek = false
    private var hasRetriedWithFallback = false

    private val _uiState = MutableStateFlow(GlobalPlayerUiState())
    val uiState: StateFlow<GlobalPlayerUiState> = _uiState.asStateFlow()

    init {
        setupPlayerListener()
        startPositionTracker()
    }

    private fun setupPlayerListener() {
        exoPlayer.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                val buffering = (playbackState == Player.STATE_BUFFERING)
                _uiState.update { it.copy(isBuffering = buffering) }

                if (playbackState == Player.STATE_READY && !hasAppliedInitialSeek) {
                    val initialPos = _uiState.value.initialPositionMs
                    if (initialPos > 0 && (exoPlayer.duration <= 0 || initialPos < exoPlayer.duration - 5000)) {
                        exoPlayer.seekTo(initialPos)
                    }
                    hasAppliedInitialSeek = true
                } else if (playbackState == Player.STATE_ENDED) {
                    if (_uiState.value.isAutonextEnabled && _uiState.value.hasNextEpisode) {
                        playNext()
                    }
                }
            }

            override fun onIsPlayingChanged(playing: Boolean) {
                _uiState.update { it.copy(isPlaying = playing) }
            }

            override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                val currentQualityName = _uiState.value.currentQuality
                val currentStream = _uiState.value.streamData
                val currentItem = currentStream?.qualities?.find { it.quality == currentQualityName }
                    ?: currentStream?.qualities?.firstOrNull()

                if (!hasRetriedWithFallback && currentItem != null && !currentItem.url.isNullOrBlank() && currentItem.url != currentItem.rawUrl) {
                    hasRetriedWithFallback = true
                    try {
                        // Direct CDN failed, fallback to VPS proxy URL
                        loadMediaSource(currentItem.copy(rawUrl = null), currentStream)
                        return
                    } catch (e: Exception) {
                        // continue to generic error
                    }
                }

                val currentUrl = _uiState.value.currentQualityUrl
                if (!hasRetriedWithFallback && !currentUrl.isNullOrBlank()) {
                    hasRetriedWithFallback = true
                    try {
                        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
                            .setAllowCrossProtocolRedirects(true)
                            .setUserAgent(USER_AGENT)
                            .setConnectTimeoutMs(20000)
                            .setReadTimeoutMs(20000)
                            .setDefaultRequestProperties(
                                mapOf(
                                    "Referer" to "https://www.blogger.com/",
                                    "Origin" to "https://www.blogger.com",
                                    "User-Agent" to USER_AGENT
                                )
                            )
                        val dataSourceFactory = DefaultDataSource.Factory(context, httpDataSourceFactory)
                        val fallbackMediaItem = MediaItem.Builder()
                            .setUri(currentUrl)
                            .setMimeType(MimeTypes.APPLICATION_M3U8)
                            .build()
                        val fallbackSource = DefaultMediaSourceFactory(dataSourceFactory).createMediaSource(fallbackMediaItem)
                        exoPlayer.setMediaSource(fallbackSource)
                        exoPlayer.prepare()
                        exoPlayer.play()
                    } catch (e: Exception) {
                        _uiState.update { it.copy(error = "Gagal memutar video: ${error.message}") }
                    }
                } else {
                    _uiState.update { it.copy(error = "Terjadi kesalahan saat memutar video") }
                }
            }
        })
    }

    private fun startPositionTracker() {
        viewModelScope.launch {
            while (isActive) {
                if (_uiState.value.isActive) {
                    val pos = exoPlayer.currentPosition.coerceAtLeast(0L)
                    val dur = exoPlayer.duration.coerceAtLeast(0L)
                    val buf = exoPlayer.bufferedPosition.coerceAtLeast(0L)
                    val playing = exoPlayer.isPlaying
                    _uiState.update {
                        it.copy(
                            currentPositionMs = pos,
                            totalDurationMs = dur,
                            bufferedPositionMs = buf,
                            isPlaying = playing
                        )
                    }
                }
                delay(250L)
            }
        }

        // Auto save progress every 5 seconds
        progressTrackingJob = viewModelScope.launch {
            while (isActive) {
                delay(5000L)
                if (_uiState.value.isActive) {
                    saveCurrentProgress()
                }
            }
        }
    }

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

    private suspend fun resolveEpisodes(
        episodeSlug: String,
        providedEpisodes: List<EpisodeItem>? = null
    ): Triple<List<EpisodeItem>?, Pair<String?, String?>?, Pair<String?, String?>?> {
        var episodes: List<EpisodeItem>? = if (!providedEpisodes.isNullOrEmpty()) providedEpisodes else null

        // If not explicitly provided, check if existing cachedEpisodeList belongs to this anime
        if (episodes.isNullOrEmpty()) {
            val isCurrentInCache = cachedEpisodeList?.any { ep ->
                val id = ep.episodeId?.trim()
                id != null && (id.equals(episodeSlug.trim(), ignoreCase = true) || id.contains(episodeSlug.trim(), ignoreCase = true) || episodeSlug.trim().contains(id, ignoreCase = true))
            } == true

            if (isCurrentInCache) {
                episodes = cachedEpisodeList
            } else {
                // Different anime! Clear stale cache so previous anime episodes are not shown
                cachedEpisodeList = null
            }
        }

        if (episodes.isNullOrEmpty()) {
            val baseSlug = episodeSlug
                .replace(Regex("(?i)-episode-\\d+.*"), "")
                .replace(Regex("(?i)-ep-\\d+.*"), "")
                .trim()

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

            // Fallback: If still empty, fetch anime detail from API if baseSlug is not blank
            if (episodes.isNullOrEmpty() && baseSlug.isNotBlank()) {
                try {
                    val resp = RetrofitClient.apiService.getAnimeDetail(baseSlug)
                    episodes = resp.data?.anime?.episodeList
                } catch (e: Exception) {
                    // ignore
                }
            }

            if (!episodes.isNullOrEmpty()) {
                cachedEpisodeList = episodes
            }
        } else {
            cachedEpisodeList = episodes
        }

        if (!episodes.isNullOrEmpty()) {
            val currentIndex = episodes.indexOfFirst { ep ->
                val id = ep.episodeId?.trim()
                id != null && (id.equals(episodeSlug.trim(), ignoreCase = true) || id.contains(episodeSlug.trim(), ignoreCase = true) || episodeSlug.trim().contains(id, ignoreCase = true))
            }

            if (currentIndex >= 0) {
                val currentEpNumber = episodes[currentIndex].title.toString().toDoubleOrNull()?.toInt()
                    ?: Regex("\\d+").find(episodes[currentIndex].title.toString())?.value?.toIntOrNull()
                    ?: (episodes.size - currentIndex)

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

        // Fallback: Regex pattern computation
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
            null
        }

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

    fun playEpisode(
        episodeSlug: String,
        animeTitle: String? = null,
        episodeName: String? = null,
        posterUrl: String? = null,
        episodeList: List<EpisodeItem>? = null,
        animeId: String? = null
    ) {
        val currentSlug = _uiState.value.episodeSlug
        if (_uiState.value.isActive && currentSlug == episodeSlug && exoPlayer.playbackState != Player.STATE_IDLE) {
            // Already loaded this episode, just un-minimize and ensure playing
            _uiState.update {
                it.copy(
                    isMinimized = false,
                    animeTitle = animeTitle ?: it.animeTitle,
                    episodeName = episodeName ?: it.episodeName,
                    posterUrl = posterUrl ?: it.posterUrl,
                    episodeList = if (!episodeList.isNullOrEmpty()) episodeList else it.episodeList
                )
            }
            if (!exoPlayer.isPlaying) {
                exoPlayer.play()
            }
            return
        }

        // Save progress of previous episode before switching
        if (_uiState.value.isActive) {
            saveCurrentProgress()
        }

        hasAppliedInitialSeek = false
        hasRetriedWithFallback = false

        viewModelScope.launch {
            val savedHistory = historyRepository.getHistory(episodeSlug)
            val initialPos = savedHistory?.lastPositionMs ?: 0L
            val (resolvedEpisodes, prevPair, nextPair) = resolveEpisodes(episodeSlug, episodeList)

            val currentEpItem = resolvedEpisodes?.find { ep ->
                val id = ep.episodeId?.trim()
                id != null && (id.equals(episodeSlug.trim(), ignoreCase = true) || id.contains(episodeSlug.trim(), ignoreCase = true) || episodeSlug.trim().contains(id, ignoreCase = true))
            }

            val baseSlug = episodeSlug
                .replace(Regex("(?i)-episode-\\d+.*"), "")
                .replace(Regex("(?i)-ep-\\d+.*"), "")
                .trim()
            val cachedDetail = if (baseSlug.isNotBlank()) animeDetailDao.getAnimeDetail(baseSlug) else null

            val resolvedAnimeId = animeId?.takeIf { it.isNotBlank() } ?: cachedDetail?.animeId ?: baseSlug
            if (resolvedAnimeId.isNotBlank()) {
                bookmarkObserveJob?.cancel()
                bookmarkObserveJob = viewModelScope.launch {
                    bookmarkDao.getBookmarkById(resolvedAnimeId).collect { bookmark ->
                        _uiState.update { it.copy(animeId = resolvedAnimeId, isBookmarked = (bookmark != null)) }
                    }
                }
            }

            val cachedDetailTitle = if (animeTitle.isNullOrBlank()) {
                cachedDetail?.title
            } else null

            val resolvedEpReleaseDate = currentEpItem?.releasedOn
                ?: currentEpItem?.date
                ?: currentEpItem?.uploadDate
                ?: cachedDetail?.aired
                ?: cachedDetail?.status

            val resolvedInitialTitle = resolveCleanAnimeTitle(
                animeTitle ?: cachedDetailTitle ?: savedHistory?.animeTitle ?: _uiState.value.animeTitle,
                null,
                episodeSlug
            )
            val resolvedInitialEpName = resolveCleanEpisodeName(
                episodeName ?: savedHistory?.episodeName ?: _uiState.value.episodeName,
                null,
                episodeSlug
            )

            _uiState.update {
                it.copy(
                    isActive = true,
                    isMinimized = false,
                    isLoading = true,
                    episodeSlug = episodeSlug,
                    animeId = resolvedAnimeId,
                    animeTitle = resolvedInitialTitle,
                    episodeName = resolvedInitialEpName,
                    posterUrl = posterUrl ?: savedHistory?.posterUrl ?: it.posterUrl,
                    initialPositionMs = initialPos,
                    episodeList = resolvedEpisodes,
                    releaseDate = resolvedEpReleaseDate,
                    previousEpisodeSlug = prevPair?.first,
                    previousEpisodeName = prevPair?.second,
                    nextEpisodeSlug = nextPair?.first,
                    nextEpisodeName = nextPair?.second,
                    hasPreviousEpisode = prevPair != null && !prevPair.first.isNullOrBlank(),
                    hasNextEpisode = nextPair != null && !nextPair.first.isNullOrBlank(),
                    synopsis = cachedDetail?.synopsis ?: it.synopsis,
                    error = null
                )
            }

            // Check in-memory stream cache
            val cachedStream = streamCache[episodeSlug]
            if (cachedStream != null) {
                val (qualityName, qualityUrl) = selectBestQuality(cachedStream)
                val selectedItem = cachedStream.qualities?.find { it.quality == qualityName } ?: cachedStream.qualities?.firstOrNull()
                val finalTitle = resolveCleanAnimeTitle(_uiState.value.animeTitle, cachedStream.title, episodeSlug)
                val finalEpName = resolveCleanEpisodeName(_uiState.value.episodeName, cachedStream.title, episodeSlug)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        streamData = cachedStream,
                        currentQuality = qualityName,
                        currentQualityUrl = qualityUrl,
                        animeTitle = finalTitle,
                        episodeName = finalEpName
                    )
                }
                loadMediaSource(selectedItem, cachedStream)
                return@launch
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
                        QualityItem(
                            quality = src.quality ?: "Auto",
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
                val selectedItem = data?.qualities?.find { it.quality == qualityName } ?: data?.qualities?.firstOrNull()
                val finalTitle = resolveCleanAnimeTitle(_uiState.value.animeTitle, data?.title, episodeSlug)
                val finalEpName = resolveCleanEpisodeName(_uiState.value.episodeName, data?.title, episodeSlug)

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        streamData = data,
                        currentQuality = qualityName,
                        currentQualityUrl = qualityUrl,
                        animeTitle = finalTitle,
                        episodeName = finalEpName
                    )
                }
                loadMediaSource(selectedItem, data)
            } catch (e: UnknownHostException) {
                _uiState.update { it.copy(isLoading = false, error = "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.") }
            } catch (e: IOException) {
                _uiState.update { it.copy(isLoading = false, error = "Kesalahan jaringan: ${e.message}") }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "Terjadi kesalahan saat memuat video") }
            }
        }
    }

    private fun loadMediaSource(qualityItem: QualityItem?, streamData: StreamData? = null) {
        val targetUrl = qualityItem?.rawUrl?.takeIf { it.isNotBlank() } ?: qualityItem?.url
        if (targetUrl.isNullOrBlank()) return

        val headers = qualityItem?.headers ?: streamData?.headers ?: emptyMap()
        val referer = headers["Referer"] ?: headers["referer"] ?: run {
            val uri = Uri.parse(targetUrl)
            val host = uri.host?.lowercase() ?: ""
            val isBloggerDomain = host.contains("blogger") || host.contains("blogspot") || host.contains("googleusercontent")
            if (isBloggerDomain || host.isEmpty()) "https://www.blogger.com/" else "${uri.scheme ?: "https"}://$host/"
        }
        val origin = headers["Origin"] ?: headers["origin"] ?: referer.removeSuffix("/")
        val userAgent = headers["User-Agent"] ?: headers["user-agent"] ?: USER_AGENT

        val requestProperties = mutableMapOf(
            "Referer" to referer,
            "Origin" to origin,
            "User-Agent" to userAgent
        )
        headers.forEach { (k, v) ->
            if (!k.equals("Referer", true) && !k.equals("Origin", true) && !k.equals("User-Agent", true)) {
                requestProperties[k] = v
            }
        }

        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setUserAgent(userAgent)
            .setConnectTimeoutMs(20000)
            .setReadTimeoutMs(20000)
            .setDefaultRequestProperties(requestProperties)

        val dataSourceFactory = DefaultDataSource.Factory(context, httpDataSourceFactory)
        val defaultMediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)

        val isHls = targetUrl.contains("m3u8", ignoreCase = true) || targetUrl.contains("hls", ignoreCase = true)
        val isDash = targetUrl.contains("mpd", ignoreCase = true) || targetUrl.contains("dash", ignoreCase = true)

        val mediaItemBuilder = MediaItem.Builder().setUri(targetUrl)

        if (isHls) {
            mediaItemBuilder.setMimeType(MimeTypes.APPLICATION_M3U8)
        } else if (isDash) {
            mediaItemBuilder.setMimeType(MimeTypes.APPLICATION_MPD)
        }

        val subs = streamData?.subtitles ?: qualityItem?.headers?.let { null }
        if (!subs.isNullOrEmpty()) {
            val subtitleConfigs = subs.mapNotNull { sub ->
                val subUrl = sub.url ?: return@mapNotNull null
                MediaItem.SubtitleConfiguration.Builder(Uri.parse(subUrl))
                    .setMimeType(MimeTypes.TEXT_VTT)
                    .setLanguage(sub.lang ?: "id")
                    .setSelectionFlags(if (sub.lang?.contains("Indo", true) == true) C.SELECTION_FLAG_DEFAULT else 0)
                    .build()
            }
            if (subtitleConfigs.isNotEmpty()) {
                mediaItemBuilder.setSubtitleConfigurations(subtitleConfigs)
            }
        }

        val mediaItem = mediaItemBuilder.build()
        val mediaSource = defaultMediaSourceFactory.createMediaSource(mediaItem)

        exoPlayer.stop()
        exoPlayer.setMediaSource(mediaSource)
        exoPlayer.playbackParameters = PlaybackParameters(_uiState.value.playbackSpeed)
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
        exoPlayer.play()
    }

    fun minimize() {
        _uiState.update { it.copy(isMinimized = true) }
    }

    fun expand() {
        _uiState.update { it.copy(isMinimized = false) }
    }

    fun stopAndClose() {
        saveCurrentProgress()
        exoPlayer.stop()
        exoPlayer.clearMediaItems()
        _uiState.update {
            it.copy(
                isActive = false,
                isMinimized = false,
                isPlaying = false,
                currentPositionMs = 0L,
                totalDurationMs = 0L
            )
        }
    }

    fun togglePlayPause() {
        if (exoPlayer.isPlaying) {
            exoPlayer.pause()
        } else {
            exoPlayer.play()
        }
    }

    fun seekTo(positionMs: Long) {
        val target = positionMs.coerceAtLeast(0L)
        exoPlayer.seekTo(target)
        _uiState.update { it.copy(currentPositionMs = target) }
    }

    fun seekBy(deltaMs: Long) {
        val maxDur = exoPlayer.duration.coerceAtLeast(0L)
        val target = if (maxDur > 0) {
            (exoPlayer.currentPosition + deltaMs).coerceIn(0L, maxDur)
        } else {
            (exoPlayer.currentPosition + deltaMs).coerceAtLeast(0L)
        }
        exoPlayer.seekTo(target)
        _uiState.update { it.copy(currentPositionMs = target) }
    }

    fun changeQuality(qualityItem: QualityItem) {
        val qualityName = qualityItem.quality
        val url = qualityItem.url ?: return
        if (!qualityName.isNullOrEmpty()) {
            saveQualityPreference(qualityName)
        }
        val currentPos = exoPlayer.currentPosition
        _uiState.update {
            it.copy(
                currentQuality = qualityName,
                currentQualityUrl = url
            )
        }
        loadMediaSource(qualityItem, _uiState.value.streamData)
        if (currentPos > 0) {
            exoPlayer.seekTo(currentPos)
        }
    }

    fun setPlaybackSpeed(speed: Float) {
        exoPlayer.playbackParameters = PlaybackParameters(speed)
        _uiState.update { it.copy(playbackSpeed = speed) }
    }

    fun toggleAutonext() {
        _uiState.update { it.copy(isAutonextEnabled = !it.isAutonextEnabled) }
    }

    fun playNext() {
        val nextSlug = _uiState.value.nextEpisodeSlug
        val nextName = _uiState.value.nextEpisodeName
        if (!nextSlug.isNullOrBlank()) {
            playEpisode(
                episodeSlug = nextSlug,
                animeTitle = _uiState.value.animeTitle,
                episodeName = nextName,
                posterUrl = _uiState.value.posterUrl
            )
        }
    }

    fun playPrevious() {
        val prevSlug = _uiState.value.previousEpisodeSlug
        val prevName = _uiState.value.previousEpisodeName
        if (!prevSlug.isNullOrBlank()) {
            playEpisode(
                episodeSlug = prevSlug,
                animeTitle = _uiState.value.animeTitle,
                episodeName = prevName,
                posterUrl = _uiState.value.posterUrl
            )
        }
    }

    fun saveCurrentProgress() {
        val currentSlug = _uiState.value.episodeSlug
        if (currentSlug.isBlank()) return
        val pos = exoPlayer.currentPosition
        val dur = exoPlayer.duration
        if (pos > 0 || dur > 0) {
            viewModelScope.launch {
                historyRepository.saveProgress(
                    episodeSlug = currentSlug,
                    animeTitle = _uiState.value.animeTitle,
                    episodeName = _uiState.value.episodeName,
                    posterUrl = _uiState.value.posterUrl,
                    lastPositionMs = pos,
                    totalDurationMs = dur
                )
            }
        }
    }

    fun toggleBookmark() {
        val currentAnimeId = _uiState.value.animeId?.takeIf { it.isNotBlank() }
            ?: _uiState.value.episodeSlug
                .replace(Regex("(?i)-episode-\\d+.*"), "")
                .replace(Regex("(?i)-ep-\\d+.*"), "")
                .trim()
                .takeIf { it.isNotBlank() }
            ?: return

        val isCurrentlyBookmarked = _uiState.value.isBookmarked
        viewModelScope.launch {
            if (isCurrentlyBookmarked) {
                bookmarkDao.deleteBookmarkById(currentAnimeId)
            } else {
                val cachedDetail = animeDetailDao.getAnimeDetail(currentAnimeId)
                val title = _uiState.value.animeTitle?.takeIf { it.isNotBlank() }
                    ?: cachedDetail?.title
                    ?: currentAnimeId.replace("-", " ")
                        .split(" ")
                        .joinToString(" ") { word ->
                            word.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
                        }
                val poster = _uiState.value.posterUrl ?: cachedDetail?.poster
                val epText = cachedDetail?.aired
                    ?: _uiState.value.episodeList?.size?.let { "$it Ep" }
                    ?: cachedDetail?.duration
                    ?: "?"
                val scoreVal = cachedDetail?.rating ?: "N/A"
                val statusVal = cachedDetail?.status?.takeIf { it.isNotBlank() } ?: "Ongoing"

                bookmarkDao.insertBookmark(
                    BookmarkEntity(
                        animeId = currentAnimeId,
                        title = title,
                        poster = poster,
                        episodes = epText,
                        score = scoreVal,
                        status = statusVal,
                        timestamp = System.currentTimeMillis()
                    )
                )

                if (cachedDetail == null || cachedDetail.poster.isNullOrBlank()) {
                    try {
                        val resp = RetrofitClient.apiService.getAnimeDetail(currentAnimeId)
                        val anime = resp.data?.anime
                        if (anime != null) {
                            bookmarkDao.insertBookmark(
                                BookmarkEntity(
                                    animeId = currentAnimeId,
                                    title = anime.title ?: title,
                                    poster = anime.poster ?: poster,
                                    episodes = anime.episodes ?: epText,
                                    score = anime.score?.value ?: scoreVal,
                                    status = anime.status ?: statusVal,
                                    timestamp = System.currentTimeMillis()
                                )
                            )
                        }
                    } catch (e: Exception) {
                        // ignore network failure
                    }
                }
            }
        }
    }

    override fun onCleared() {
        bookmarkObserveJob?.cancel()
        saveCurrentProgress()
        exoPlayer.release()
        super.onCleared()
    }
}

fun resolveCleanAnimeTitle(
    animeTitle: String?,
    streamTitle: String?,
    episodeSlug: String?
): String {
    // 1. Try provided animeTitle if not blank
    if (!animeTitle.isNullOrBlank()) {
        val cleaned = animeTitle
            .replace(Regex("(?i)\\s*subtitle\\s*indonesia.*"), "")
            .replace(Regex("(?i)\\s*sub\\s*indo.*"), "")
            .replace(Regex("(?i)\\s*(episode|ep)\\s*\\d+.*"), "")
            .trim()
        if (cleaned.isNotBlank()) return cleaned
        return animeTitle.trim()
    }

    // 2. Try stream title if available
    if (!streamTitle.isNullOrBlank()) {
        val cleaned = streamTitle
            .replace(Regex("(?i)\\s*subtitle\\s*indonesia.*"), "")
            .replace(Regex("(?i)\\s*sub\\s*indo.*"), "")
            .replace(Regex("(?i)\\s*(episode|ep)\\s*\\d+.*"), "")
            .trim()
        if (cleaned.isNotBlank()) return cleaned
        return streamTitle.trim()
    }

    // 3. Try deriving from episodeSlug
    if (!episodeSlug.isNullOrBlank()) {
        val cleanSlug = episodeSlug
            .replace(Regex("(?i)-episode-\\d+.*"), "")
            .replace(Regex("(?i)-ep-\\d+.*"), "")
            .replace(Regex("(?i)-sub-indo.*"), "")
            .replace("-", " ")
            .trim()
        val formatted = cleanSlug.split(" ")
            .filter { it.isNotBlank() }
            .joinToString(" ") { word ->
                word.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
            }
        if (formatted.isNotBlank()) return formatted
    }

    return "Wibufy Anime"
}

fun resolveCleanEpisodeName(
    episodeName: String?,
    streamTitle: String?,
    episodeSlug: String?
): String {
    if (!episodeName.isNullOrBlank()) {
        return episodeName.trim()
    }
    if (!streamTitle.isNullOrBlank()) {
        val match = Regex("(?i)Episode\\s*(\\d+)").find(streamTitle)
            ?: Regex("(?i)ep[-_]?(\\d+)").find(streamTitle)
        if (match != null) {
            val num = match.groupValues.getOrNull(1) ?: ""
            return "Episode $num".trim()
        }
    }
    if (!episodeSlug.isNullOrBlank()) {
        val match = Regex("(?i)episode[-_]?(\\d+)").find(episodeSlug)
            ?: Regex("(?i)ep[-_]?(\\d+)").find(episodeSlug)
        if (match != null) {
            val num = match.groupValues.getOrNull(1) ?: ""
            return "Episode $num".trim()
        }
    }
    return "Episode 1"
}
