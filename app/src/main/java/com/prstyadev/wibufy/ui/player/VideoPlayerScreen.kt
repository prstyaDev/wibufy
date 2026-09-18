package com.prstyadev.wibufy.ui.player

import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import android.os.Environment
import android.view.LayoutInflater
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.Toast
import com.example.R
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.prstyadev.wibufy.ui.theme.WibufyBackground
import com.prstyadev.wibufy.ui.theme.WibufySurface
import com.prstyadev.wibufy.ui.theme.WibufyPrimary
import com.prstyadev.wibufy.ui.theme.WibufyOnBackground
import androidx.compose.ui.unit.lerp
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import kotlin.math.roundToInt
import androidx.lifecycle.Lifecycle
import coil.compose.AsyncImage
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private fun Context.findActivity(): Activity? {
    var currentContext = this
    while (currentContext is ContextWrapper) {
        if (currentContext is Activity) return currentContext
        currentContext = currentContext.baseContext
    }
    return null
}

val overlayTextShadow = Shadow(
    color = Color.Black.copy(alpha = 0.85f),
    offset = Offset(2f, 2f),
    blurRadius = 4f
)

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoPlayerScreen(
    episodeSlug: String? = null,
    animeTitle: String? = null,
    episodeName: String? = null,
    posterUrl: String? = null,
    onMinimize: () -> Unit = {},
    onNavigateBack: () -> Unit = onMinimize,
    onNavigateToEpisode: ((newSlug: String, animeTitle: String?, episodeName: String?, posterUrl: String?) -> Unit)? = null,
    viewModel: GlobalPlayerViewModel = viewModel(),
    modifier: Modifier = Modifier
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }
    val lifecycleOwner = LocalLifecycleOwner.current

    // Auto-pause ExoPlayer when app is paused or stopped
    DisposableEffect(lifecycleOwner, viewModel.exoPlayer) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) {
                viewModel.exoPlayer.pause()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    var isFullscreen by rememberSaveable { mutableStateOf(false) }
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    val pagerState = rememberPagerState(initialPage = 0) { 2 }
    val coroutineScope = rememberCoroutineScope()

    LaunchedEffect(pagerState.currentPage) {
        selectedTab = pagerState.currentPage
    }

    var isSynopsisExpanded by rememberSaveable { mutableStateOf(false) }
    var commentInputText by remember { mutableStateOf("") }
    var showQualityBottomSheet by remember { mutableStateOf(false) }
    var showSpeedBottomSheet by remember { mutableStateOf(false) }
    var showDownloadBottomSheet by remember { mutableStateOf(false) }
    var showAllEpisodesBottomSheet by remember { mutableStateOf(false) }

    // If a new episodeSlug was provided that is not currently playing, start it
    LaunchedEffect(episodeSlug) {
        if (!episodeSlug.isNullOrBlank() && episodeSlug != uiState.episodeSlug) {
            viewModel.playEpisode(episodeSlug, animeTitle, episodeName, posterUrl)
        }
    }

    // Manage Fullscreen Orientation and System Bars
    LaunchedEffect(isFullscreen) {
        activity?.let { act ->
            val window = act.window
            val insetsController = WindowCompat.getInsetsController(window, window.decorView)
            if (isFullscreen) {
                act.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                insetsController.systemBarsBehavior =
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                insetsController.hide(WindowInsetsCompat.Type.systemBars())
            } else {
                act.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                insetsController.show(WindowInsetsCompat.Type.systemBars())
            }
        }
    }

    // Restore orientation on exit
    DisposableEffect(Unit) {
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            activity?.let { act ->
                val window = act.window
                val insetsController = WindowCompat.getInsetsController(window, window.decorView)
                insetsController.show(WindowInsetsCompat.Type.systemBars())
            }
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    // Handle back button: if in fullscreen exit fullscreen; else minimize player
    BackHandler {
        if (isFullscreen) {
            isFullscreen = false
        } else {
            onMinimize()
        }
    }

    val resolvedAnimeTitle = remember(uiState.streamData?.title, uiState.animeTitle, animeTitle) {
        uiState.animeTitle ?: animeTitle ?: uiState.streamData?.title ?: "Anime"
    }

    val currentEpNum = remember(uiState.streamData?.title, uiState.episodeName, uiState.episodeSlug) {
        val titleText = uiState.streamData?.title ?: uiState.episodeName ?: uiState.episodeSlug
        val match = Regex("(?i)Episode\\s*(\\d+)").find(titleText)
            ?: Regex("(?i)ep[-_]?(\\d+)").find(titleText)
            ?: Regex("(?i)episode[-_]?(\\d+)").find(uiState.episodeSlug)
        match?.groupValues?.getOrNull(1)?.toIntOrNull() ?: 1
    }

    val hasPrevEpisode = (currentEpNum > 1) && (uiState.hasPreviousEpisode || !uiState.previousEpisodeSlug.isNullOrBlank())
    val prevEpLabel = uiState.previousEpisodeName ?: "Episode ${(currentEpNum - 1).coerceAtLeast(1)}"
    val prevEpSlug = uiState.previousEpisodeSlug ?: run {
        val prevEpInt = (currentEpNum - 1).coerceAtLeast(1)
        val slugRegex = Regex("(?i)(episode[-_]?)(\\d+)")
        if (slugRegex.containsMatchIn(uiState.episodeSlug)) {
            slugRegex.replace(uiState.episodeSlug) { m -> "${m.groupValues[1]}$prevEpInt" }
        } else {
            val altRegex = Regex("(?i)(ep[-_]?)(\\d+)")
            if (altRegex.containsMatchIn(uiState.episodeSlug)) {
                altRegex.replace(uiState.episodeSlug) { m -> "${m.groupValues[1]}$prevEpInt" }
            } else {
                "${uiState.episodeSlug}-$prevEpInt"
            }
        }
    }

    val hasNextEpisode = uiState.hasNextEpisode && !uiState.nextEpisodeSlug.isNullOrBlank()
    val nextEpLabel = uiState.nextEpisodeName ?: "Episode ${currentEpNum + 1}"
    val nextEpSlug = uiState.nextEpisodeSlug ?: run {
        val nextEpInt = currentEpNum + 1
        val slugRegex = Regex("(?i)(episode[-_]?)(\\d+)")
        if (slugRegex.containsMatchIn(uiState.episodeSlug)) {
            slugRegex.replace(uiState.episodeSlug) { m -> "${m.groupValues[1]}$nextEpInt" }
        } else {
            val altRegex = Regex("(?i)(ep[-_]?)(\\d+)")
            if (altRegex.containsMatchIn(uiState.episodeSlug)) {
                altRegex.replace(uiState.episodeSlug) { m -> "${m.groupValues[1]}$nextEpInt" }
            } else {
                "${uiState.episodeSlug}-$nextEpInt"
            }
        }
    }

    val displayTitle = remember(uiState.streamData?.title, resolvedAnimeTitle, uiState.episodeName) {
        uiState.streamData?.title ?: if (!uiState.episodeName.isNullOrBlank()) "$resolvedAnimeTitle ${uiState.episodeName}" else resolvedAnimeTitle
    }

    val handleNavigateToEpisode: (String, String) -> Unit = { targetSlug, targetLabel ->
        if (onNavigateToEpisode != null) {
            onNavigateToEpisode(targetSlug, resolvedAnimeTitle, targetLabel, uiState.posterUrl)
        } else {
            viewModel.playEpisode(targetSlug, resolvedAnimeTitle, targetLabel, uiState.posterUrl)
        }
    }

    val view = androidx.compose.ui.platform.LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (context.findActivity())?.window
            if (window != null) {
                window.statusBarColor = android.graphics.Color.parseColor("#161719")
                WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
            }
        }
    }

    // Fractional Continuous Player Sheet State (0.0f = Mini Player, 1.0f = Full Player)
    val fraction = remember { Animatable(if (uiState.isMinimized) 0f else 1f) }
    val dragOffsetX = remember { Animatable(0f) }
    var isDragging by remember { mutableStateOf(false) }

    // Synchronize with external ViewModel isMinimized changes
    LaunchedEffect(uiState.isMinimized) {
        if (!isDragging) {
            val target = if (uiState.isMinimized) 0f else 1f
            if (fraction.targetValue != target) {
                fraction.animateTo(
                    targetValue = target,
                    animationSpec = spring(
                        dampingRatio = Spring.DampingRatioNoBouncy,
                        stiffness = Spring.StiffnessMediumLow
                    )
                )
            }
        }
    }

    // Intercept Back button:
    // If in fullscreen -> exit fullscreen
    // If in expanded/fractional mode -> smoothly minimize to mini player
    BackHandler(enabled = fraction.value > 0.01f || isFullscreen) {
        if (isFullscreen) {
            isFullscreen = false
        } else {
            coroutineScope.launch {
                fraction.animateTo(
                    targetValue = 0f,
                    animationSpec = spring(
                        dampingRatio = Spring.DampingRatioNoBouncy,
                        stiffness = Spring.StiffnessMediumLow
                    )
                )
                viewModel.minimize()
                onMinimize()
            }
        }
    }

    BoxWithConstraints(
        modifier = modifier.fillMaxSize()
    ) {
        val screenWidth = maxWidth
        val screenHeight = maxHeight
        val density = LocalDensity.current

        val statusBarTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
        val navBarBottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()

        val miniBarH = 80.dp
        val miniVideoW = 80.dp * 16f / 9f
        val miniVideoH = 80.dp
        val miniY = screenHeight - navBarBottom - miniBarH

        val fullVideoY = if (isFullscreen) 0.dp else statusBarTop
        val fullVideoW = screenWidth
        val fullVideoH = if (isFullscreen) screenHeight else (screenWidth * 9f / 16f)

        val totalDragPx = with(density) { (miniY - fullVideoY).toPx().coerceAtLeast(1f) }

        val curFraction = fraction.value
        val curVideoX = if (curFraction < 0.05f) with(density) { dragOffsetX.value.toDp() } else 0.dp
        val curVideoY = lerp(miniY, fullVideoY, curFraction)
        val curVideoW = lerp(miniVideoW, fullVideoW, curFraction)
        val curVideoH = lerp(miniVideoH, fullVideoH, curFraction)

        // 1. Full Player Background Scrim
        if (curFraction > 0.01f) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(if (isFullscreen) Color.Black else WibufyBackground.copy(alpha = curFraction.coerceIn(0f, 1f)))
                    .pointerInput(Unit) {
                        detectTapGestures { }
                    }
            )
        }

        // 2. Kerangka Mini Player: strictly anchored at miniY, never lifting up during transition!
        if ((curFraction < 0.35f || isDragging) && !isFullscreen) {
            Box(
                modifier = Modifier
                    .offset {
                        IntOffset(
                            dragOffsetX.value.roundToInt(),
                            with(density) { miniY.roundToPx() }
                        )
                    }
                    .fillMaxWidth()
                    .height(miniBarH)
                    .graphicsLayer {
                        alpha = (1f - curFraction * 3.5f).coerceIn(0f, 1f)
                    }
                    .draggable(
                        orientation = Orientation.Vertical,
                        enabled = !isFullscreen,
                        state = rememberDraggableState { delta ->
                            isDragging = true
                            coroutineScope.launch {
                                val deltaFraction = -delta / totalDragPx
                                val next = (fraction.value + deltaFraction).coerceIn(0f, 1f)
                                fraction.snapTo(next)
                            }
                        },
                        onDragStopped = { velocity ->
                            coroutineScope.launch {
                                val target = when {
                                    velocity < -600f -> 1f
                                    velocity > 600f -> 0f
                                    fraction.value > 0.45f -> 1f
                                    else -> 0f
                                }
                                fraction.animateTo(
                                    targetValue = target,
                                    animationSpec = spring(
                                        dampingRatio = Spring.DampingRatioNoBouncy,
                                        stiffness = Spring.StiffnessMediumLow
                                    )
                                )
                                isDragging = false
                                if (target == 1f) {
                                    viewModel.expand()
                                } else {
                                    viewModel.minimize()
                                    onMinimize()
                                }
                            }
                        }
                    )
                    .draggable(
                        orientation = Orientation.Horizontal,
                        enabled = curFraction < 0.05f && !isDragging,
                        state = rememberDraggableState { delta ->
                            coroutineScope.launch {
                                dragOffsetX.snapTo(dragOffsetX.value + delta)
                            }
                        },
                        onDragStopped = { velocity ->
                            coroutineScope.launch {
                                if (kotlin.math.abs(dragOffsetX.value) > 180f || kotlin.math.abs(velocity) > 1000f) {
                                    viewModel.stopAndClose()
                                    dragOffsetX.snapTo(0f)
                                } else {
                                    dragOffsetX.animateTo(
                                        0f,
                                        animationSpec = spring(
                                            dampingRatio = Spring.DampingRatioMediumBouncy,
                                            stiffness = Spring.StiffnessLow
                                        )
                                    )
                                }
                            }
                        }
                    )
            ) {
                MiniPlayerKerangka(
                    viewModel = viewModel,
                    onExpand = {
                        coroutineScope.launch {
                            fraction.animateTo(1f)
                            viewModel.expand()
                        }
                    },
                    onClose = {
                        viewModel.stopAndClose()
                    }
                )
            }
        }

        // 3. Full Player Detail Content (Below the Video in Portrait Mode)
        if (curFraction > 0.15f && !isFullscreen) {
            val detailTop = curVideoY + curVideoH
            val detailHeight = (screenHeight - detailTop).coerceAtLeast(0.dp)
            val detailAlpha = ((curFraction - 0.2f) / 0.8f).coerceIn(0f, 1f)

            Box(
                modifier = Modifier
                    .offset {
                        IntOffset(0, with(density) { detailTop.roundToPx() })
                    }
                    .fillMaxWidth()
                    .height(detailHeight)
                    .graphicsLayer { alpha = detailAlpha }
                    .background(WibufyBackground)
            ) {
                Column(
                    modifier = Modifier.fillMaxSize()
                ) {
                    // 2. Tab Navigation (Bstation Style: Info | Komentar with Swipe Gesture)
                    PlayerHeaderTab(
                        selectedTab = selectedTab,
                        onTabSelected = { tab ->
                            selectedTab = tab
                            coroutineScope.launch {
                                pagerState.animateScrollToPage(tab)
                            }
                        }
                    )

                HorizontalPager(
                    state = pagerState,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                ) { page ->
                    if (page == 0) {
                        // TAB 1: INFO (Sintesis Bstation & Wibuku) - Scrollable
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState())
                        ) {
                            // Anime Header Card (Wibuku Style: Avatar + Metadata + Report Pill)
                            val resolvedPoster = uiState.posterUrl ?: posterUrl ?: ""
                            val resolvedViews = remember(uiState.episodeSlug, currentEpNum, resolvedAnimeTitle) {
                                val epKey = uiState.episodeSlug.ifBlank { "ep_$currentEpNum" }
                                val seed = (epKey.hashCode() xor resolvedAnimeTitle.hashCode()).let { if (it < 0) -it else it }
                                val viewsCount = 120_000 + (seed % 380_000)
                                java.text.NumberFormat.getIntegerInstance(java.util.Locale("id", "ID")).format(viewsCount)
                            }
                            val resolvedReleaseDate = remember(uiState.releaseDate, uiState.episodeSlug, currentEpNum) {
                                formatSmartReleaseDate(uiState.releaseDate, uiState.episodeSlug, currentEpNum)
                            }
                            PlayerAnimeHeaderCard(
                                posterUrl = resolvedPoster,
                                title = resolvedAnimeTitle,
                                episodeNum = "$currentEpNum",
                                views = resolvedViews,
                                releaseDate = resolvedReleaseDate,
                                onReportClick = {
                                    Toast.makeText(context, "Laporan masalah video terkirim", Toast.LENGTH_SHORT).show()
                                }
                            )

                            // Sinopsis Ringkas Expandable (Wibuku Style)
                            val displaySynopsis = uiState.synopsis?.takeIf { it.isNotBlank() }
                                ?: "Menceritakan petualangan seru dan kisah epik dalam dunia penuh misteri dan aksi tak terduga. Ikuti perjalanan para karakter dalam menghadapi rintangan menegangkan."
                            PlayerSynopsisSection(
                                synopsis = displaySynopsis,
                                isExpanded = isSynopsisExpanded,
                                onToggleExpand = { isSynopsisExpanded = !isSynopsisExpanded }
                            )

                            // Action Bar 1 Baris Simetris (Bstation Style: Suka, Subscribed, Unduh, Bagikan)
                            PlayerActionRow(
                                episodeSlug = uiState.episodeSlug,
                                isSubscribed = uiState.isBookmarked,
                                onSubscribeClick = {
                                    viewModel.toggleBookmark()
                                },
                                onDownloadClick = { showDownloadBottomSheet = true },
                                onShareClick = {
                                    handleShare(context, resolvedAnimeTitle, "Episode $currentEpNum")
                                }
                            )

                            // Modern Episode Selector (Bstation & Wibuku Style)
                            PlayerEpisodeSection(
                                episodeList = uiState.episodeList,
                                currentEpNum = currentEpNum,
                                onEpisodeClick = { epSlug, epNum ->
                                    handleNavigateToEpisode(epSlug, "Episode $epNum")
                                },
                                onOpenAllEpisodes = {
                                    showAllEpisodesBottomSheet = true
                                }
                            )

                            Spacer(modifier = Modifier.height(32.dp))
                        }
                    } else {
                        // TAB 2: KOMENTAR (Coming Soon seperti Halaman Profile - Ditengah layar)
                        Box(
                            modifier = Modifier
                                .fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            PlayerCommentComingSoon()
                        }
                    }
                }
            }
        }
    }

        // 4. The SINGLE Shared ExoPlayer Surface & Controls (Zero flicker, never re-created!)
        Box(
            modifier = Modifier
                .offset {
                    IntOffset(
                        with(density) { curVideoX.roundToPx() },
                        with(density) { curVideoY.roundToPx() }
                    )
                }
                .size(curVideoW, curVideoH)
                .graphicsLayer { clip = true }
                .draggable(
                    orientation = Orientation.Vertical,
                    enabled = !isFullscreen,
                    state = rememberDraggableState { delta ->
                        isDragging = true
                        coroutineScope.launch {
                            val deltaFraction = -delta / totalDragPx
                            val next = (fraction.value + deltaFraction).coerceIn(0f, 1f)
                            fraction.snapTo(next)
                        }
                    },
                    onDragStopped = { velocity ->
                        coroutineScope.launch {
                            val target = when {
                                velocity < -600f -> 1f
                                velocity > 600f -> 0f
                                fraction.value > 0.45f -> 1f
                                else -> 0f
                            }
                            fraction.animateTo(
                                targetValue = target,
                                animationSpec = spring(
                                    dampingRatio = Spring.DampingRatioNoBouncy,
                                    stiffness = Spring.StiffnessMediumLow
                                )
                            )
                            isDragging = false
                            if (target == 1f) {
                                viewModel.expand()
                            } else {
                                viewModel.minimize()
                                onMinimize()
                            }
                        }
                    }
                )
        ) {
            val isMini = curFraction < 0.3f
            val controlsAlpha = ((curFraction - 0.7f) / 0.3f).coerceIn(0f, 1f)

            when {
                uiState.isLoading && curFraction > 0.5f -> {
                    Box(modifier = Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            CircularProgressIndicator(
                                color = Color(0xFFFDD734),
                                strokeWidth = 3.5.dp,
                                modifier = Modifier.size(44.dp)
                            )
                            Spacer(modifier = Modifier.height(14.dp))
                            Text(
                                text = "Memuat Stream Video...",
                                color = Color(0xFFCACACA),
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
                uiState.error != null && curFraction > 0.5f -> {
                    Box(modifier = Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                            modifier = Modifier.padding(16.dp)
                        ) {
                            Text(
                                text = uiState.error ?: "Terjadi kesalahan",
                                color = Color(0xFFEF5350),
                                fontSize = 14.sp,
                                textAlign = TextAlign.Center
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = { viewModel.playEpisode(uiState.episodeSlug, uiState.animeTitle, uiState.episodeName, uiState.posterUrl) },
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2C2D30))
                            ) {
                                Text("Coba Lagi", color = Color.White)
                            }
                        }
                    }
                }
                else -> {
                    val url = uiState.currentQualityUrl
                    if (url != null) {
                        CustomVideoPlayer(
                            exoPlayer = viewModel.exoPlayer,
                            hasPrevEpisode = hasPrevEpisode,
                            prevEpisodeLabel = prevEpLabel,
                            hasNextEpisode = hasNextEpisode,
                            nextEpisodeLabel = nextEpLabel,
                            currentQuality = uiState.currentQuality ?: "480p",
                            playbackSpeed = uiState.playbackSpeed,
                            isFullscreen = isFullscreen,
                            isAutonextEnabled = uiState.isAutonextEnabled,
                            isLoading = uiState.isLoading,
                            isBuffering = uiState.isBuffering,
                            isPlaying = uiState.isPlaying,
                            currentPositionMs = uiState.currentPositionMs,
                            totalDurationMs = uiState.totalDurationMs,
                            bufferedPositionMs = uiState.bufferedPositionMs,
                            onToggleAutonext = { viewModel.toggleAutonext() },
                            onOpenQualityPicker = { showQualityBottomSheet = true },
                            onOpenSpeedPicker = { showSpeedBottomSheet = true },
                            onToggleFullscreen = { isFullscreen = !isFullscreen },
                            onNavigateBack = {
                                if (isFullscreen) {
                                    isFullscreen = false
                                } else {
                                    coroutineScope.launch {
                                        fraction.animateTo(0f)
                                        viewModel.minimize()
                                        onMinimize()
                                    }
                                }
                            },
                            onNavigatePrevious = {
                                if (hasPrevEpisode) {
                                    handleNavigateToEpisode(prevEpSlug, prevEpLabel)
                                }
                            },
                            onNavigateNext = {
                                if (hasNextEpisode) {
                                    handleNavigateToEpisode(nextEpSlug, nextEpLabel)
                                }
                            },
                            onTogglePlayPause = { viewModel.togglePlayPause() },
                            onSeekTo = { pos -> viewModel.seekTo(pos) },
                            onSeekBy = { delta -> viewModel.seekBy(delta) },
                            isMiniPlayer = isMini,
                            controlsAlpha = controlsAlpha,
                            onExpandFromMini = {
                                coroutineScope.launch {
                                    fraction.animateTo(1f)
                                    viewModel.expand()
                                }
                            },
                            modifier = Modifier.fillMaxSize()
                        )
                    } else if (curFraction > 0.5f) {
                        Box(modifier = Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                            Text(
                                text = "URL video tidak ditemukan.",
                                color = Color(0xFFCACACA),
                                fontSize = 14.sp
                            )
                        }
                    }
                }
            }
        }

    // Resolution BottomSheet Picker (Directly populated from ExoPlayer Track Selection)
    if (showQualityBottomSheet) {
        ModalBottomSheet(
            onDismissRequest = { showQualityBottomSheet = false },
            containerColor = Color(0xFF1E1F23)
        ) {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(
                    text = "Pilih Resolusi Video",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Spacer(modifier = Modifier.height(16.dp))

                // Always display full manual selector: Auto, 1080p, 720p, 480p, 360p
                val videoQualities = uiState.availableVideoQualities.ifEmpty { VideoQualityOption.DEFAULT_SELECTOR_OPTIONS }
                val currQuality = uiState.currentQuality
                val selOptionId = uiState.selectedQualityOptionId
                videoQualities.forEach { option ->
                    val isSelected = when {
                        !selOptionId.isNullOrEmpty() -> {
                            option.id.equals(selOptionId, ignoreCase = true)
                        }
                        option.isAuto -> {
                            currQuality.isNullOrEmpty() || currQuality.contains("auto", ignoreCase = true)
                        }
                        else -> {
                            currQuality?.contains("${option.height}", ignoreCase = true) == true
                        }
                    }
                    ListItem(
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        headlineContent = {
                            Text(
                                text = option.label,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) Color(0xFFFDD734) else Color.White
                            )
                        },
                        trailingContent = {
                            if (isSelected) {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = "Selected Quality",
                                    tint = Color(0xFFFDD734)
                                )
                            }
                        },
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable {
                                viewModel.setVideoQualityOption(option)
                                showQualityBottomSheet = false
                            }
                    )
                }
                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }

    // Playback Speed BottomSheet Picker
    if (showSpeedBottomSheet) {
        ModalBottomSheet(
            onDismissRequest = { showSpeedBottomSheet = false },
            containerColor = Color(0xFF1E1F23)
        ) {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(
                    text = "Kecepatan Pemutaran",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Spacer(modifier = Modifier.height(16.dp))
                val speeds = listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f)
                speeds.forEach { speed ->
                    val isSelected = uiState.playbackSpeed == speed
                    val label = if (speed == 1.0f) "Normal (1x)" else "${speed}x"
                    ListItem(
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        headlineContent = {
                            Text(
                                text = label,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) Color(0xFFFDD734) else Color.White
                            )
                        },
                        trailingContent = {
                            if (isSelected) {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = "Selected Speed",
                                    tint = Color(0xFFFDD734)
                                )
                            }
                        },
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable {
                                viewModel.setPlaybackSpeed(speed)
                                showSpeedBottomSheet = false
                            }
                    )
                }
                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }

    // Download BottomSheet Picker
    if (showDownloadBottomSheet) {
        ModalBottomSheet(
            onDismissRequest = { showDownloadBottomSheet = false },
            containerColor = Color(0xFF1E1F23)
        ) {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(
                    text = "Download Episode",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "Pilih resolusi video yang ingin diunduh",
                    fontSize = 13.sp,
                    color = Color(0xFF9E9E9E)
                )
                Spacer(modifier = Modifier.height(16.dp))
                val qualities = uiState.streamData?.qualities
                if (!qualities.isNullOrEmpty()) {
                    qualities.forEach { quality ->
                        ListItem(
                            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                            headlineContent = {
                                Text(
                                    text = "${quality.quality ?: "Video"} Resolution",
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color.White
                                )
                            },
                            leadingContent = {
                                Icon(
                                    imageVector = Icons.Outlined.FileDownload,
                                    contentDescription = null,
                                    tint = Color(0xFFFDD734)
                                )
                            },
                            trailingContent = {
                                Icon(
                                    imageVector = Icons.Rounded.ChevronRight,
                                    contentDescription = null,
                                    tint = Color.White.copy(alpha = 0.5f)
                                )
                            },
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable {
                                    handleDownload(
                                        context = context,
                                        url = quality.url ?: uiState.currentQualityUrl,
                                        animeTitle = resolvedAnimeTitle,
                                        qualityName = quality.quality ?: "video"
                                    )
                                    showDownloadBottomSheet = false
                                }
                        )
                    }
                } else {
                    ListItem(
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        headlineContent = {
                            Text(
                                text = "Download ${uiState.currentQuality ?: "Default"}",
                                fontWeight = FontWeight.SemiBold,
                                color = Color.White
                            )
                        },
                        leadingContent = {
                            Icon(
                                imageVector = Icons.Outlined.FileDownload,
                                contentDescription = null,
                                tint = Color(0xFFFDD734)
                            )
                        },
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .clickable {
                                handleDownload(
                                    context = context,
                                    url = uiState.currentQualityUrl,
                                    animeTitle = resolvedAnimeTitle,
                                    qualityName = uiState.currentQuality ?: "video"
                                )
                                showDownloadBottomSheet = false
                            }
                    )
                }
                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }

    // All Episodes BottomSheet Picker (Bstation Style - Option 1 Grid Box)
    if (showAllEpisodesBottomSheet) {
        ModalBottomSheet(
            onDismissRequest = { showAllEpisodesBottomSheet = false },
            containerColor = Color(0xFF1E1F23),
            dragHandle = {
                BottomSheetDefaults.DragHandle(
                    color = Color.White.copy(alpha = 0.2f)
                )
            }
        ) {
            PlayerAllEpisodesSheetContent(
                episodeList = uiState.episodeList,
                currentEpNum = currentEpNum,
                onClose = { showAllEpisodesBottomSheet = false },
                onEpisodeSelect = { epSlug, epNum ->
                    showAllEpisodesBottomSheet = false
                    handleNavigateToEpisode(epSlug, "Episode $epNum")
                }
            )
        }
    }
    }
}

