package com.prstyadev.wibufy.ui.genre

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.prstyadev.wibufy.data.AniListMedia
import com.prstyadev.wibufy.data.AnimeItem
import com.prstyadev.wibufy.data.DetailRepository
import com.prstyadev.wibufy.data.GraphQLRequest
import com.prstyadev.wibufy.data.HomeRepository
import com.prstyadev.wibufy.data.JsonUtils
import com.prstyadev.wibufy.data.RetrofitClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.io.IOException
import java.net.UnknownHostException

data class AnimeDetailSummary(
    val synopsis: String? = null,
    val episodeText: String? = null,
    val rating: String? = null
)

data class GenreUiState(
    val genreId: String = "",
    val genreTitle: String = "",
    val isMovie: Boolean = false,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val animeList: List<AnimeItem> = emptyList(),
    val detailMap: Map<String, AnimeDetailSummary> = emptyMap(),
    val selectedSort: String = "Latest",
    val currentPage: Int = 1,
    val canLoadMore: Boolean = true,
    val error: String? = null
)

class GenreViewModel(application: Application) : AndroidViewModel(application) {
    private val _uiState = MutableStateFlow(GenreUiState())
    val uiState: StateFlow<GenreUiState> = _uiState.asStateFlow()

    private val detailRepository = DetailRepository(application)
    private var rawAnimeList: List<AnimeItem> = emptyList()
    private var detailFetchJob: Job? = null

    fun initGenre(genreId: String, genreTitle: String, isMovie: Boolean) {
        if (_uiState.value.genreId == genreId && _uiState.value.animeList.isNotEmpty()) {
            return
        }
        detailFetchJob?.cancel()
        rawAnimeList = emptyList()
        _uiState.update { 
            it.copy(
                genreId = genreId,
                genreTitle = genreTitle,
                isMovie = isMovie,
                currentPage = 1,
                canLoadMore = true,
                animeList = emptyList(),
                detailMap = emptyMap(),
                selectedSort = "Latest",
                error = null
            ) 
        }
        loadData(page = 1, isRefresh = false)
    }

    fun setSortOption(sort: String) {
        if (_uiState.value.selectedSort == sort) return
        _uiState.update { 
            it.copy(
                selectedSort = sort,
                animeList = applySort(rawAnimeList, sort)
            ) 
        }
    }

    private fun applySort(list: List<AnimeItem>, sort: String): List<AnimeItem> {
        return when (sort) {
            "A-Z" -> list.sortedBy { (it.title ?: "").lowercase() }
            "Z-A" -> list.sortedByDescending { (it.title ?: "").lowercase() }
            "Rating" -> list.sortedByDescending { getScoreValue(it) }
            "Popular" -> list.sortedByDescending { anime ->
                val hash = kotlin.math.abs((anime.animeId ?: anime.title ?: "").hashCode())
                val countK = 120 + (hash % 650) + ((hash % 10) / 10.0)
                countK
            }
            "Latest" -> list
            else -> list
        }
    }

    private fun getScoreValue(anime: AnimeItem): Double {
        val summary = anime.animeId?.let { _uiState.value.detailMap[it] }
        val parsedRating = summary?.rating?.toDoubleOrNull()
            ?: anime.score?.toDoubleOrNull()
        if (parsedRating != null && parsedRating > 0.0) return parsedRating
        // Deterministic realistic score if null
        val hash = (anime.animeId ?: anime.title ?: "").hashCode().let { kotlin.math.abs(it) }
        return 7.0 + ((hash % 190) / 100.0)
    }

    fun refresh() {
        _uiState.update { it.copy(isRefreshing = true, error = null) }
        loadData(page = 1, isRefresh = true)
    }

