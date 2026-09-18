package com.prstyadev.wibufy.data

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class ReconsumetMapping(
    val provider: String? = null,
    val id: String? = null,
    val title: String? = null,
    val score: Double? = null
)

@JsonClass(generateAdapter = true)
data class ReconsumetInfoResponse(
    val id: String? = null,
    val mappings: List<ReconsumetMapping>? = null
)

@JsonClass(generateAdapter = true)
data class ReconsumetEpisodeItem(
    val id: String? = null,
    val number: Any? = null,
    val title: String? = null,
    val url: String? = null,
    val releaseDate: String? = null,
    val isFiller: Boolean? = false
) {
    val episodeNumberString: String
        get() = when (number) {
            is Number -> {
                val d = number.toDouble()
                if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()
            }
            is String -> number
            else -> ""
        }
}

@JsonClass(generateAdapter = true)
data class ReconsumetEpisodesResponse(
    val provider: String? = null,
    val providerId: String? = null,
    val episodes: List<ReconsumetEpisodeItem>? = null
)

@JsonClass(generateAdapter = true)
data class ReconsumetSource(
    val url: String? = null,
    val rawUrl: String? = null,
    val quality: String? = null,
    val isM3U8: Boolean? = null
)

@JsonClass(generateAdapter = true)
data class ReconsumetSubtitle(
    val url: String? = null,
    val rawUrl: String? = null,
    val lang: String? = null
)

@JsonClass(generateAdapter = true)
data class ReconsumetInterval(
    val start: Double? = null,
    val end: Double? = null
)

@JsonClass(generateAdapter = true)
data class ReconsumetServer(
    val serverName: String? = null,
    val sources: List<ReconsumetSource>? = null,
    val subtitles: List<ReconsumetSubtitle>? = null,
    val headers: Map<String, String>? = null,
    val pk: String? = null,
    val keyMediaId: String? = null,
    val audioDefault: String? = null,
    val intro: ReconsumetInterval? = null,
    val outro: ReconsumetInterval? = null
)

@JsonClass(generateAdapter = true)
data class ReconsumetWatchResponse(
    val sub: List<ReconsumetServer>? = null,
    val dub: List<ReconsumetServer>? = null
)
