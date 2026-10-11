FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/mediq.db
VOLUME /data
EXPOSE 3000
CMD ["node","--no-warnings","server.js"]
