# Multi-User TODO Platform API

## 1. Scope and access

The Gateway is the only client-facing HTTP entry point.

```text
http://localhost:3000
```

Account Service and Todo Service listen only on the Docker network. A client must not call them directly.

All JSON endpoints use `Content-Type: application/json`. Request bodies are limited to 100 KB. Dates are ISO-8601 strings with an explicit offset. IDs are UUIDs.

The Gateway generates a request ID for every request and returns it as `x-request-id`. A valid incoming request ID may be used as correlation input; invalid or missing values are replaced with a generated UUID.

## 2. Authentication

Protected endpoints require:

```http
Authorization: Bearer <access-token>
```

Access tokens are short-lived JWTs. Refresh tokens are opaque, rotated, stored only as hashes, and sent in the JSON body to the refresh endpoint. The Gateway verifies the access token and sends a signed internal identity to downstream services.

## 3. Common error response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "requestId": "a4fcd832-4a93-45cf-aefe-71325d578ac6",
    "details": [
      { "field": "body.email", "message": "A valid email address is required" }
    ]
  }
}
```

`details` is present for validation errors and omitted otherwise. Error messages never contain stack traces, SQL, credentials, passwords, reset tokens, or access tokens. Common status meanings are `400` invalid input, `401` missing or invalid authentication, `403` authenticated but not permitted, `404` missing or invisible resource, `409` business conflict, `413` body too large, `429` rate limit exceeded, `502` malformed downstream response, `503` downstream unavailable, `504` downstream timeout, and `500` unexpected failure.

### Shared response fields

| Field | Type | Meaning |
|---|---|---|
| `id` | UUID string | Stable identifier for an account, TODO, share, history record, or event. |
| `userId` / `ownerId` / `recipientId` | UUID string | Account identifier. These are opaque identifiers and must not be inferred from email addresses. |
| `email` | string | Normalized account email address. |
| `createdAt` / `updatedAt` / `sharedAt` / `occurredAt` | ISO-8601 datetime string | Timestamp with an explicit UTC offset. |
| `description` / `dueDate` | string or `null` | Optional TODO values; omitted input does not change an existing value, while explicit `null` clears it where allowed. |
| `state` | enum string | One of `pending`, `in_progress`, `completed`, or `cancelled`. |

Successful account responses use `{ "data": ... }`. Successful TODO list responses use `{ "items": [...], "pagination": ... }`; successful history responses use `{ "items": [...] }`. `204` responses have no body.

## 4. Rate limits

Redis-backed limits are shared across Gateway instances. Defaults are 100 requests per 60 seconds for the general API, 10 per 60 seconds for authentication, and 5 per 900 seconds for password-reset requests. A rejected request returns `429`, `RATE_LIMIT_EXCEEDED`, and `Retry-After` when available. General API rate limiting fails open during a Redis outage so ordinary TODO reads and writes remain available. Authentication and password-reset rate limiting fail closed with `503 RATE_LIMIT_UNAVAILABLE` because disabling those protections would create a brute-force risk.

## 5. Authentication and account endpoints

### `POST /api/v1/auth/register`

Creates an account without authentication. Request:

```json
{ "email": "alice@example.com", "password": "Correct Horse Battery!1" }
```

Email is trimmed and lowercased, must be at most 254 characters, and must be valid. Password must be 12-128 characters. Response `201`:

```json
{ "data": { "user": { "id": "uuid", "email": "alice@example.com", "createdAt": "2026-09-24T09:00:00.000Z" } } }
```

Returns `400 VALIDATION_ERROR` or `409 EMAIL_ALREADY_REGISTERED`. The password is never returned.

### `POST /api/v1/auth/login`

Authenticates a user and starts a session. Request is `{ "email": "alice@example.com", "password": "Correct Horse Battery!1" }`. Response `200` contains `accessToken`, `refreshToken`, and expiry metadata. Token values are opaque and are never logged. An unknown email and wrong password produce the same `401 INVALID_CREDENTIALS` response.

Response fields are `data.user.id` (UUID), `data.user.email` (string), `data.accessToken` (JWT string), `data.refreshToken` (opaque string), `data.accessTokenExpiresIn` (integer seconds), and `data.refreshTokenExpiresIn` (integer seconds). Other responses are `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `429 RATE_LIMIT_EXCEEDED`, or `503 RATE_LIMIT_UNAVAILABLE`.