@Composable
fun PlayerHeaderTab(
    selectedTab: Int,
    commentCount: Int = 219,
    onTabSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Tab 0: Info
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(4.dp))
                .clickable { onTabSelected(0) }
                .padding(vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Info",
                fontSize = 16.sp,
                fontWeight = if (selectedTab == 0) FontWeight.Bold else FontWeight.Normal,
                color = if (selectedTab == 0) Color(0xFFFFFFFF) else Color(0xFF8E8E93)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Box(
                modifier = Modifier
                    .width(28.dp)
                    .height(3.dp)
                    .clip(CircleShape)
                    .background(if (selectedTab == 0) Color(0xFFFFFFFF) else Color.Transparent)
            )
        }

        // Tab 1: Komentar
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(4.dp))
                .clickable { onTabSelected(1) }
                .padding(vertical = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Komentar",
                fontSize = 16.sp,
                fontWeight = if (selectedTab == 1) FontWeight.Bold else FontWeight.Normal,
                color = if (selectedTab == 1) Color(0xFFFFFFFF) else Color(0xFF8E8E93)
            )
            Spacer(modifier = Modifier.height(4.dp))
            Box(
                modifier = Modifier
                    .width(36.dp)
                    .height(3.dp)
                    .clip(CircleShape)
                    .background(if (selectedTab == 1) Color(0xFFFFFFFF) else Color.Transparent)
            )
        }
    }
}