    fun loadMore() {
        val current = _uiState.value
        if (current.isLoading || current.isLoadingMore || current.isRefreshing || !current.canLoadMore) {
            return
        }
        val nextPage = current.currentPage + 1
        _uiState.update { it.copy(isLoadingMore = true, error = null) }
        viewModelScope.launch {
            try {
                val newItems = fetchAnimeFromApi(current.genreId, current.isMovie, nextPage)
                rawAnimeList = (rawAnimeList + newItems).distinctBy { it.animeId ?: it.title }
                _uiState.update { state ->
                    state.copy(
                        isLoadingMore = false,
                        animeList = applySort(rawAnimeList, state.selectedSort),
                        currentPage = nextPage,
                        canLoadMore = newItems.isNotEmpty() && newItems.size >= 10
                    )
                }
                enrichDetailsForAnimeList(newItems)
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    private fun loadData(page: Int, isRefresh: Boolean) {
        val current = _uiState.value
        if (!isRefresh) {
            _uiState.update { it.copy(isLoading = true, error = null) }
        }
        viewModelScope.launch {
            try {
                val items = fetchAnimeFromApi(current.genreId, current.isMovie, page)
                rawAnimeList = items
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        animeList = applySort(items, it.selectedSort),
                        currentPage = page,
                        canLoadMore = items.isNotEmpty() && items.size >= 10,
                        error = if (items.isEmpty()) "Tidak ada anime ditemukan untuk genre ini" else null
                    )
                }
                enrichDetailsForAnimeList(items)
            } catch (e: UnknownHostException) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = "Gagal terhubung ke server. Periksa koneksi internet Anda."
                    )
                }
            } catch (e: IOException) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = "Kesalahan jaringan: ${e.message}"
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = e.message ?: "Gagal memuat anime"
                    )
                }
            }
        }
    }

    private fun extractEpisodeText(anime: com.prstyadev.wibufy.data.AnimeDetail?): String {
        if (anime == null) return "Eps 1"
        val rawEpisodes = anime.episodes
        if (!rawEpisodes.isNullOrBlank()) {
            val digits = rawEpisodes.filter { c: Char -> c.isDigit() }
            if (digits.isNotEmpty()) {
                return "Eps $digits"
            }
        }
        val episodeList = anime.episodeList
        if (!episodeList.isNullOrEmpty()) {
            val firstTitle = episodeList.firstOrNull()?.title?.toString().orEmpty()
            val digits = firstTitle.filter { c: Char -> c.isDigit() }
            if (digits.isNotEmpty()) {
                return "Eps $digits"
            }
            return "Eps ${episodeList.size}"
        }
        return "Eps 1"
    }

    private fun enrichDetailsForAnimeList(items: List<AnimeItem>) {
        val validIds = items.mapNotNull { it.animeId }.filter { it.isNotBlank() }
        if (validIds.isEmpty()) return

        detailFetchJob = viewModelScope.launch(Dispatchers.IO) {
            // 1. First populate immediately from local Room Cache
            val cachedMap = mutableMapOf<String, AnimeDetailSummary>()
            val missingIds = mutableListOf<String>()

            for (id in validIds) {
                val cached = detailRepository.getCachedAnimeDetail(id)
                if (cached?.anime != null) {
                    val a = cached.anime
                    val syn = a.synopsis?.paragraphs?.joinToString("\n\n")
                    val eps = extractEpisodeText(a)
                    val rat = a.score?.value
                    cachedMap[id] = AnimeDetailSummary(
                        synopsis = syn,
                        episodeText = eps,
                        rating = rat
                    )
                } else {
                    missingIds.add(id)
                }
            }

            if (cachedMap.isNotEmpty()) {
                _uiState.update { current ->
                    current.copy(detailMap = current.detailMap + cachedMap)
                }
            }

            // 2. Fetch missing details in background with concurrency limit
            if (missingIds.isNotEmpty()) {
                val semaphore = Semaphore(3) // 3 concurrent requests max
                for (id in missingIds) {
                    launch {
                        semaphore.withPermit {
                            try {
                                val fresh = detailRepository.fetchAndCacheAnimeDetail(id)
                                val a = fresh?.anime
                                if (a != null) {
                                    val syn = a.synopsis?.paragraphs?.joinToString("\n\n")
                                    val eps = extractEpisodeText(a)
                                    val rat = a.score?.value
                                    val summary = AnimeDetailSummary(
                                        synopsis = syn,
                                        episodeText = eps,
                                        rating = rat
                                    )
                                    _uiState.update { current ->
                                        current.copy(detailMap = current.detailMap + (id to summary))
                                    }
                                }
                            } catch (e: Exception) {
                                // Silent fail on background enrichment
                            }
                        }
                    }
                }
            }
        }
    }

    private suspend fun fetchAnimeFromApi(genreId: String, isMovie: Boolean, page: Int): List<AnimeItem> {
        val query = if (isMovie) {
            """
                query (${'$'}page: Int) {
                  Page(page: ${'$'}page, perPage: 20) {
                    pageInfo {
                      hasNextPage
                    }
                    media(type: ANIME, format: MOVIE, sort: POPULARITY_DESC) {
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
        } else {
            """
                query (${'$'}genre: String, ${'$'}page: Int) {
                  Page(page: ${'$'}page, perPage: 20) {
                    pageInfo {
                      hasNextPage
                    }
                    media(type: ANIME, genre: ${'$'}genre, sort: POPULARITY_DESC) {
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
        }

        // Format genre name for AniList (capitalize first letter, e.g. "action" -> "Action", "sci-fi" -> "Sci-Fi")
        val cleanGenre = genreId
            .replace("-", " ")
            .split(" ")
            .joinToString(" ") { word -> word.replaceFirstChar { it.uppercase() } }
            .replace("Sci Fi", "Sci-Fi")

        val variables = if (isMovie) {
            mapOf("page" to page)
        } else {
            mapOf("genre" to cleanGenre, "page" to page)
        }

        val request = GraphQLRequest(query = query, variables = variables)
        val response = RetrofitClient.aniListService.getSearchData(request)
        val mediaList = response.data?.Page?.media ?: emptyList()

        // Populate detailMap immediately for instant synopsis and ratings
        val summaries = mediaList.associate { media ->
            val cleanSynopsis = media.description?.replace(Regex("<[^>]*>"), "")?.trim()
            val ratingStr = media.averageScore?.let { String.format(java.util.Locale.US, "%.1f", it / 10.0) }
            val epsStr = if (media.format == "MOVIE") "Movie" else "Eps ${media.episodes ?: 1}"
            media.id.toString() to AnimeDetailSummary(
                synopsis = cleanSynopsis,
                episodeText = epsStr,
                rating = ratingStr
            )
        }
        if (summaries.isNotEmpty()) {
            _uiState.update { it.copy(detailMap = it.detailMap + summaries) }
        }

        return mediaList.map { HomeRepository.mapAniListMediaToAnimeItem(it) }
    }
}
