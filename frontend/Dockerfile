# Produces React/Vite static assets for the ASP.NET app image.
# This image is built by Compose but never run as a container (scale: 0).
FROM node:22-alpine AS frontend-build
WORKDIR /frontend
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npm run build
