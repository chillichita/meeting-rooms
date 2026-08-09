FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY backend backend
COPY frontend frontend
RUN npm run build -w frontend && npm run build -w backend

EXPOSE 3000

CMD ["sh", "-c", "node backend/dist/seed.js && node backend/dist/index.js"]
