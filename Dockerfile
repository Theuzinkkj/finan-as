FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
WORKDIR /app
COPY . .
EXPOSE 3001
CMD ["node", "backend/server.js"]
