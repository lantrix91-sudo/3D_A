# 3D-двойник для Railway: сборка Vite → статические файлы → Nginx.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Адреса подставляются при сборке: после их смены нужна новая сборка.
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_STALE_SECONDS
ENV VITE_API_URL=$VITE_API_URL VITE_WS_URL=$VITE_WS_URL VITE_STALE_SECONDS=$VITE_STALE_SECONDS
RUN npm run build

FROM nginx:stable-alpine
ENV PORT=8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
