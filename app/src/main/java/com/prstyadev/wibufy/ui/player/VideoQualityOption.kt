package com.prstyadev.wibufy.ui.player

/**
 * Model representing a video quality option (Auto, 1080p, 720p, 480p, 360p)
 * for ExoPlayer dynamic track selection or direct stream selection.
 */
data class VideoQualityOption(
    val id: String,
    val label: String,
    val height: Int = 0,
    val width: Int = 0,
    val bitrate: Int = 0,
    val isAuto: Boolean = false
) {
    companion object {
        val DEFAULT_SELECTOR_OPTIONS = listOf(
            VideoQualityOption(id = "auto", label = "Auto", isAuto = true),
            VideoQualityOption(id = "1080p", label = "1080p (FHD)", height = 1080),
            VideoQualityOption(id = "720p", label = "720p (HD)", height = 720),
            VideoQualityOption(id = "480p", label = "480p (SD)", height = 480),
            VideoQualityOption(id = "360p", label = "360p (Hemat Data)", height = 360)
        )
    }
}
