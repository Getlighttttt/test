# ASP.NET backend build. Frontend assets come from the Compose build-only service.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build
WORKDIR /source
COPY WmsApi/WmsApi/WmsApi.csproj ./WmsApi/WmsApi/
RUN dotnet restore ./WmsApi/WmsApi/WmsApi.csproj
COPY WmsApi/WmsApi/ ./WmsApi/WmsApi/
RUN dotnet publish ./WmsApi/WmsApi/WmsApi.csproj --configuration Release --output /app/publish --no-restore

# Single running app container: C# API + compiled React static files.
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=backend-build /app/publish ./
COPY --from=frontend_assets /frontend/dist ./wwwroot/
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "WmsApi.dll"]
