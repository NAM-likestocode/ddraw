FROM node:22-alpine AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts vitest.config.ts ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app/server
ENV NODE_ENV=production
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/index.js ./index.js
COPY --from=web-build /app/dist /app/dist
EXPOSE 3000
CMD ["node", "index.js"]