### `POST /api/v1/auth/refresh`

Rotates a refresh token. Request: `{ "refreshToken": "opaque-refresh-token" }`. Response `200` contains a new token pair. Returns `400` for malformed input and `401 INVALID_REFRESH_TOKEN` for an expired, revoked, or already-used token. Reuse detection revokes the token family and active session.

### `POST /api/v1/auth/logout`

Ends the authenticated session. Returns `204`. Previously issued tokens for that session are rejected immediately.

### `POST /api/v1/auth/logout-all`

Ends every session for the authenticated account. Returns `204`. Existing access tokens stop being accepted without waiting for JWT expiry.

### `POST /api/v1/auth/password-reset/request`

Requests a reset email. Request: `{ "email": "alice@example.com" }`. Returns `202` with a generic acknowledgement whether or not the account exists. This endpoint is separately rate limited.

### `POST /api/v1/auth/password-reset/confirm`

Consumes a one-time reset credential. Request:

```json
{ "token": "opaque-reset-token", "newPassword": "New Correct Horse!2" }
```

Returns `204`. The token is hashed in storage, expires, and is invalidated whether used successfully or consumed. A successful reset revokes every active session. Invalid, expired, or reused tokens return `400 INVALID_PASSWORD_RESET_TOKEN`.

### `GET /api/v1/users/me`

Returns `200` with `{ "data": { "user": { "id": "uuid", "email": "alice@example.com", "createdAt": "2026-09-24T09:00:00.000Z" } } }`.

### `PATCH /api/v1/users/me/email`

Request: `{ "email": "new@example.com" }`. The email is normalized and uniqueness is enforced by the Account database. Returns `200` with the user object. Todo projections update asynchronously from `account.email-changed`, so TODO responses may briefly converge to the new email.

## 6. TODO endpoints

All endpoints in this section require authentication.

### `POST /api/v1/todos`

Creates an owned TODO. `title` is required, trimmed, and at most 200 characters. `description` is nullable and at most 5,000 characters. `state` defaults to `pending`; `dueDate` is nullable. An `Idempotency-Key` header makes retries of the same create request return one result; records expire after 24 hours.

Request:

```json
{ "title": "Write architecture docs", "description": "Describe failure behavior", "state": "pending", "dueDate": "2026-09-30T17:00:00.000Z" }
```

Response `201` is a TODO object with `id`, `ownerId`, `title`, `description`, `state`, `dueDate`, `createdAt`, and `updatedAt`. Returns `400 VALIDATION_ERROR`, `409 TODO_TITLE_ALREADY_EXISTS`, or `503 OWNER_PROJECTION_NOT_READY` when the account projection has not caught up.

### `GET /api/v1/todos`

Lists visible TODOs. Query parameters:

| Parameter | Type | Allowed/default | Meaning |
|---|---|---|---|
| `page` | integer | minimum 1, default 1 | 1-based page |
| `pageSize` | integer | 1-100, default 20 | items per page |
| `state` | string | `pending`, `in_progress`, `completed`, `cancelled` | optional filter |
| `access` | string | `owned`, `shared`, `all` (default) | ownership view |
| `sortBy` | string | `createdAt`, `dueDate` (default `createdAt`) | sort field |
| `sortOrder` | string | `asc`, `desc` (default `desc`) | sort direction |

Response `200` has `{ "items": [], "pagination": { "page": 1, "pageSize": 20, "totalItems": 0, "totalPages": 0 } }`. Each item includes TODO fields plus `accessType` (`owner` or `shared`), `owner: { id, email }`, and `sharedWith: [{ id, email }]`. Invalid query values return `400 VALIDATION_ERROR`.

### `GET /api/v1/todos/:todoId`

Returns one visible TODO with owner and sharing details. Returns `200`, `400 INVALID_UUID`, or `404 TODO_NOT_FOUND`. The same `404` is used when the TODO exists but is not visible to the caller.

### `PATCH /api/v1/todos/:todoId`

Partially updates `title`, `description`, `state`, and/or `dueDate`. At least one field is required. Owners may change every field; an active share recipient may change only `state`. Returns `200` with the updated TODO, `400` invalid input, `403 TODO_UPDATE_FORBIDDEN`, `404 TODO_NOT_FOUND`, or `409 TODO_TITLE_ALREADY_EXISTS`.

### `DELETE /api/v1/todos/:todoId`

