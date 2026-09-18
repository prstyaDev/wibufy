package com.prstyadev.wibufy.data

import retrofit2.http.Body
import retrofit2.http.Headers
import retrofit2.http.POST

interface AniListApiService {
    @Headers("Content-Type: application/json", "Accept: application/json")
    @POST("/")
    suspend fun getHomeData(@Body request: GraphQLRequest): GraphQLDataResponse<AniListHomeContainer>

    @Headers("Content-Type: application/json", "Accept: application/json")
    @POST("/")
    suspend fun getScheduleData(@Body request: GraphQLRequest): GraphQLDataResponse<AniListScheduleContainer>

    @Headers("Content-Type: application/json", "Accept: application/json")
    @POST("/")
    suspend fun getSearchData(@Body request: GraphQLRequest): GraphQLDataResponse<AniListSearchContainer>

    @Headers("Content-Type: application/json", "Accept: application/json")
    @POST("/")
    suspend fun getMediaDetail(@Body request: GraphQLRequest): GraphQLDataResponse<AniListMediaDetailContainer>
}
