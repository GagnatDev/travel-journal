FROM node:24-slim AS builder

RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/

RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY tsconfig.base.json ./

# Vite embeds VITE_* at build time; pass via: docker build --build-arg VITE_MAPBOX_TOKEN=...
ARG VITE_MAPBOX_TOKEN
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN

RUN pnpm --filter @travel-journal/shared build
RUN pnpm --filter @travel-journal/server build
RUN pnpm --filter @travel-journal/client build

FROM node:24-slim AS runtime

RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/client/dist packages/server/dist/public

EXPOSE 3100

CMD ["node", "packages/server/dist/index.js"]
