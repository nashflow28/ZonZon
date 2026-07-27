FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/migrations ./src/migrations
# Scripts d'exploitation (ex. création d'un compte ADMIN, impossible via l'API
# puisque `/auth/register` interdit ce rôle) : ils doivent être exécutables
# depuis le conteneur, seul détenteur des credentials de base de données.
COPY --from=builder /app/scripts ./scripts

EXPOSE 3050
CMD ["node", "dist/main"]
