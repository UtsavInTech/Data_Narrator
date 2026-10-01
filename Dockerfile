# One image: API + web app. Run anywhere (on-premise server, VM, any cloud).
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/pyproject.toml ./
COPY backend/datanarrator ./datanarrator
RUN pip install --no-cache-dir ".[excel-legacy]" \
 && python -c "import duckdb; c = duckdb.connect(); [c.install_extension(e) for e in ('httpfs', 'postgres', 'mysql', 'azure')]"
COPY --from=web /web/dist ./frontend/dist
ENV DN_STORAGE_DIR=/data DN_FRONTEND_DIST=/app/frontend/dist
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "datanarrator.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