@Composable
fun PlayerRankingBadge(
    category: String = "Populer",
    rank: String = "Top 7",
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = Color(0xFF1A1D24),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFDD734).copy(alpha = 0.35f)),
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clip(RoundedCornerShape(8.dp))
            .clickable { onClick() }
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = "🏆",
                    fontSize = 13.sp
                )
                Text(
                    text = "$category $rank",
                    color = Color(0xFFFDD734),
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Icon(
                imageVector = Icons.Rounded.ChevronRight,
                contentDescription = null,
                tint = Color(0xFFFDD734).copy(alpha = 0.8f),
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

@Composable
fun PlayerSynopsisSection(
    synopsis: String,
    isExpanded: Boolean,
    onToggleExpand: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
    ) {
        val cleanSynopsis = remember(synopsis) {
            synopsis.trim()
        }

        if (isExpanded) {
            Text(
                text = cleanSynopsis,
                color = Color(0xFFCCCCCC),
                fontSize = 13.sp,
                lineHeight = 19.5.sp,
                fontWeight = FontWeight.Normal,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null
                    ) { onToggleExpand() }
            )
            Spacer(modifier = Modifier.height(3.dp))
            Text(
                text = "Sembunyikan ▲",
                color = Color(0xFF3897F0),
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .clickable { onToggleExpand() }
                    .padding(vertical = 2.dp)
            )
        } else {
            var cutText by remember(cleanSynopsis) { mutableStateOf<String?>(null) }
            var canExpand by remember(cleanSynopsis) { mutableStateOf(false) }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null
                    ) {
                        if (canExpand) onToggleExpand()
                    }
            ) {
                if (cutText != null && canExpand) {
                    Text(
                        text = buildAnnotatedString {
                            append(cutText!!)
                            append("... ")
                            withStyle(
                                style = SpanStyle(
                                    color = Color(0xFF3897F0),
                                    fontWeight = FontWeight.Medium
                                )
                            ) {
                                append("Selengkapnya ▼")
                            }
                        },
                        color = Color(0xFFCCCCCC),
                        fontSize = 13.sp,
                        lineHeight = 19.5.sp,
                        fontWeight = FontWeight.Normal,
                        maxLines = 2
                    )
                } else {
                    Text(
                        text = cleanSynopsis,
                        color = Color(0xFFCCCCCC),
                        fontSize = 13.sp,
                        lineHeight = 19.5.sp,
                        fontWeight = FontWeight.Normal,
                        maxLines = 2,
                        overflow = TextOverflow.Clip,
                        onTextLayout = { textLayoutResult ->
                            if (textLayoutResult.hasVisualOverflow || textLayoutResult.lineCount > 2) {
                                canExpand = true
                                val lineEnd = textLayoutResult.getLineEnd(lineIndex = 1, visibleEnd = true)
                                // String "... Selengkapnya ▼" butuh alokasi ~20 karakter di baris kedua
                                val safeCutIndex = (lineEnd - 22).coerceAtLeast(0)
                                cutText = cleanSynopsis.substring(0, safeCutIndex).trimEnd()
                            } else {
                                canExpand = false
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun PlayerActionRow(
    episodeSlug: String,
    isSubscribed: Boolean,
    onSubscribeClick: () -> Unit,
    onDownloadClick: () -> Unit,
    onShareClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val baseLikes = remember(episodeSlug) {
        (episodeSlug.hashCode().toLong() and 0x7FFFFFFF) % 4500 + 3500
    }
    var isLiked by remember(episodeSlug) { mutableStateOf(false) }

    val formattedLikes = remember(baseLikes, isLiked) {
        val count = baseLikes + if (isLiked) 1 else 0
        if (count >= 1000) String.format(java.util.Locale.US, "%.1fK", count / 1000.0) else count.toString()
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceAround,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 1. Suka
        PlayerActionButtonItem(
            icon = if (isLiked) Icons.Filled.ThumbUp else Icons.Outlined.ThumbUp,
            label = formattedLikes,
            isSelected = isLiked,
            onClick = { isLiked = !isLiked }
        )

        // 2. Subscribed (Sinkron dengan Room Database / Tab Subscribed di Halaman Utama)
        PlayerActionButtonItem(
            icon = if (isSubscribed) Icons.Filled.Subscriptions else Icons.Outlined.Subscriptions,
            label = if (isSubscribed) "Subscribed" else "Subscribe",
            isSelected = isSubscribed,
            onClick = onSubscribeClick
        )

        // 3. Unduh
        PlayerActionButtonItem(
            icon = Icons.Outlined.FileDownload,
            label = "Unduh",
            isSelected = false,
            onClick = onDownloadClick
        )

        // 4. Bagikan
        PlayerActionButtonItem(
            icon = Icons.Outlined.Share,
            label = "Bagikan",
            isSelected = false,
            onClick = onShareClick
        )
    }
}

@Composable
private fun PlayerActionButtonItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    isSelected: Boolean = false,
    onClick: () -> Unit
) {
    val activeColor = Color(0xFFFFFFFF)
    val inactiveColor = Color(0xFF8E8E93)
    val color = if (isSelected) activeColor else inactiveColor

    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable { onClick() }
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = color,
            modifier = Modifier.size(22.dp)
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = label,
            color = color,
            fontSize = 11.5.sp,
            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
            maxLines = 1
        )
    }
}

internal fun extractEpisodeNumber(ep: com.prstyadev.wibufy.data.EpisodeItem): Int? {
    val titleStr = ep.title?.toString()?.trim() ?: ""
    val slug = ep.episodeId?.trim() ?: ""

    // Filter out non-regular items: Batch / Special / OVA / SP / Recap
    val isNonRegular = titleStr.contains("batch", ignoreCase = true) ||
            titleStr.contains("special", ignoreCase = true) ||
            titleStr.contains(Regex("""\bsp\b""", RegexOption.IGNORE_CASE)) ||
            titleStr.contains(Regex("""\bova\b""", RegexOption.IGNORE_CASE)) ||
            titleStr.contains("recap", ignoreCase = true) ||
            slug.contains("batch", ignoreCase = true) ||
            slug.contains("-sp-", ignoreCase = true) ||
            slug.contains("-ova-", ignoreCase = true) ||
            slug.contains("-special-", ignoreCase = true)

    if (isNonRegular) return null

    // 1. Pure number in title (e.g. "1176" or 1176)
    titleStr.toDoubleOrNull()?.toInt()?.let {
        if (it > 0) return it
    }

    // 2. Regex from title: "Episode 1176", "Ep 12", "Eps 05"
    val epTitleRegex = Regex("""(?:episode|eps|ep)?\s*(\d+)""", RegexOption.IGNORE_CASE)
    val matchTitle = epTitleRegex.find(titleStr)
    if (matchTitle != null) {
        val num = matchTitle.groupValues[1].toIntOrNull()
        if (num != null && num > 0) return num
    }

    // 3. Regex from slug: "one-piece-episode-1176-sub-indo"
    val epSlugRegex = Regex("""(?:episode|ep)-(\d+)""", RegexOption.IGNORE_CASE)
    val matchSlug = epSlugRegex.find(slug)
    if (matchSlug != null) {
        val num = matchSlug.groupValues[1].toIntOrNull()
        if (num != null && num > 0) return num
    }

    // 4. Fallback any digit sequence in title
    val anyDigit = Regex("""\d+""").find(titleStr)?.value?.toIntOrNull()
    if (anyDigit != null && anyDigit > 0) return anyDigit

    return null
}

@Composable
fun PlayerEpisodeSection(
    episodeList: List<com.prstyadev.wibufy.data.EpisodeItem>?,
    currentEpNum: Int,
    onEpisodeClick: (epSlug: String, epNum: Int) -> Unit,
    onOpenAllEpisodes: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    if (episodeList.isNullOrEmpty()) return

    val validEpisodes = remember(episodeList) {
        episodeList.mapNotNull { ep ->
            val num = extractEpisodeNumber(ep)
            if (num != null) num to ep else null
        }.distinctBy { it.first }.sortedBy { it.first }
    }

    if (validEpisodes.isEmpty()) return

    val totalEp = validEpisodes.size
    val latestEp = validEpisodes.last().first

    Column(modifier = modifier.fillMaxWidth()) {
        Spacer(modifier = Modifier.height(10.dp))
        // Header Bar: "Episode List" & "Terbaru EP X >" (Clickable)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Episode List",
                color = Color(0xFFE7E5E6),
                fontSize = 14.5.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .clip(RoundedCornerShape(4.dp))
                    .clickable { onOpenAllEpisodes() }
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .clickable { onOpenAllEpisodes() }
                    .padding(vertical = 4.dp, horizontal = 4.dp)
            ) {
                Text(
                    text = "Terbaru EP $latestEp",
                    color = Color(0xFF8E8E93),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.width(2.dp))
                Icon(
                    imageVector = Icons.Rounded.ChevronRight,
                    contentDescription = "Buka semua episode",
                    tint = Color(0xFF8E8E93),
                    modifier = Modifier.size(16.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Horizontal numbered squircle boxes [ 1 ] [ 2 ] [ 3 ] ...
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            validEpisodes.forEach { (epNum, ep) ->
                val isCurrent = epNum == currentEpNum
                val epSlug = ep.episodeId ?: ""

                Box(
                    modifier = Modifier
                        .defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (isCurrent) Color.White else Color(0xFF1E242E))
                        .clickable {
                            if (!isCurrent && epSlug.isNotBlank()) {
                                onEpisodeClick(epSlug, epNum)
                            }
                        }
                        .padding(horizontal = if (epNum >= 100) 10.dp else 4.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "$epNum",
                        color = if (isCurrent) Color(0xFF111215) else Color.White,
                        fontSize = if (epNum >= 1000) 14.sp else 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
fun PlayerCommentComingSoon(
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Rounded.Construction,
            contentDescription = "Coming Soon",
            tint = Color(0xFF8E8E93),
            modifier = Modifier.size(64.dp)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Komentar Coming Soon",
            color = Color(0xFFE7E5E6),
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Fitur komentar dan diskusi episode sedang dalam pengembangan.",
            color = Color(0xFF8E8E93),
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
            lineHeight = 18.sp
        )
    }
}

@Composable
fun PlayerAllEpisodesSheetContent(
    episodeList: List<com.prstyadev.wibufy.data.EpisodeItem>?,
    currentEpNum: Int,
    onClose: () -> Unit,
    onEpisodeSelect: (epSlug: String, epNum: Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val validEpisodes = remember(episodeList) {
        episodeList.orEmpty().mapNotNull { ep ->
            val num = extractEpisodeNumber(ep)
            if (num != null) num to ep else null
        }.distinctBy { it.first }.sortedBy { it.first }
    }

    if (validEpisodes.isEmpty()) {
        Box(
            modifier = modifier
                .fillMaxWidth()
                .padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "Daftar episode tidak tersedia",
                color = Color(0xFF8E8E93),
                fontSize = 14.sp
            )
        }
        return
    }

    val totalEp = validEpisodes.size
    var isAscending by rememberSaveable { mutableStateOf(true) }

    val sortedList = remember(validEpisodes, isAscending) {
        if (isAscending) validEpisodes else validEpisodes.reversed()
    }

    val gridState = rememberLazyGridState()
    val rowState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()

    // Range chunk tab untuk anime panjang (> 30 episode ala Bstation)
    val chunkSize = 30
    val rangeChunks = remember(totalEp) {
        if (totalEp > chunkSize) {
            val count = (totalEp + chunkSize - 1) / chunkSize
            (0 until count).map { index ->
                val start = index * chunkSize + 1
                val end = minOf((index + 1) * chunkSize, totalEp)
                "$start-$end" to (start to end)
            }
        } else emptyList()
    }

    // Auto-scroll ke posisi episode yang sedang aktif saat bottom sheet dibuka atau saat sortir diubah
    LaunchedEffect(currentEpNum, isAscending) {
        val targetIndex = sortedList.indexOfFirst { it.first == currentEpNum }
        if (targetIndex >= 0) {
            gridState.scrollToItem(maxOf(0, targetIndex - 5))
        }
        // Auto scroll barisan chip rentang ke posisi rentang aktif
        if (rangeChunks.isNotEmpty()) {
            val activeChunkIndex = rangeChunks.indexOfFirst { (_, range) -> currentEpNum in range.first..range.second }
            if (activeChunkIndex >= 0) {
                rowState.scrollToItem(maxOf(0, activeChunkIndex - 1))
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .fillMaxHeight(0.72f)
            .padding(bottom = 16.dp)
    ) {
        // Header Bar: Judul, Subtitle (Sedang diputar), Tombol Urutkan, & Tombol Tutup
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Semua episode",
                        color = Color(0xFFFFFFFF),
                        fontSize = 17.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "($totalEp Episode)",
                        color = Color(0xFF8E8E93),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Normal
                    )
                }
                Spacer(modifier = Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFFFFFFF))
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Sedang memutar: Episode $currentEpNum",
                        color = Color(0xFFB0B0B5),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Tombol Sortir (1-N / N-1)
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color(0xFF282A30),
                    modifier = Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .clickable { isAscending = !isAscending }
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.SwapVert,
                            contentDescription = "Urutkan",
                            tint = Color(0xFFFFFFFF),
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = if (isAscending) "1-$totalEp" else "$totalEp-1",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFFFFFFF)
                        )
                    }
                }

                // Tombol Tutup (X)
                IconButton(
                    onClick = onClose,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = "Tutup",
                        tint = Color(0xFF8E8E93),
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }

        // Tab Rentang Episode jika anime panjang (> 30 episode)
        if (rangeChunks.isNotEmpty()) {
            Spacer(modifier = Modifier.height(4.dp))
            LazyRow(
                state = rowState,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 4.dp)
            ) {
                items(rangeChunks) { (label, range) ->
                    val (startNum, endNum) = range
                    val isRangeActive = currentEpNum in startNum..endNum

                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = if (isRangeActive) Color.White.copy(alpha = 0.15f) else Color(0xFF24262C),
                        border = BorderStroke(
                            width = 1.dp,
                            color = if (isRangeActive) Color.White else Color.Transparent
                        ),
                        modifier = Modifier
                            .clip(RoundedCornerShape(14.dp))
                            .clickable {
                                coroutineScope.launch {
                                    val targetIndex = sortedList.indexOfFirst { (num, _) ->
                                        if (isAscending) num >= startNum else num <= endNum
                                    }
                                    if (targetIndex >= 0) {
                                        gridState.animateScrollToItem(targetIndex)
                                    }
                                }
                            }
                    ) {
                        Text(
                            text = label,
                            color = if (isRangeActive) Color.White else Color(0xFF8E8E93),
                            fontSize = 12.sp,
                            fontWeight = if (isRangeActive) FontWeight.Bold else FontWeight.Medium,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        // Grid Box Episode (5 Kolom) - Saran A: Minimalist Center Pure Numbers
        LazyVerticalGrid(
            columns = GridCells.Fixed(5),
            state = gridState,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            contentPadding = PaddingValues(bottom = 16.dp)
        ) {
            items(sortedList) { (epNum, ep) ->
                val isCurrent = epNum == currentEpNum
                val epSlug = ep.episodeId ?: ""

                Box(
                    modifier = Modifier
                        .aspectRatio(1.22f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (isCurrent) Color(0xFFFFFFFF) else Color(0xFF24262C))
                        .border(
                            width = 1.dp,
                            color = if (isCurrent) Color(0xFFFFFFFF) else Color.White.copy(alpha = 0.08f),
                            shape = RoundedCornerShape(10.dp)
                        )
                        .clickable {
                            if (!isCurrent && epSlug.isNotBlank()) {
                                onEpisodeSelect(epSlug, epNum)
                            }
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "$epNum",
                        color = if (isCurrent) Color(0xFF111215) else Color(0xFFE7E5E6),
                        fontSize = if (epNum >= 1000) 13.5.sp else 15.sp,
                        fontWeight = if (isCurrent) FontWeight.Black else FontWeight.SemiBold,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}

@Composable
fun PlayerCommentSection(
    inputText: String,
    onInputTextChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    PlayerCommentComingSoon(modifier = modifier)
}

@Composable
private fun PlayerAnimeHeaderCard(
    posterUrl: String,
    title: String,
    episodeNum: String,
    views: String?,
    releaseDate: String?,
    onReportClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Mini Avatar / Poster
        AsyncImage(
            model = posterUrl,
            contentDescription = title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(Color(0xFF1A1D24))
        )

        Spacer(modifier = Modifier.width(12.dp))

        // Title & Metadata
        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                text = title,
                color = Color(0xFFE7E5E6),
                fontSize = 14.5.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                lineHeight = 19.sp
            )
            Spacer(modifier = Modifier.height(3.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = "Episode $episodeNum",
                    color = Color(0xFF8E8E93),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
                if (!views.isNullOrBlank()) {
                    Text(text = "•", color = Color(0xFF555756), fontSize = 11.sp)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Visibility,
                            contentDescription = null,
                            tint = Color(0xFF8E8E93),
                            modifier = Modifier.size(13.dp)
                        )
                        Text(
                            text = views,
                            color = Color(0xFF8E8E93),
                            fontSize = 12.sp
                        )
                    }
                }
                if (!releaseDate.isNullOrBlank()) {
                    Text(text = "•", color = Color(0xFF555756), fontSize = 11.sp)
                    Text(
                        text = releaseDate,
                        color = Color(0xFF8E8E93),
                        fontSize = 11.5.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }

        Spacer(modifier = Modifier.width(8.dp))

        // Report Pill Button
        Surface(
            shape = CircleShape,
            color = Color(0xFF1A1D24),
            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFDD734).copy(alpha = 0.25f)),
            modifier = Modifier
                .height(30.dp)
                .clip(CircleShape)
                .clickable { onReportClick() }
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Filled.Flag,
                    contentDescription = "Report",
                    tint = Color(0xFFFDD734),
                    modifier = Modifier.size(13.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "Report",
                    color = Color(0xFFE7E5E6),
                    fontSize = 11.5.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

private fun handleDownload(
    context: Context,
    url: String?,
    animeTitle: String,
    qualityName: String
) {
    if (url.isNullOrBlank()) {
        Toast.makeText(context, "URL unduhan tidak tersedia.", Toast.LENGTH_SHORT).show()
        return
    }
    try {
        val uri = Uri.parse(url)
        val request = DownloadManager.Request(uri).apply {
            val safeTitle = "${animeTitle.replace(Regex("[^a-zA-Z0-9.-]"), "_")}_$qualityName.mp4"
            setTitle("$animeTitle ($qualityName)")
            setDescription("Mengunduh video anime...")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safeTitle)
            setAllowedOverMetered(true)
            setAllowedOverRoaming(true)
        }
        val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        manager.enqueue(request)
        Toast.makeText(context, "Memulai unduhan: $animeTitle ($qualityName)", Toast.LENGTH_SHORT).show()
    } catch (e: Exception) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            context.startActivity(intent)
        } catch (ex: Exception) {
            Toast.makeText(context, "Gagal mengunduh: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }
}

private fun handleShare(context: Context, title: String, episodeName: String) {
    val shareIntent = Intent().apply {
        action = Intent.ACTION_SEND
        putExtra(Intent.EXTRA_TEXT, "Nonton $title $episodeName di Wibufy!")
        type = "text/plain"
    }
    context.startActivity(Intent.createChooser(shareIntent, "Bagikan anime"))
}

@OptIn(UnstableApi::class)
@Composable
fun CustomVideoPlayer(
    exoPlayer: ExoPlayer,
    hasPrevEpisode: Boolean,
    prevEpisodeLabel: String,
    hasNextEpisode: Boolean,
    nextEpisodeLabel: String,
    currentQuality: String,
    playbackSpeed: Float,
    isFullscreen: Boolean,
    isAutonextEnabled: Boolean,
    isLoading: Boolean = false,
    isBuffering: Boolean,
    isPlaying: Boolean,
    currentPositionMs: Long,
    totalDurationMs: Long,
    bufferedPositionMs: Long,
    onToggleAutonext: () -> Unit,
    onOpenQualityPicker: () -> Unit,
    onOpenSpeedPicker: () -> Unit,
    onToggleFullscreen: () -> Unit,
    onNavigateBack: () -> Unit,
    onNavigatePrevious: () -> Unit,
    onNavigateNext: () -> Unit,
    onTogglePlayPause: () -> Unit,
    onSeekTo: (positionMs: Long) -> Unit,
    onSeekBy: (deltaMs: Long) -> Unit,
    modifier: Modifier = Modifier,
    isMiniPlayer: Boolean = false,
    controlsAlpha: Float = 1f,
    onExpandFromMini: () -> Unit = {}
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Auto-pause ExoPlayer on lifecycle pause/stop
    DisposableEffect(lifecycleOwner, exoPlayer) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) {
                exoPlayer.pause()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    var showControls by remember { mutableStateOf(false) }
    var isDraggingScrubber by remember { mutableStateOf(false) }
    var dragProgressMs by remember { mutableLongStateOf(0L) }
    var showDoubleTapRewind by remember { mutableStateOf(false) }
    var showDoubleTapForward by remember { mutableStateOf(false) }
    var doubleTapRewindCount by remember { mutableIntStateOf(0) }
    var doubleTapForwardCount by remember { mutableIntStateOf(0) }

    LaunchedEffect(doubleTapRewindCount) {
        if (doubleTapRewindCount > 0) {
            showDoubleTapRewind = true
            delay(650L)
            showDoubleTapRewind = false
        }
    }

    LaunchedEffect(doubleTapForwardCount) {
        if (doubleTapForwardCount > 0) {
            showDoubleTapForward = true
            delay(650L)
            showDoubleTapForward = false
        }
    }

    // Auto-hide controls timer (4 seconds of inactivity while playing and not dragging)
    LaunchedEffect(showControls, isPlaying, isDraggingScrubber) {
        if (showControls && isPlaying && !isDraggingScrubber) {
            delay(4000L)
            showControls = false
        }
    }

    // Dismiss controls immediately when buffering or loading starts
    LaunchedEffect(isBuffering, isLoading) {
        if (isBuffering || isLoading) {
            showControls = false
        }
    }

    Box(
        modifier = modifier
            .background(Color.Black)
            .pointerInput(isMiniPlayer, controlsAlpha) {
                detectTapGestures(
                    onTap = {
                        if (isMiniPlayer || controlsAlpha < 0.2f) {
                            onExpandFromMini()
                        } else {
                            showControls = !showControls
                        }
                    },
                    onDoubleTap = { offset ->
                        if (!isMiniPlayer && controlsAlpha >= 0.8f) {
                            val width = size.width
                            if (offset.x < width * 0.45f) {
                                onSeekBy(-10000L)
                                doubleTapRewindCount++
                            } else if (offset.x > width * 0.55f) {
                                onSeekBy(10000L)
                                doubleTapForwardCount++
                            } else {
                                onTogglePlayPause()
                            }
                        }
                    }
                )
            },
        contentAlignment = Alignment.Center
    ) {
        // Android ExoPlayer View (Backed by TextureView for seamless animations, gestures, and zero EGL context errors)
        AndroidView(
            factory = { ctx ->
                (LayoutInflater.from(ctx).inflate(R.layout.view_video_player, null) as PlayerView).apply {
                    player = exoPlayer
                    keepScreenOn = true
                    layoutParams = FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                }
            },
            update = { playerView ->
                if (playerView.player != exoPlayer) {
                    playerView.player = exoPlayer
                }
            },
            onRelease = { playerView ->
                if (playerView.player == exoPlayer) {
                    playerView.player = null
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        // Double-Tap Rewind 10s Feedback
        AnimatedVisibility(
            visible = showDoubleTapRewind,
            enter = fadeIn(animationSpec = tween(200)),
            exit = fadeOut(animationSpec = tween(250)),
            modifier = Modifier.align(Alignment.CenterStart)
        ) {
            Box(
                modifier = Modifier
                    .padding(start = 64.dp)
                    .background(Color.Transparent)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Replay10,
                        contentDescription = "Mundur 10 Detik",
                        tint = Color.White,
                        modifier = Modifier.size(28.dp)
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "-10 Detik",
                        style = TextStyle(
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            shadow = overlayTextShadow
                        )
                    )
                }
            }
        }

        // Double-Tap Forward 10s Feedback
        AnimatedVisibility(
            visible = showDoubleTapForward,
            enter = fadeIn(animationSpec = tween(200)),
            exit = fadeOut(animationSpec = tween(250)),
            modifier = Modifier.align(Alignment.CenterEnd)
        ) {
            Box(
                modifier = Modifier
                    .padding(end = 64.dp)
                    .background(Color.Transparent)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Forward10,
                        contentDescription = "Maju 10 Detik",
                        tint = Color.White,
                        modifier = Modifier.size(28.dp)
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "+10 Detik",
                        style = TextStyle(
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            shadow = overlayTextShadow
                        )
                    )
                }
            }
        }

        // Buffering Indicator - Full Mode
        AnimatedVisibility(
            visible = isBuffering && !isMiniPlayer && controlsAlpha > 0.5f,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.45f)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    color = Color(0xFFFDD734),
                    modifier = Modifier.size(52.dp),
                    strokeWidth = 4.dp
                )
            }
        }

        // Buffering Indicator - Mini Mode (compact yellow spinner)
        if (isBuffering && (isMiniPlayer || controlsAlpha <= 0.5f)) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.4f)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(
                    color = Color(0xFFFDD734),
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(18.dp)
                )
            }
        }

        // Custom Overlay UI (Hidden when buffering or loading so it doesn't cover spinner)
        AnimatedVisibility(
            visible = showControls && !isMiniPlayer && !isLoading && !isBuffering && controlsAlpha > 0.15f,
            enter = fadeIn(animationSpec = tween(300)),
            exit = fadeOut(animationSpec = tween(300)),
            modifier = Modifier.graphicsLayer { alpha = controlsAlpha }
        ) {
            Box(
                modifier = Modifier.fillMaxSize()
            ) {
                // Bottom Gradient Scrim
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(110.dp)
                        .align(Alignment.BottomCenter)
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color.Transparent,
                                    Color(0xFF161719).copy(alpha = 0.50f),
                                    Color(0xFF161719).copy(alpha = 0.92f)
                                )
                            )
                        )
                )

                // Center Controls Container (Anchored at exact center)
                Box(
                    modifier = Modifier
                        .align(Alignment.Center)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                ) {
                    // 1. Skip Previous (Anchored to Left)
                    if (hasPrevEpisode) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier
                                .align(Alignment.CenterStart)
                                .widthIn(min = 48.dp, max = 84.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null
                                ) {
                                    onNavigatePrevious()
                                }
                                .padding(horizontal = 4.dp, vertical = 4.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.SkipPrevious,
                                contentDescription = "Previous Episode",
                                tint = Color.White,
                                modifier = Modifier.size(36.dp)
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = prevEpisodeLabel,
                                style = TextStyle(
                                    color = Color.White,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    shadow = overlayTextShadow
                                ),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }

                    // 2. Center Trio: [Replay 10s] [Play/Pause] [Forward 10s] (Mathematically locked at exact Center)
                    Row(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(
                            onClick = { onSeekBy(-10000L) },
                            modifier = Modifier.size(48.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Replay10,
                                contentDescription = "Replay 10s",
                                tint = Color.White,
                                modifier = Modifier.size(34.dp)
                            )
                        }

                        // Main Big White Play / Pause Circle Button
                        Box(
                            modifier = Modifier
                                .size(58.dp)
                                .shadow(6.dp, CircleShape)
                                .clip(CircleShape)
                                .background(Color.White)
                                .clickable { onTogglePlayPause() },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = if (isPlaying) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                                contentDescription = if (isPlaying) "Pause" else "Play",
                                tint = Color(0xFF1E1F24),
                                modifier = Modifier.size(34.dp)
                            )
                        }

                        IconButton(
                            onClick = { onSeekBy(10000L) },
                            modifier = Modifier.size(48.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Forward10,
                                contentDescription = "Forward 10s",
                                tint = Color.White,
                                modifier = Modifier.size(34.dp)
                            )
                        }
                    }

                    // 3. Skip Next (Anchored to Right)
                    if (hasNextEpisode) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier
                                .align(Alignment.CenterEnd)
                                .widthIn(min = 48.dp, max = 84.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .clickable(
                                    interactionSource = remember { MutableInteractionSource() },
                                    indication = null
                                ) {
                                    onNavigateNext()
                                }
                                .padding(horizontal = 4.dp, vertical = 4.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.SkipNext,
                                contentDescription = "Next Episode",
                                tint = Color.White,
                                modifier = Modifier.size(36.dp)
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = nextEpisodeLabel,
                                style = TextStyle(
                                    color = Color.White,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    shadow = overlayTextShadow
                                ),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }

                // Bottom Row Controls (Time, Autonext, Resolution, Speed, Fullscreen) & Scrubber
                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val displayPosMs = if (isDraggingScrubber) dragProgressMs else currentPositionMs
                        Text(
                            text = "${formatDurationMs(displayPosMs)} / ${formatDurationMs(totalDurationMs)}",
                            style = TextStyle(
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                shadow = overlayTextShadow
                            )
                        )

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            Row(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .clickable { onToggleAutonext() }
                                    .padding(horizontal = 4.dp, vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.PlayArrow,
                                    contentDescription = null,
                                    tint = if (isAutonextEnabled) Color.White else Color.White.copy(alpha = 0.5f),
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(2.dp))
                                Text(
                                    text = "Autonext",
                                    style = TextStyle(
                                        color = if (isAutonextEnabled) Color.White else Color.White.copy(alpha = 0.5f),
                                        fontSize = 14.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        shadow = overlayTextShadow
                                    )
                                )
                            }

                            Text(
                                text = currentQuality,
                                style = TextStyle(
                                    color = Color.White,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold,
                                    shadow = overlayTextShadow
                                ),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .clickable { onOpenQualityPicker() }
                                    .padding(horizontal = 4.dp, vertical = 2.dp)
                            )

                            val speedText = if (playbackSpeed == 1f) "1x" else "${playbackSpeed}x"
                            Text(
                                text = speedText,
                                style = TextStyle(
                                    color = Color.White,
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Bold,
                                    shadow = overlayTextShadow
                                ),
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .clickable { onOpenSpeedPicker() }
                                    .padding(horizontal = 4.dp, vertical = 2.dp)
                            )

                            IconButton(
                                onClick = onToggleFullscreen,
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(
                                    imageVector = if (isFullscreen) Icons.Filled.FullscreenExit else Icons.Filled.Fullscreen,
                                    contentDescription = if (isFullscreen) "Exit Fullscreen" else "Enter Fullscreen",
                                    tint = Color.White,
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                        }
                    }

                    // Scrubber Bar
                    val progressFraction = if (totalDurationMs > 0) {
                        val pos = if (isDraggingScrubber) dragProgressMs else currentPositionMs
                        (pos.toFloat() / totalDurationMs.toFloat()).coerceIn(0f, 1f)
                    } else 0f

                    val bufferedFraction = if (totalDurationMs > 0) {
                        (bufferedPositionMs.toFloat() / totalDurationMs.toFloat()).coerceIn(0f, 1f)
                    } else 0f

                    BoxWithConstraints(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(20.dp)
                            .pointerInput(totalDurationMs) {
                                detectTapGestures { offset ->
                                    if (totalDurationMs > 0) {
                                        val newFraction = (offset.x / size.width.toFloat()).coerceIn(0f, 1f)
                                        val targetMs = (newFraction * totalDurationMs).toLong()
                                        onSeekTo(targetMs)
                                    }
                                }
                            }
                            .pointerInput(totalDurationMs) {
                                detectDragGestures(
                                    onDragStart = { offset ->
                                        if (totalDurationMs > 0) {
                                            isDraggingScrubber = true
                                            val fraction = (offset.x / size.width.toFloat()).coerceIn(0f, 1f)
                                            dragProgressMs = (fraction * totalDurationMs).toLong()
                                        }
                                    },
                                    onDragEnd = {
                                        if (totalDurationMs > 0) {
                                            onSeekTo(dragProgressMs)
                                            isDraggingScrubber = false
                                        }
                                    },
                                    onDragCancel = {
                                        isDraggingScrubber = false
                                    },
                                    onDrag = { change, _ ->
                                        change.consume()
                                        if (totalDurationMs > 0) {
                                            val fraction = (change.position.x / size.width.toFloat()).coerceIn(0f, 1f)
                                            dragProgressMs = (fraction * totalDurationMs).toLong()
                                        }
                                    }
                                )
                            },
                        contentAlignment = Alignment.CenterStart
                    ) {
                        val availableWidth = maxWidth

                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(3.5.dp)
                                .background(Color.White.copy(alpha = 0.25f))
                        )

                        Box(
                            modifier = Modifier
                                .fillMaxWidth(bufferedFraction)
                                .height(3.5.dp)
                                .background(Color.White.copy(alpha = 0.5f))
                        )

                        Box(
                            modifier = Modifier
                                .fillMaxWidth(progressFraction)
                                .height(3.5.dp)
                                .background(Color(0xFFE50914))
                        )

                        val thumbOffset = availableWidth * progressFraction - 6.dp
                        Box(
                            modifier = Modifier
                                .offset(x = thumbOffset.coerceAtLeast(0.dp))
                                .size(12.dp)
                                .shadow(4.dp, CircleShape)
                                .clip(CircleShape)
                                .background(Color(0xFFE50914))
                        )
                    }
                }
            }
        }
    }
}

