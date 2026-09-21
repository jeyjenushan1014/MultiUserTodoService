# ==========================================================
# Stage 1: Install monorepo dependencies
# install development and production dependencies
# ==========================================================
FROM node:24-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./

COPY packages/contracts/package.json \
  ./packages/contracts/package.json

COPY packages/common/package.json \
  ./packages/common/package.json

COPY apps/account-service/package.json \
  ./apps/account-service/package.json

COPY apps/gateway/package.json \
  ./apps/gateway/package.json

RUN npm ci


# ==========================================================
# Stage 2: Build shared packages and Gateway
# Compile contracts, common and gateway
# ==========================================================
FROM dependencies AS gateway-builder

WORKDIR /app

COPY tsconfig.base.json ./
COPY eslint.config.mjs ./

COPY packages/contracts \
  ./packages/contracts

COPY packages/common \
  ./packages/common

COPY apps/gateway \
  ./apps/gateway

RUN npm run build -w @todo/contracts

RUN npm run build -w @todo/common

RUN npm run build -w @todo/gateway


# ==========================================================
# Stage 3: Create minimal Gateway production image
# Contains production dependencies and compiled files only
# ==========================================================
FROM node:24-alpine AS gateway-runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./

COPY packages/contracts/package.json \
  ./packages/contracts/package.json

COPY packages/common/package.json \
  ./packages/common/package.json

COPY apps/account-service/package.json \
  ./apps/account-service/package.json

COPY apps/gateway/package.json \
  ./apps/gateway/package.json

RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=gateway-builder \
  /app/packages/contracts/dist \
  ./packages/contracts/dist

COPY --from=gateway-builder \
  /app/packages/common/dist \
  ./packages/common/dist

COPY --from=gateway-builder \
  /app/apps/gateway/dist \
  ./apps/gateway/dist

USER node

EXPOSE 3000

CMD ["node", "apps/gateway/dist/server.js"]