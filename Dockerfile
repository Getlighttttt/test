# Build the React frontend.
FROM node:22-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Publish the ASP.NET Core backend.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build
WORKDIR /source
COPY backend/WmsApi/WmsApi/WmsApi.csproj ./backend/WmsApi/WmsApi/
RUN dotnet restore ./backend/WmsApi/WmsApi/WmsApi.csproj
COPY backend/WmsApi/WmsApi/ ./backend/WmsApi/WmsApi/
RUN dotnet publish ./backend/WmsApi/WmsApi/WmsApi.csproj --configuration Release --output /app/publish --no-restore

# Run a single ASP.NET Core service that serves both API and React.
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=backend-build /app/publish ./
COPY --from=frontend-build /frontend/dist ./wwwroot/
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "WmsApi.dll"]
