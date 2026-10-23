FROM node:22-bookworm
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV DATABASE_URL=file:/data/fuel.db
RUN npx prisma generate && npm run build
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
EXPOSE 3000
VOLUME /data
CMD ["sh", "-c", "npx prisma db push && node .output/server/index.mjs"]
