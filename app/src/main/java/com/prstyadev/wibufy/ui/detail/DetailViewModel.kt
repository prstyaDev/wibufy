package com.prstyadev.wibufy.ui.detail

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.prstyadev.wibufy.data.AnimeDetailData
import com.prstyadev.wibufy.data.AppDatabase
import com.prstyadev.wibufy.data.BookmarkEntity
import com.prstyadev.wibufy.data.DetailRepository
import com.prstyadev.wibufy.data.WatchHistoryEntity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.net.UnknownHostException

data class DetailUiState(
    val isLoading: Boolean = true,
    val detailData: AnimeDetailData? = null,
    val error: String? = null,
    val isBookmarked: Boolean = false,
    val lastWatchedHistory: WatchHistoryEntity? = null,
    val watchedEpisodes: Map<String, WatchHistoryEntity> = emptyMap()
)

class DetailViewModel(application: Application) : AndroidViewModel(application) {
    private val _uiState = MutableStateFlow(DetailUiState())
    val uiState: StateFlow<DetailUiState> = _uiState.asStateFlow()

    private val bookmarkDao = AppDatabase.getDatabase(application).bookmarkDao()
    private val watchHistoryDao = AppDatabase.getDatabase(application).watchHistoryDao()
    private val detailRepository = DetailRepository(application)
    private var currentAnimeId: String = ""

    fun loadAnimeDetail(animeId: String) {
        if (animeId.isBlank()) return
        currentAnimeId = animeId
        viewModelScope.launch {
            checkBookmarkStatus(animeId)
            observeWatchHistory(animeId)

            // 1. Tampilkan data dari Room DB terlebih dahulu jika sudah pernah di-fetch sebelumnya (0 ms)
            val cachedData = try {
                detailRepository.getCachedAnimeDetail(animeId)
            } catch (e: Exception) {
                null
            }

            if (cachedData != null) {
                _uiState.update {
                    it.copy(isLoading = false, detailData = cachedData, error = null)
                }
            } else {
                _uiState.update { it.copy(isLoading = true, error = null) }
            }

            // 2. Jalankan silent network fetch di background untuk memastikan daftar episode selalu paling up-to-date
            try {
                val freshData = detailRepository.fetchAndCacheAnimeDetail(animeId)
                if (freshData != null) {
                    _uiState.update {
                        it.copy(isLoading = false, detailData = freshData, error = null)
                    }
                }
            } catch (e: UnknownHostException) {
                if (_uiState.value.detailData == null) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = "Unable to reach server. Please check your internet connection."
                        )
                    }
                }
            } catch (e: IOException) {
                if (_uiState.value.detailData == null) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = "Network error: ${e.message}"
                        )
                    }
                }
            } catch (e: Exception) {
                if (_uiState.value.detailData == null) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            error = e.message ?: "Failed to load anime detail"
                        )
                    }
                }
            }
        }
    }

    private fun observeWatchHistory(animeId: String) {
        viewModelScope.launch {
            watchHistoryDao.getAllHistory().collect { historyList ->
                val match = historyList.firstOrNull { item ->
                    val derivedSlug = item.episodeSlug.replace(Regex("-episode-\\d+.*"), "").trim()
                    derivedSlug.equals(animeId, ignoreCase = true) ||
                    animeId.contains(derivedSlug, ignoreCase = true) ||
                    derivedSlug.contains(animeId, ignoreCase = true) ||
                    (!item.animeTitle.isNullOrBlank() && (
                        item.animeTitle.equals(_uiState.value.detailData?.anime?.displayTitle, ignoreCase = true)
                    ))
                }
                val epMap = historyList.associateBy { it.episodeSlug }
                _uiState.update { it.copy(lastWatchedHistory = match, watchedEpisodes = epMap) }
            }
        }
    }

    private fun checkBookmarkStatus(animeId: String) {
        viewModelScope.launch {
            bookmarkDao.getBookmarkById(animeId).collect { bookmark ->
                _uiState.update { it.copy(isBookmarked = bookmark != null) }
            }
        }
    }

    fun toggleBookmark(animeId: String) {
        val currentData = _uiState.value.detailData?.anime ?: return
        viewModelScope.launch {
            if (_uiState.value.isBookmarked) {
                bookmarkDao.deleteBookmarkById(animeId)
            } else {
                val epText = currentData.episodes
                    ?: currentData.episodeList?.firstOrNull()?.let { 
                        it.title?.toString()?.replace(Regex("[^0-9]"), "")?.ifEmpty { null }
                    }
                    ?: "?"
                val scoreVal = currentData.score?.value ?: "N/A"
                val statusVal = currentData.status?.takeIf { it.isNotBlank() } ?: "Ongoing"
                val cleanTitle = currentData.title?.takeIf { it.isNotBlank() }
                    ?: currentData.japanese?.takeIf { it.isNotBlank() }
                    ?: animeId.replace("-", " ")
                        .split(" ")
                        .joinToString(" ") { word -> word.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() } }

                bookmarkDao.insertBookmark(
                    BookmarkEntity(
                        animeId = animeId,
                        title = cleanTitle,
                        poster = currentData.poster,
                        episodes = epText,
                        score = scoreVal,
                        status = statusVal,
                        timestamp = System.currentTimeMillis()
                    )
                )
            }
        }
    }
}

