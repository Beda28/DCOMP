FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_FASTAPI_ENABLED=false
ENV VITE_FASTAPI_ENABLED=$VITE_FASTAPI_ENABLED
RUN npm run build

FROM alpine:3.23
COPY --from=build /app/dist /dist
CMD ["sh", "-c", "find /shared -mindepth 1 -maxdepth 1 -exec rm -rf {} + && cp -a /dist/. /shared/"]

