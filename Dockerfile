# syntax=docker/dockerfile:1

FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SIMMER_DATA_DIR=/data \
    SIMMER_STATIC_DIR=/app/static \
    FORWARDED_ALLOW_IPS=*
WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir . && useradd --system --uid 1000 simmer && mkdir -p /data && chown simmer /data
COPY --from=frontend /app/dist ./static
USER simmer
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/health')"
# Uvicorn reads the trusted proxy addresses from FORWARDED_ALLOW_IPS.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers"]