private fun formatDurationMs(ms: Long): String {
    if (ms <= 0L) return "00:00"
    val totalSec = ms / 1000
    val hours = totalSec / 3600
    val min = (totalSec % 3600) / 60
    val sec = totalSec % 60
    return if (hours > 0) {
        String.format("%02d:%02d:%02d", hours, min, sec)
    } else {
        String.format("%02d:%02d", min, sec)
    }
}

private fun formatSmartReleaseDate(rawDate: String?, episodeSlug: String, episodeNum: Int): String {
    val trimmed = rawDate?.trim() ?: ""
    if (trimmed.isNotBlank()) {
        val lower = trimmed.lowercase()
        if (lower.contains("hari ini") || lower == "today") return "Hari ini"
        if (lower.contains("kemarin") || lower == "yesterday") return "Kemarin"
        if (lower.contains("hari yang lalu") || lower.contains("hari lalu")) return trimmed
        if (lower.contains("jam yang lalu") || lower.contains("menit yang lalu")) return "Hari ini"

        // Coba parsing format tanggal umum (misal: "2024-08-15", "15 Aug 2024", "15-08-2024", "15 Agustus 2024", dsb)
        val patterns = listOf(
            "yyyy-MM-dd",
            "dd-MM-yyyy",
            "dd/MM/yyyy",
            "yyyy/MM/dd",
            "d MMM yyyy",
            "dd MMM yyyy",
            "d MMMM yyyy",
            "dd MMMM yyyy",
            "MMM dd, yyyy",
            "MMMM dd, yyyy",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        )

        for (pattern in patterns) {
            try {
                val sdf = java.text.SimpleDateFormat(pattern, java.util.Locale.ENGLISH).apply {
                    isLenient = true
                }
                val parsed = sdf.parse(trimmed)
                if (parsed != null) {
                    return calculateRelativeOrFormattedDate(parsed)
                }
            } catch (_: Exception) { }

            try {
                val sdfId = java.text.SimpleDateFormat(pattern, java.util.Locale("id", "ID")).apply {
                    isLenient = true
                }
                val parsed = sdfId.parse(trimmed)
                if (parsed != null) {
                    return calculateRelativeOrFormattedDate(parsed)
                }
            } catch (_: Exception) { }
        }

        return trimmed
    }

    // Fallback deterministik berbasis episode ID/slug jika tanggal kosong dari API
    val epKey = episodeSlug.ifBlank { "ep_$episodeNum" }
    val seed = (epKey.hashCode().let { if (it < 0) -it else it })
    val daysAgo = (seed % 14) // 0 s.d. 13 hari

    return when {
        daysAgo == 0 -> "Hari ini"
        daysAgo == 1 -> "Kemarin"
        daysAgo in 2..6 -> "$daysAgo hari yang lalu"
        else -> {
            // Lebih dari seminggu: tampilkan tanggal rilis
            val cal = java.util.Calendar.getInstance()
            cal.add(java.util.Calendar.DAY_OF_YEAR, -daysAgo)
            val displayFormat = java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale("id", "ID"))
            displayFormat.format(cal.time)
        }
    }
}

private fun calculateRelativeOrFormattedDate(date: java.util.Date): String {
    val now = java.util.Calendar.getInstance()
    val target = java.util.Calendar.getInstance().apply { time = date }

    val diffMillis = now.timeInMillis - target.timeInMillis
    val diffDays = (diffMillis / (1000 * 60 * 60 * 24)).toInt()

    return when {
        diffDays <= 0 -> "Hari ini"
        diffDays == 1 -> "Kemarin"
        diffDays in 2..6 -> "$diffDays hari yang lalu"
        else -> {
            val displayFormat = if (now.get(java.util.Calendar.YEAR) == target.get(java.util.Calendar.YEAR)) {
                java.text.SimpleDateFormat("d MMM", java.util.Locale("id", "ID"))
            } else {
                java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale("id", "ID"))
            }
            displayFormat.format(date)
        }
    }
}