Soft-deletes an owned TODO and emits `todo.deleted`. Returns `204`, `400 INVALID_UUID`, or `404 TODO_NOT_FOUND` for both inaccessible and missing TODOs. Only the owner can delete.

### `POST /api/v1/todos/:todoId/shares`

Shares an owned TODO with a registered account by email. Request: `{ "recipientEmail": "bob@example.com" }`. Response `201`:

```json
{ "id": "uuid", "todoId": "uuid", "ownerId": "uuid", "recipientId": "uuid", "permission": "state-update", "sharedAt": "2026-09-24T09:00:00.000Z" }
```

Returns `400`, `403 TODO_SHARE_FORBIDDEN`, `404 TODO_NOT_FOUND`, `404 RECIPIENT_ACCOUNT_NOT_FOUND` for an authenticated lookup with no matching account, or `409 TODO_ALREADY_SHARED`/`TODO_SELF_SHARE_NOT_ALLOWED`. The recipient notification is asynchronous.

### `DELETE /api/v1/todos/:todoId/shares/:recipientId`

Withdraws an active share. Only the owner can do this. Returns `204`, `400 INVALID_UUID`, `403 TODO_SHARE_FORBIDDEN`, or `404 TODO_NOT_FOUND`. Active share state is checked on every operation, so an old access token does not preserve access.

### `GET /api/v1/todos/:todoId/history`

Returns the visible TODO history as `{ "items": [{ "id": "uuid", "eventId": "uuid", "todoId": "uuid", "actorId": "uuid", "eventType": "todo.created", "requestId": "uuid", "occurredAt": "2026-09-24T09:00:00.000Z", "details": {} }] }`. Access follows the same ownership or active-share visibility rules as the TODO itself. Invalid identifiers return `400 VALIDATION_ERROR`; missing or inaccessible TODOs return `404 TODO_NOT_FOUND`.

The `eventType` values are `todo.created`, `todo.completed`, `todo.shared`, `todo.share-withdrawn`, and `todo.deleted`. `details` is an object containing event-specific audit data.

## 7. Health endpoints

`GET /health` is public Gateway process health and returns `200` with `{ "status": "healthy", "service": "gateway" }`.

`GET /health/dependencies` is public operational health and probes Gateway Redis, Account Service `/health`, and Todo Service `/health/ready`. It returns `200` with `{ "status": "healthy", "service": "gateway", "dependencies": { "redis": "available", "accountService": "available", "todoService": "available" } }` when all dependencies respond successfully. It returns `503` with the same shape and an `"unavailable"` dependency value when any probe fails. Probes have the configured downstream timeout and do not expose credentials or downstream response bodies.

Internal `GET http://account-service:3001/health` checks Account PostgreSQL and returns `200` when available or `503` with `dependencies.database: "unavailable"` when not.

Internal `GET http://todo-service:3002/health/live` checks process liveness. `GET http://todo-service:3002/health/ready` checks Todo PostgreSQL and Redis; database failure returns `503`, while Redis failure is reported as degraded without stopping TODO operations.

## 8. Ordered user flows

### Login and renewal

1. Call `POST /api/v1/auth/login`.
2. Use the access token for protected requests.
3. When it expires, call `POST /api/v1/auth/refresh`.
4. Replace both tokens with the rotated pair.
5. Call `logout` or `logout-all` to end sessions.

### Password reset

1. Call `POST /api/v1/auth/password-reset/request`.
2. Inspect Mailpit at `http://localhost:8025`.
3. Extract the one-time reset token from the local email.
4. Call `POST /api/v1/auth/password-reset/confirm`.

### Sharing

1. Create or identify a TODO.
2. Call `POST /api/v1/todos/:todoId/shares` with a recipient email.
3. The recipient lists with `access=shared` and may update only `state`.
4. The owner withdraws access with `DELETE /api/v1/todos/:todoId/shares/:recipientId`.

### Session revocation and history

1. Call `POST /api/v1/auth/login` and retain the access token.
2. Use the token to call `GET /api/v1/todos` or `GET /api/v1/todos/:todoId/history`.
3. Call `POST /api/v1/auth/logout` with the same token.
4. Reusing the token for a TODO endpoint returns `401 INVALID_ACCESS_TOKEN` immediately.
5. A caller who can still see the TODO may retrieve its append-only history; inaccessible TODOs return the same not-found response as the TODO endpoint.
