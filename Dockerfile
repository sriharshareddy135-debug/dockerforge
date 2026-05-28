# DockerForge — single-container build (backend + frontend)
# For production, prefer docker-compose.yml

FROM node:18-alpine AS ui-builder
WORKDIR /ui
COPY frontend/package.json .
RUN npm install --legacy-peer-deps
COPY frontend/ .
ENV NODE_OPTIONS=--openssl-legacy-provider
ENV CI=false
RUN npm run build

FROM python:3.11-slim

# Install system deps + Docker CLI + nginx
RUN apt-get update && apt-get install -y \
    git curl gnupg nginx \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Copy built React UI to nginx
COPY --from=ui-builder /ui/build /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Supervisor-like startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 3000 8000
CMD ["/start.sh"]
