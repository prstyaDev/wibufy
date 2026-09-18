package com.prstyadev.wibufy.data

import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface ReconsumetApiService {
    @GET("info/{anilistId}")
    suspend fun getAnimeInfo(@Path("anilistId") anilistId: String): ReconsumetInfoResponse

    @GET("episodes/{anilistId}")
    suspend fun getEpisodes(
        @Path("anilistId") anilistId: String,
        @Query("provider") provider: String? = null
    ): ReconsumetEpisodesResponse

    @GET("watch")
    suspend fun getWatchSources(
        @Query("provider") provider: String,
        @Query("episodeId") episodeId: String
    ): ReconsumetWatchResponse
}
