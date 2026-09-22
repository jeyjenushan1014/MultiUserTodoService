# ==========================================================
# Stage 1: Install monorepo dependencies
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

COPY apps/todo-service/package.json \
  ./apps/todo-service/package.json

RUN npm ci


# ==========================================================
# Stage 2: Account database migration runner
# ==========================================================
FROM dependencies AS account-migrations

WORKDIR /app

COPY apps/account-service/migrations \
  ./apps/account-service/migrations

WORKDIR /app/apps/account-service

CMD ["npm", "run", "migrate"]


# ==========================================================
# Stage 3: Build shared packages
# ==========================================================
FROM dependencies AS shared-builder

WORKDIR /app

COPY tsconfig.base.json ./
COPY eslint.config.mjs ./

COPY packages/contracts \
  ./packages/contracts

COPY packages/common \
  ./packages/common

RUN npm run build -w @todo/contracts
RUN npm run build -w @todo/common


# ==========================================================
# TODO Service migration image
# ==========================================================
FROM dependencies AS todo-migrations-runtime

WORKDIR /app

ENV NODE_ENV=production

COPY apps/todo-service/migrations \
  ./apps/todo-service/migrations

USER node

CMD ["npm", "run", "migrate", "-w", "@todo/todo-service"]


# ==========================================================
# Stage 4: Build Gateway
# ==========================================================
FROM shared-builder AS gateway-builder

COPY apps/gateway \
  ./apps/gateway

RUN npm run build -w @todo/gateway


# ==========================================================
# Stage 5: Build Account Service
# ==========================================================
FROM shared-builder AS account-service-builder

COPY apps/account-service \
  ./apps/account-service

RUN npm run build -w @todo/account-service


# ==========================================================
# Stage 6: Install production dependencies
# ==========================================================
FROM node:24-alpine AS production-dependencies

WORKDIR /app

ENV NODE_ENV=production

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


# ==========================================================
# Stage 7: Gateway runtime
# ==========================================================
FROM production-dependencies AS gateway-runtime

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


# ==========================================================
# Stage 8: Account Service runtime
# ==========================================================
FROM production-dependencies AS account-service-runtime

COPY --from=account-service-builder \
  /app/packages/contracts/dist \
  ./packages/contracts/dist

COPY --from=account-service-builder \
  /app/packages/common/dist \
  ./packages/common/dist

COPY --from=account-service-builder \
  /app/apps/account-service/dist \
  ./apps/account-service/dist

USER node

EXPOSE 3001

CMD ["node", "apps/account-service/dist/server.js"]