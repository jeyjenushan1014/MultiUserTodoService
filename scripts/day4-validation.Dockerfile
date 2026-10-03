FROM node:24-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/common/package.json packages/common/package.json
COPY apps/account-service/package.json apps/account-service/package.json
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/todo-service/package.json apps/todo-service/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm run build && chown -R node:node /app
COPY --chown=node:node . .
USER node
