package com.prstyadev.wibufy.ui.search

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.prstyadev.wibufy.data.AniListMedia
import com.prstyadev.wibufy.data.AnimeItem
import com.prstyadev.wibufy.data.DetailRepository
import com.prstyadev.wibufy.data.GraphQLRequest
import com.prstyadev.wibufy.data.HomeRepository
import com.prstyadev.wibufy.data.RetrofitClient
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.net.UnknownHostException

enum class SearchSortOption(val displayName: String) {
    A_TO_Z("A-Z"),
    RELEVANT("Relevant"),
    LATEST("Latest"),
    POPULAR("Popular"),
    RATING("Rating"),
    Z_TO_A("Z-A")
}

data class SearchUiState(
    val query: String = "",
    val isSearching: Boolean = false,
    val searchResults: List<AnimeItem> = emptyList(),
    val rawResults: List<AnimeItem> = emptyList(),
    val synopsisMap: Map<String, String> = emptyMap(),
    val sortOption: SearchSortOption = SearchSortOption.RELEVANT,
    val error: String? = null,
    val hasSearched: Boolean = false
)

@OptIn(FlowPreview::class)
class SearchViewModel(application: Application) : AndroidViewModel(application) {
    private val detailRepository = DetailRepository(application)
    private val _query = MutableStateFlow("")
    private var synopsisJob: Job? = null
    
    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            _query
                .debounce(500L)
                .distinctUntilChanged()
                .collectLatest { queryText ->
                    val trimmed = queryText.trim()
                    if (trimmed.isBlank()) {
                        synopsisJob?.cancel()
                        _uiState.update { 
                            it.copy(
                                isSearching = false, 
                                searchResults = emptyList(),
                                rawResults = emptyList(),
                                synopsisMap = emptyMap(),
                                error = null,
                                hasSearched = false
                            ) 
                        }
                    } else {
                        performSearch(trimmed)
                    }
                }
        }
    }

    fun onQueryChange(newQuery: String) {
        _query.value = newQuery
        _uiState.update { 
            it.copy(
                query = newQuery,
                isSearching = newQuery.trim().isNotBlank()
            ) 
        }
    }

    fun clearQuery() {
        onQueryChange("")
    }

    fun setSortOption(option: SearchSortOption) {
        _uiState.update { current ->
            val sorted = applySorting(current.rawResults, option)
            current.copy(
                sortOption = option,
                searchResults = sorted
            )
        }
    }

    private fun applySorting(list: List<AnimeItem>, option: SearchSortOption): List<AnimeItem> {
        return when (option) {
            SearchSortOption.RELEVANT -> list
            SearchSortOption.A_TO_Z -> list.sortedBy { (it.title ?: "").lowercase() }
            SearchSortOption.Z_TO_A -> list.sortedByDescending { (it.title ?: "").lowercase() }
            SearchSortOption.RATING -> list.sortedByDescending { 
                it.score?.toDoubleOrNull() ?: 0.0 
            }
            SearchSortOption.LATEST -> list.sortedByDescending { anime ->
                val epNumber = anime.episodes?.filter { it.isDigit() }?.toIntOrNull() ?: 0
                epNumber
            }
            SearchSortOption.POPULAR -> list.sortedByDescending { anime ->
                val hash = kotlin.math.abs((anime.animeId ?: anime.title ?: "").hashCode())
                val pseudoViews = when {
                    hash % 7 == 0 -> (hash % 180 + 15) * 1_000_000
                    hash % 3 == 0 -> (hash % 60 + 10) * 1_000_000
                    else -> (hash % 900 + 100) * 1_000
                }
                pseudoViews
            }
        }
    }

    private suspend fun performSearch(queryText: String) {
        synopsisJob?.cancel()
        _uiState.update { it.copy(isSearching = true, error = null, hasSearched = true) }
        try {
            val query = """
                query (${'$'}search: String) {
                  Page(page: 1, perPage: 30) {
                    media(type: ANIME, search: ${'$'}search, sort: SEARCH_MATCH) {
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

            val request = GraphQLRequest(
                query = query,
                variables = mapOf("search" to queryText)
            )

            val response = RetrofitClient.aniListService.getSearchData(request)
            val mediaList = response.data?.Page?.media ?: emptyList()

            val results = mediaList.map { media ->
                HomeRepository.mapAniListMediaToAnimeItem(media)
            }

            val synopsisMap = mediaList.associate { media ->
                val cleanSynopsis = media.description?.replace(Regex("<[^>]*>"), "")?.trim() ?: ""
                media.id.toString() to cleanSynopsis
            }

            _uiState.update { current ->
                val sorted = applySorting(results, current.sortOption)
                current.copy(
                    isSearching = false,
                    rawResults = results,
                    searchResults = sorted,
                    synopsisMap = synopsisMap,
                    error = null
                ) 
            }

        } catch (e: UnknownHostException) {
            _uiState.update { 
                it.copy(
                    isSearching = false, 
                    error = "Tidak dapat terhubung ke server. Periksa koneksi internet Anda."
                ) 
            }
        } catch (e: IOException) {
            _uiState.update { 
                it.copy(
                    isSearching = false, 
                    error = "Terjadi kesalahan jaringan: ${e.message}"
                ) 
            }
        } catch (e: Exception) {
            _uiState.update { 
                it.copy(
                    isSearching = false, 
                    error = e.message ?: "Terjadi kesalahan yang tidak diketahui"
                ) 
            }
        }
    }

    private suspend fun fetchSynopsesBatch(animeIds: List<String>) = coroutineScope {
        // Fetch in parallel chunks of 3 to avoid overwhelming backend
        animeIds.chunked(3).forEach { chunk ->
            val deferreds = chunk.map { animeId ->
                async {
                    val synopsis = detailRepository.getOrFetchSynopsis(animeId)
                    if (!synopsis.isNullOrBlank()) {
                        animeId to synopsis
                    } else null
                }
            }
            val results = deferreds.awaitAll().filterNotNull()
            if (results.isNotEmpty()) {
                _uiState.update { current ->
                    current.copy(synopsisMap = current.synopsisMap + results)
                }
            }
        }
    }
}
