package com.prstyadev.wibufy.data

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class BaseResponse<T>(
    val status: String? = null,
    val data: T? = null
)

@JsonClass(generateAdapter = true)
data class RecentData(
    val provider: String? = null,
    val page: Int? = null,
    val itemCount: Int? = null,
    val animeList: List<AnimeItem>? = null
)

@JsonClass(generateAdapter = true)
data class HomeData(
    val provider: String? = null,
    val recent: HomeSection? = null,
    val complete: HomeSection? = null
)

@JsonClass(generateAdapter = true)
data class HomeSection(
    val href: String? = null,
    val samehadakuUrl: String? = null,
    val animeList: List<AnimeItem>? = null
)

@JsonClass(generateAdapter = true)
data class ScoreDetail(
    val value: String? = null,
    val users: String? = null
)

@JsonClass(generateAdapter = true)
data class AnimeItem(
    val title: String? = null,
    val poster: String? = null,
    val episodes: String? = null,
    val releasedOn: String? = null,
    val animeId: String? = null,
    val href: String? = null,
    val samehadakuUrl: String? = null,
    val type: String? = null,
    val status: String? = null,
    val score: String? = null,
    val synopsis: String? = null,
    val description: String? = null,
    val genres: String? = null,
    val alterTitle: String? = null
)

@JsonClass(generateAdapter = true)
data class AnimeDetailData(
    val provider: String? = null,
    val anime: AnimeDetail? = null
)

@JsonClass(generateAdapter = true)
data class SynopsisDetail(
    val paragraphs: List<String>? = null
)

@JsonClass(generateAdapter = true)
data class AnimeDetail(
    val title: String? = null,
    val poster: String? = null,
    val score: ScoreDetail? = null,
    val japanese: String? = null,
    val synonyms: String? = null,
    val english: String? = null,
    val status: String? = null,
    val type: String? = null,
    val source: String? = null,
    val duration: String? = null,
    val episodes: String? = null,
    val season: String? = null,
    val studios: String? = null,
    val producers: String? = null,
    val aired: String? = null,
    val trailer: String? = null,
    val synopsis: SynopsisDetail? = null,
    val genreList: List<GenreItem>? = null,
    val episodeList: List<EpisodeItem>? = null
) {
    val displayTitle: String
        get() = title?.takeIf { it.isNotBlank() }
            ?: english?.takeIf { it.isNotBlank() }
            ?: japanese?.takeIf { it.isNotBlank() }
            ?: synonyms?.takeIf { it.isNotBlank() }
            ?: ""
}

@JsonClass(generateAdapter = true)
data class GenreListData(
    val provider: String? = null,
    val genreList: List<GenreItem>? = null,
    val animeList: List<AnimeItem>? = null
)

@JsonClass(generateAdapter = true)
data class GenreItem(
    val title: String? = null,
    val genreId: String? = null,
    val href: String? = null,
    val samehadakuUrl: String? = null,
    val isMovie: Boolean = false
)

@JsonClass(generateAdapter = true)
data class EpisodeItem(
    val title: Any? = null, // can be string or int
    val episodeId: String? = null,
    val date: String? = null,
    @Json(name = "releasedOn") val releasedOn: String? = null,
    @Json(name = "upload_date") val uploadDate: String? = null
)

@JsonClass(generateAdapter = true)
data class SearchData(
    val provider: String? = null,
    val animeList: List<AnimeItem>? = null,
    val keyword: String? = null
)

@JsonClass(generateAdapter = true)
data class StreamData(
    val title: String? = null,
    val episodeSlug: String? = null,
    val defaultQuality: String? = null,
    val qualities: List<QualityItem>? = null
)

@JsonClass(generateAdapter = true)
data class QualityItem(
    val quality: String? = null,
    val provider: String? = null,
    val type: String? = null,
    val url: String? = null
)

@JsonClass(generateAdapter = true)
data class ScheduleData(
    val provider: String? = null,
    val scheduleList: List<ScheduleDayItem>? = null
)

@JsonClass(generateAdapter = true)
data class ScheduleDayItem(
    val day: String? = null,
    @Json(name = "anime_list") val animeList: List<ScheduleAnimeItem>? = null
)

@JsonClass(generateAdapter = true)
data class ScheduleAnimeItem(
    val title: String? = null,
    val poster: String? = null,
    val type: String? = null,
    val score: String? = null,
    val estimation: String? = null,
    val genres: String? = null,
    val animeId: String? = null,
    val href: String? = null,
    val samehadakuUrl: String? = null,
    val episodes: String? = null,
    val time: String? = null
)
