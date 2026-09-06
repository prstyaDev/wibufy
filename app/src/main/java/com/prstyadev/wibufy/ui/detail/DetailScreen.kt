package com.prstyadev.wibufy.ui.detail

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.ViewList
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.prstyadev.wibufy.data.EpisodeItem

@Composable
fun DetailScreen(
    animeId: String,
    onNavigateBack: () -> Unit,
    onNavigateToPlayer: (episodeSlug: String, animeTitle: String?, episodeName: String?, posterUrl: String?, episodeList: List<EpisodeItem>?) -> Unit,
    viewModel: DetailViewModel = viewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(animeId) {
        viewModel.loadAnimeDetail(animeId)
    }

    val anime = uiState.detailData?.anime
    val listState = rememberLazyListState()

    // Synopsis expand state
    var isSynopsisExpanded by remember { mutableStateOf(false) }

    // Episode controls state: Grid vs List & Sort Order
    var isGridMode by remember { mutableStateOf(false) }
    var isSortAscending by remember { mutableStateOf(false) } // Default: newest first, like Wibuku

    // Parallax scroll calculation (smooth upward translation at 0.45x scroll speed)
    val parallaxOffset = remember {
        derivedStateOf {
            if (listState.firstVisibleItemIndex == 0) {
                listState.firstVisibleItemScrollOffset * 0.45f
            } else {
                1000f
            }
        }
    }

    // TopBar background alpha based on scroll
    val topBarAlpha by remember {
        derivedStateOf {
            if (listState.firstVisibleItemIndex > 0) 1f
            else (listState.firstVisibleItemScrollOffset / 400f).coerceIn(0f, 1f)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        if (uiState.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color(0xFF3EA5F4))
            }
        } else if (uiState.error != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = uiState.error ?: "Gagal memuat detail anime",
                        color = Color.White.copy(alpha = 0.8f),
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.bodyLarge
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = { viewModel.loadAnimeDetail(animeId) },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF3EA5F4))
                    ) {
                        Text("Coba Lagi", color = Color.White)
                    }
                }
            }
        } else if (anime != null) {
            val episodes = anime.episodeList ?: emptyList()

            // Sort episodes based on toggle
            val sortedEpisodes = remember(episodes, isSortAscending) {
                if (isSortAscending) {
                    // Ascending: Eps 1 -> N
                    episodes.reversed()
                } else {
                    // Descending: Eps N -> 1 (Original API order is usually latest first)
                    episodes
                }
            }

            // 1. BACKGROUND PARALLAX POSTER BANNER (Higher height & Ultra Smooth Multi-stop Gradient)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(420.dp)
                    .graphicsLayer {
                        translationY = -parallaxOffset.value
                        alpha = (1f - (parallaxOffset.value / 380f)).coerceIn(0f, 1f)
                    }
                    .clipToBounds()
            ) {
                AsyncImage(
                    model = anime.poster,
                    contentDescription = anime.displayTitle,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )

                // Multi-stop Cinematic Gradient: Dark top vignette, crystal clear hero focus, and deep gradual fade to solid background
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.verticalGradient(
                                colorStops = arrayOf(
                                    0.0f to Color.Black.copy(alpha = 0.65f),
                                    0.20f to Color.Black.copy(alpha = 0.15f),
                                    0.40f to Color.Transparent,
                                    0.60f to MaterialTheme.colorScheme.background.copy(alpha = 0.45f),
                                    0.78f to MaterialTheme.colorScheme.background.copy(alpha = 0.88f),
                                    0.92f to MaterialTheme.colorScheme.background.copy(alpha = 0.98f),
                                    1.0f to MaterialTheme.colorScheme.background
                                )
                            )
                        )
                )
            }

            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = 96.dp)
            ) {
                // 1. HERO HEADER & OVERVIEW
                item {
                    // Transparent Spacer so the top hero banner shows through naturally
                    Spacer(modifier = Modifier.height(240.dp))

                    // Bottom Hero Content (Schedule pill, Main Title, Alt Title)
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 18.dp, vertical = 6.dp)
                    ) {
                        // Schedule / Broadcast Badge if present
                        val scheduleText = anime.aired?.takeIf { it.isNotBlank() }
                            ?: anime.status?.takeIf { it.isNotBlank() }
                        if (!scheduleText.isNullOrBlank()) {
                            Surface(
                                shape = RoundedCornerShape(20.dp),
                                color = Color(0x33FFB300),
                                border = BorderStroke(1.dp, Color(0xFFFFB300).copy(alpha = 0.35f)),
                                modifier = Modifier.padding(bottom = 10.dp)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.CalendarToday,
                                        contentDescription = null,
                                        tint = Color(0xFFFFC107),
                                        modifier = Modifier.size(12.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = scheduleText,
                                        color = Color(0xFFFFD54F),
                                        fontSize = 11.5.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        }

                        // Main Title (Clear, readable, with soft shadow)
                        val mainTitle = anime.displayTitle.ifBlank {
                            animeId.replace("-", " ").split(" ").joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
                        }
                        Text(
                            text = mainTitle,
                            style = MaterialTheme.typography.headlineSmall.copy(
                                fontSize = 23.sp,
                                lineHeight = 30.sp,
                                shadow = Shadow(
                                    color = Color.Black.copy(alpha = 0.7f),
                                    offset = Offset(0f, 2f),
                                    blurRadius = 6f
                                )
                            ),
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis
                        )

                        // Alternative Title (Japanese or Synonyms or English if different from main title)
                        val altTitle = listOfNotNull(anime.japanese, anime.english, anime.synonyms)
                            .firstOrNull { it.isNotBlank() && !it.equals(mainTitle, ignoreCase = true) }
                        if (!altTitle.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = altTitle,
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White.copy(alpha = 0.60f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }

                    // 2. METADATA BADGES, GENRES & ACTION BUTTONS
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 18.dp)
                    ) {
                        Spacer(modifier = Modifier.height(10.dp))

                        // Streamlined Clean Metadata Row (Rating, Status, Type, Duration/Eps)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Rating Chip
                            val scoreVal = anime.score?.value ?: "N/A"
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color(0x22FFC107),
                                border = BorderStroke(1.dp, Color(0xFFFFC107).copy(alpha = 0.35f))
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Star,
                                        contentDescription = null,
                                        tint = Color(0xFFFFC107),
                                        modifier = Modifier.size(13.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = scoreVal,
                                        color = Color(0xFFFFD54F),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }

                            // Status Chip
                            val statusVal = anime.status ?: "Ongoing"
                            val isOngoing = statusVal.contains("Ongoing", ignoreCase = true)
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = if (isOngoing) Color(0x1F00E676) else Color(0x1F9C27B0),
                                border = BorderStroke(
                                    1.dp,
                                    if (isOngoing) Color(0xFF00E676).copy(alpha = 0.35f) else Color(0xFF9C27B0).copy(alpha = 0.35f)
                                )
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(6.dp)
                                            .clip(CircleShape)
                                            .background(if (isOngoing) Color(0xFF00E676) else Color(0xFFCE93D8))
                                    )
                                    Spacer(modifier = Modifier.width(5.dp))
                                    Text(
                                        text = statusVal,
                                        color = if (isOngoing) Color(0xFF69F0AE) else Color(0xFFE1BEE7),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }

                            // Type Chip (TV / Movie)
                            val typeVal = anime.type?.takeIf { it.isNotBlank() } ?: "TV"
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color.White.copy(alpha = 0.07f),
                                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.10f))
                            ) {
                                Text(
                                    text = typeVal,
                                    color = Color.White.copy(alpha = 0.85f),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Medium,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }

                            // Duration or Episode Count Chip
                            val durationOrEps = anime.duration?.takeIf { it.isNotBlank() }
                                ?: anime.episodes?.takeIf { it.isNotBlank() }?.let { "$it Eps" }
                                ?: if (episodes.isNotEmpty()) "${episodes.size} Eps" else null

                            if (!durationOrEps.isNullOrBlank()) {
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = Color.White.copy(alpha = 0.07f),
                                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.10f))
                                ) {
                                    Text(
                                        text = durationOrEps,
                                        color = Color.White.copy(alpha = 0.85f),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }
                        }

                        // Horizontal Genre Chips (Pills with soft background)
                        val genreList = anime.genreList ?: emptyList()
                        if (genreList.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(10.dp))
                            LazyRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                contentPadding = PaddingValues(vertical = 2.dp)
                            ) {
                                items(genreList) { genre ->
                                    Surface(
                                        shape = RoundedCornerShape(20.dp),
                                        color = Color.White.copy(alpha = 0.05f),
                                        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.10f))
                                    ) {
                                        Text(
                                            text = genre.title ?: "",
                                            color = Color.White.copy(alpha = 0.80f),
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Normal,
                                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(18.dp))

                        // 3. ACTION BUTTONS (Mulai Tonton / Lanjut Eps & Subscribe)
                        val lastHistory = uiState.lastWatchedHistory
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // Watch Action Button with built-in progress bar
                            val buttonText = if (lastHistory != null) {
                                val epName = lastHistory.episodeName ?: "Eps 1"
                                if (epName.contains("Episode", ignoreCase = true)) {
                                    epName.replace(Regex("Episode\\s*", RegexOption.IGNORE_CASE), "Lanjut Eps ")
                                } else if (epName.startsWith("Eps", ignoreCase = true)) {
                                    "Lanjut $epName"
                                } else {
                                    "Lanjut Eps $epName"
                                }
                            } else {
                                "Mulai Tonton"
                            }

                            val hasProgress = lastHistory != null && lastHistory.totalDurationMs > 0
                            val progressRatio = if (hasProgress) {
                                (lastHistory.lastPositionMs.toFloat() / lastHistory.totalDurationMs.toFloat()).coerceIn(0f, 1f)
                            } else 0f

                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = Color.Transparent,
                                modifier = Modifier
                                    .weight(1f)
                                    .height(46.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .clickable {
                                        if (lastHistory != null && !lastHistory.episodeSlug.isBlank()) {
                                            onNavigateToPlayer(
                                                lastHistory.episodeSlug,
                                                anime.displayTitle.ifBlank { anime.title },
                                                lastHistory.episodeName ?: "Episode 1",
                                                anime.poster,
                                                anime.episodeList
                                            )
                                        } else {
                                            val firstEp = findFirstEpisode(anime.episodeList)
                                            if (firstEp?.episodeId != null) {
                                                val epNum = firstEp.title.toString().toDoubleOrNull()?.toInt()?.toString() ?: firstEp.title.toString()
                                                val epTitle = "Episode $epNum"
                                                onNavigateToPlayer(
                                                    firstEp.episodeId,
                                                    anime.displayTitle.ifBlank { anime.title },
                                                    epTitle,
                                                    anime.poster,
                                                    anime.episodeList
                                                )
                                            }
                                        }
                                    }
                            ) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(
                                            Brush.horizontalGradient(
                                                colors = listOf(Color(0xFF29B6F6), Color(0xFF0288D1))
                                            )
                                        )
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .padding(horizontal = 14.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.PlayArrow,
                                            contentDescription = null,
                                            tint = Color.White,
                                            modifier = Modifier.size(22.dp)
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Column(
                                            verticalArrangement = Arrangement.Center,
                                            horizontalAlignment = Alignment.Start
                                        ) {
                                            Text(
                                                text = buttonText,
                                                color = Color.White,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 14.sp,
                                                maxLines = 1,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                            if (hasProgress) {
                                                Text(
                                                    text = "${formatDurationMs(lastHistory.lastPositionMs)} / ${formatDurationMs(lastHistory.totalDurationMs)}",
                                                    color = Color.White.copy(alpha = 0.85f),
                                                    fontSize = 10.5.sp,
                                                    fontWeight = FontWeight.Medium
                                                )
                                            }
                                        }
                                    }

                                    // Integrated subtle progress indicator at the bottom edge of the button
                                    if (hasProgress && progressRatio > 0f) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(3.dp)
                                                .align(Alignment.BottomCenter)
                                                .background(Color.Black.copy(alpha = 0.25f))
                                        ) {
                                            Box(
                                                modifier = Modifier
                                                    .fillMaxWidth(progressRatio)
                                                    .fillMaxHeight()
                                                    .background(Color(0xFFFFD54F))
                                            )
                                        }
                                    }
                                }
                            }

                            // Subscribe Button (Sleek Outline / Filled)
                            val isSubscribed = uiState.isBookmarked
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = if (isSubscribed) Color.White else Color.White.copy(alpha = 0.07f),
                                border = BorderStroke(
                                    1.dp,
                                    if (isSubscribed) Color.White else Color.White.copy(alpha = 0.16f)
                                ),
                                modifier = Modifier
                                    .weight(1f)
                                    .height(46.dp)
                                    .clip(RoundedCornerShape(14.dp))
                                    .clickable { viewModel.toggleBookmark(animeId) }
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(horizontal = 14.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.Center
                                ) {
                                    Icon(
                                        imageVector = if (isSubscribed) Icons.Filled.Notifications else Icons.Outlined.Notifications,
                                        contentDescription = if (isSubscribed) "Subscribed" else "Subscribe",
                                        tint = if (isSubscribed) Color(0xFF1E1F24) else Color.White,
                                        modifier = Modifier.size(19.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = if (isSubscribed) "Subscribed" else "Subscribe",
                                        color = if (isSubscribed) Color(0xFF1E1F24) else Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(22.dp))

                        // Subtle Divider
                        HorizontalDivider(
                            color = Color.White.copy(alpha = 0.08f),
                            thickness = 1.dp
                        )

                        Spacer(modifier = Modifier.height(18.dp))

                        // 4. SYNOPSIS WITH EXPAND/COLLAPSE TOGGLE
                        Text(
                            text = "Synopsis",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        val rawSynopsis = anime.synopsis?.paragraphs?.joinToString("\n\n")?.trim()
                        val synopsisText = if (!rawSynopsis.isNullOrBlank()) rawSynopsis else "Sinopsis belum tersedia untuk anime ini."

                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .animateContentSize(animationSpec = tween(durationMillis = 250))
                        ) {
                            Text(
                                text = synopsisText,
                                style = MaterialTheme.typography.bodyMedium,
                                color = Color.White.copy(alpha = 0.72f),
                                lineHeight = 21.sp,
                                maxLines = if (isSynopsisExpanded) Int.MAX_VALUE else 3,
                                overflow = TextOverflow.Ellipsis
                            )

                            // Show toggle button if synopsis is fairly long
                            if (synopsisText.length > 120) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Row(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .clickable { isSynopsisExpanded = !isSynopsisExpanded }
                                        .padding(vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = if (isSynopsisExpanded) "Sembunyikan" else "Selengkapnya",
                                        color = Color(0xFF3EA5F4),
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                    Spacer(modifier = Modifier.width(2.dp))
                                    Icon(
                                        imageVector = if (isSynopsisExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                                        contentDescription = null,
                                        tint = Color(0xFF3EA5F4),
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(20.dp))

                        // Subtle Divider
                        HorizontalDivider(
                            color = Color.White.copy(alpha = 0.08f),
                            thickness = 1.dp
                        )

                        Spacer(modifier = Modifier.height(20.dp))

                        // 5. EPISODES HEADER WITH GRID/LIST AND SORT TOGGLES
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Episodes (${episodes.size})",
                                style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp),
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )

                            Row(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Toggle Grid vs List Button
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = if (isGridMode) Color(0xFF3EA5F4).copy(alpha = 0.18f) else Color.White.copy(alpha = 0.07f),
                                    border = BorderStroke(
                                        1.dp,
                                        if (isGridMode) Color(0xFF3EA5F4).copy(alpha = 0.45f) else Color.White.copy(alpha = 0.12f)
                                    ),
                                    modifier = Modifier.clickable { isGridMode = !isGridMode }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            imageVector = if (isGridMode) Icons.Default.ViewList else Icons.Default.GridView,
                                            contentDescription = "Toggle Grid/List",
                                            tint = if (isGridMode) Color(0xFF3EA5F4) else Color.White.copy(alpha = 0.85f),
                                            modifier = Modifier.size(15.dp)
                                        )
                                        Spacer(modifier = Modifier.width(5.dp))
                                        Text(
                                            text = if (isGridMode) "List" else "Grid",
                                            color = if (isGridMode) Color(0xFF3EA5F4) else Color.White.copy(alpha = 0.85f),
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                }

                                // Toggle Sort Order Button
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = Color.White.copy(alpha = 0.07f),
                                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.12f)),
                                    modifier = Modifier.clickable { isSortAscending = !isSortAscending }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(
                                            imageVector = Icons.AutoMirrored.Filled.Sort,
                                            contentDescription = "Sort Episodes",
                                            tint = Color.White.copy(alpha = 0.85f),
                                            modifier = Modifier.size(15.dp)
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(
                                            text = if (isSortAscending) "1 ➔ ${episodes.size}" else "${episodes.size} ➔ 1",
                                            color = Color.White.copy(alpha = 0.85f),
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.SemiBold
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))
                    }
                }

                // 6. EPISODES CONTENT (GRID MODE OR LIST MODE)
                if (episodes.isEmpty()) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(32.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "Belum ada episode yang tersedia.",
                                color = Color.White.copy(alpha = 0.6f),
                                fontSize = 14.sp
                            )
                        }
                    }
                } else if (isGridMode) {
                    // GRID MODE: Compact square buttons (5 columns)
                    val chunkedEpisodes = sortedEpisodes.chunked(5)
                    items(chunkedEpisodes) { rowItems ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            rowItems.forEach { episode ->
                                val epNumber = episode.title.toString()
                                    .toDoubleOrNull()?.toInt()?.toString()
                                    ?: episode.title.toString().replace(Regex("[^0-9]"), "").ifEmpty { episode.title.toString() }
                                val epTitle = "Episode $epNumber"
                                val epHistory = episode.episodeId?.let { uiState.watchedEpisodes[it] }
                                val isCurrentlyWatched = uiState.lastWatchedHistory?.episodeSlug == episode.episodeId

                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .height(44.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(
                                            when {
                                                isCurrentlyWatched -> Color(0xFF3EA5F4).copy(alpha = 0.25f)
                                                epHistory != null -> Color.White.copy(alpha = 0.12f)
                                                else -> Color(0xFF1C1E24)
                                            }
                                        )
                                        .border(
                                            width = 1.dp,
                                            color = when {
                                                isCurrentlyWatched -> Color(0xFF3EA5F4)
                                                epHistory != null -> Color.White.copy(alpha = 0.25f)
                                                else -> Color.White.copy(alpha = 0.08f)
                                            },
                                            shape = RoundedCornerShape(10.dp)
                                        )
                                        .clickable {
                                            episode.episodeId?.let { slug ->
                                                onNavigateToPlayer(slug, anime.displayTitle.ifBlank { anime.title }, epTitle, anime.poster, episodes)
                                            }
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Column(
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        verticalArrangement = Arrangement.Center
                                    ) {
                                        Text(
                                            text = epNumber,
                                            fontWeight = if (isCurrentlyWatched) FontWeight.Bold else FontWeight.SemiBold,
                                            fontSize = 14.sp,
                                            color = if (isCurrentlyWatched) Color(0xFF3EA5F4) else Color.White
                                        )
                                        if (epHistory != null && epHistory.totalDurationMs > 0) {
                                            Spacer(modifier = Modifier.height(2.dp))
                                            Box(
                                                modifier = Modifier
                                                    .size(4.dp)
                                                    .clip(CircleShape)
                                                    .background(Color(0xFFE53935))
                                            )
                                        }
                                    }
                                }
                            }

                            // Fill remaining space if last row has less than 5 items
                            val emptySlots = 5 - rowItems.size
                            if (emptySlots > 0) {
                                repeat(emptySlots) {
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
                } else {
                    // LIST MODE: Modern interactive cards with progress bar
                    items(sortedEpisodes) { episode ->
                        val epNumber = episode.title.toString()
                            .toDoubleOrNull()?.toInt()?.toString()
                            ?: episode.title.toString()
                        val epTitle = "Episode $epNumber"
                        val epHistory = episode.episodeId?.let { uiState.watchedEpisodes[it] }
                        val isCurrentlyWatched = uiState.lastWatchedHistory?.episodeSlug == episode.episodeId

                        val releaseDate = episode.releasedOn?.takeIf { it.isNotBlank() }
                            ?: episode.uploadDate?.takeIf { it.isNotBlank() }
                            ?: episode.date?.takeIf { it.isNotBlank() }

                        val watchProgress = if (epHistory != null && epHistory.totalDurationMs > 0) {
                            (epHistory.lastPositionMs.toFloat() / epHistory.totalDurationMs.toFloat()).coerceIn(0f, 1f)
                        } else null

                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = if (isCurrentlyWatched) Color(0xFF1E2530) else Color(0xFF1B1D23),
                            border = BorderStroke(
                                1.dp,
                                if (isCurrentlyWatched) Color(0xFF3EA5F4).copy(alpha = 0.45f) else Color.White.copy(alpha = 0.07f)
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 5.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .clickable {
                                    episode.episodeId?.let { slug ->
                                        onNavigateToPlayer(slug, anime.displayTitle.ifBlank { anime.title }, epTitle, anime.poster, episodes)
                                    }
                                }
                        ) {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    // Number / Thumbnail Box
                                    Box(
                                        modifier = Modifier
                                            .size(46.dp)
                                            .clip(RoundedCornerShape(10.dp))
                                            .background(
                                                if (isCurrentlyWatched) Color(0xFF3EA5F4).copy(alpha = 0.2f)
                                                else Color.White.copy(alpha = 0.06f)
                                            )
                                            .border(
                                                1.dp,
                                                if (isCurrentlyWatched) Color(0xFF3EA5F4).copy(alpha = 0.4f)
                                                else Color.White.copy(alpha = 0.08f),
                                                RoundedCornerShape(10.dp)
                                            ),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = epNumber,
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = if (isCurrentlyWatched) Color(0xFF3EA5F4) else Color.White
                                        )
                                    }

                                    Spacer(modifier = Modifier.width(14.dp))

                                    // Episode Info Column
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = epTitle,
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = if (isCurrentlyWatched) Color(0xFF3EA5F4) else Color.White,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )

                                        Spacer(modifier = Modifier.height(3.dp))

                                        // Subtitle: Watch progress or Release Date
                                        if (epHistory != null && (epHistory.lastPositionMs > 0 || epHistory.totalDurationMs > 0)) {
                                            Text(
                                                text = "${formatDurationMs(epHistory.lastPositionMs)} / ${formatDurationMs(epHistory.totalDurationMs)}",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = Color(0xFFE57373),
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Medium
                                            )
                                        } else if (!releaseDate.isNullOrBlank()) {
                                            Text(
                                                text = releaseDate,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = Color.White.copy(alpha = 0.55f),
                                                fontSize = 12.sp
                                            )
                                        } else {
                                            Text(
                                                text = "Siap ditonton",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = Color.White.copy(alpha = 0.45f),
                                                fontSize = 12.sp
                                            )
                                        }
                                    }

                                    Spacer(modifier = Modifier.width(8.dp))

                                    // Play Action Indicator
                                    Box(
                                        modifier = Modifier
                                            .size(34.dp)
                                            .clip(CircleShape)
                                            .background(
                                                if (isCurrentlyWatched) Color(0xFF3EA5F4)
                                                else Color.White.copy(alpha = 0.08f)
                                            ),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.PlayArrow,
                                            contentDescription = "Tonton Episode",
                                            tint = if (isCurrentlyWatched) Color.White else Color.White.copy(alpha = 0.85f),
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }

                                // YouTube-style Red Watch Progress Bar at Bottom of Card
                                if (watchProgress != null && watchProgress > 0f) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(3.dp)
                                            .background(Color.White.copy(alpha = 0.08f))
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth(fraction = watchProgress)
                                                .fillMaxHeight()
                                                .background(Color(0xFFE53935))
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 7. FLOATING TOP APP BAR (DYNAMIC BLUR / TRANSPARENCY ON SCROLL)
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopCenter),
            color = MaterialTheme.colorScheme.background.copy(alpha = topBarAlpha),
            shadowElevation = if (topBarAlpha > 0.8f) 4.dp else 0.dp
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .height(56.dp)
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Floating Circular Back Button
                Surface(
                    shape = CircleShape,
                    color = if (topBarAlpha > 0.5f) Color.Transparent else Color.Black.copy(alpha = 0.45f),
                    border = if (topBarAlpha > 0.5f) null else BorderStroke(1.dp, Color.White.copy(alpha = 0.15f)),
                    modifier = Modifier.size(40.dp)
                ) {
                    IconButton(
                        onClick = onNavigateBack,
                        modifier = Modifier.size(40.dp)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Kembali",
                            tint = Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                // Fading Title as user scrolls down past the hero
                AnimatedVisibility(
                    visible = topBarAlpha > 0.6f,
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = anime?.displayTitle ?: anime?.title ?: "",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

private fun findFirstEpisode(episodes: List<EpisodeItem>?): EpisodeItem? {
    if (episodes.isNullOrEmpty()) return null
    val ep1 = episodes.find { ep ->
        val t = ep.title.toString().trim()
        t == "1" || t == "Episode 1" || t.endsWith(" 1") || t == "1.0"
    }
    if (ep1 != null) return ep1
    return episodes.lastOrNull() ?: episodes.firstOrNull()
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
