FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
COPY config.yaml /config.yaml
ARG QUESTBOARD_BUILD_ID
ENV QUESTBOARD_BUILD_ID=$QUESTBOARD_BUILD_ID
RUN rm -rf dist && npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY --from=frontend /build/dist ./frontend/dist
ENV DATA_DIR=/data
EXPOSE 8099
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8099"]
