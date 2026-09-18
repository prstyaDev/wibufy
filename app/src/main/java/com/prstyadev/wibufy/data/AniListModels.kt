package com.prstyadev.wibufy.data

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class GraphQLRequest(
    val query: String,
    val variables: Map<String, Any?> = emptyMap()
)

@JsonClass(generateAdapter = true)
data class GraphQLError(
    val message: String? = null
)

@JsonClass(generateAdapter = true)
data class GraphQLDataResponse<T>(
    val data: T? = null,
    val errors: List<GraphQLError>? = null
)

@JsonClass(generateAdapter = true)
data class AniListTitle(
    val romaji: String? = null,
    val english: String? = null,
    val native: String? = null,
    val userPreferred: String? = null
) {
    val displayTitle: String
        get() = english?.takeIf { it.isNotBlank() }
            ?: romaji?.takeIf { it.isNotBlank() }
            ?: userPreferred?.takeIf { it.isNotBlank() }
            ?: native?.takeIf { it.isNotBlank() }
            ?: ""
}

@JsonClass(generateAdapter = true)
data class AniListCoverImage(
    val extraLarge: String? = null,
    val large: String? = null,
    val medium: String? = null
) {
    val bestImageUrl: String
        get() = extraLarge ?: large ?: medium ?: ""
}

@JsonClass(generateAdapter = true)
data class AniListNextAiring(
    val id: Int? = null,
    val episode: Int? = null,
    val airingAt: Long? = null,
    val timeUntilAiring: Long? = null
)

@JsonClass(generateAdapter = true)
data class AniListStudioNode(
    val name: String? = null
)

@JsonClass(generateAdapter = true)
data class AniListStudios(
    val nodes: List<AniListStudioNode>? = null
)

@JsonClass(generateAdapter = true)
data class AniListTrailer(
    val id: String? = null,
    val site: String? = null
)

@JsonClass(generateAdapter = true)
data class AniListMedia(
    val id: Int,
    val title: AniListTitle? = null,
    val coverImage: AniListCoverImage? = null,
    val bannerImage: String? = null,
    val description: String? = null,
    val format: String? = null,
    val status: String? = null,
    val episodes: Int? = null,
    val duration: Int? = null,
    val averageScore: Int? = null,
    val meanScore: Int? = null,
    val genres: List<String>? = null,
    val season: String? = null,
    val seasonYear: Int? = null,
    val nextAiringEpisode: AniListNextAiring? = null,
    val studios: AniListStudios? = null,
    val trailer: AniListTrailer? = null
)

@JsonClass(generateAdapter = true)
data class AniListPageInfo(
    val hasNextPage: Boolean? = null,
    val total: Int? = null,
    val currentPage: Int? = null
)

@JsonClass(generateAdapter = true)
data class AniListPageMedia(
    val pageInfo: AniListPageInfo? = null,
    val media: List<AniListMedia>? = null
)

@JsonClass(generateAdapter = true)
data class AniListAiringSchedule(
    val id: Int? = null,
    val episode: Int? = null,
    val airingAt: Long? = null,
    val timeUntilAiring: Long? = null,
    val media: AniListMedia? = null
)

@JsonClass(generateAdapter = true)
data class AniListPageSchedule(
    val pageInfo: AniListPageInfo? = null,
    val airingSchedules: List<AniListAiringSchedule>? = null
)

@JsonClass(generateAdapter = true)
data class AniListHomeContainer(
    val releasing: AniListPageMedia? = null,
    val completed: AniListPageMedia? = null
)

@JsonClass(generateAdapter = true)
data class AniListScheduleContainer(
    val Page: AniListPageSchedule? = null
)

@JsonClass(generateAdapter = true)
data class AniListSearchContainer(
    val Page: AniListPageMedia? = null
)

@JsonClass(generateAdapter = true)
data class AniListMediaDetailContainer(
    val Media: AniListMedia? = null
)
