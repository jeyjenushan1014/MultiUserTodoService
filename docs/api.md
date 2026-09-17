# Multi-User TODO Service API Documentation

## 1. API Overview

The Multi-User TODO Service allows users to create accounts, authenticate using email and password, and securely manage their own TODO items.

This document covers the Day 1 endpoints:

1\. Register a user account

2: Login a user account

3: get the user particular details

4: health endpoint around the application,database and cache


## 2. Base URL

```text
http://localhost:3000
```

All versioned application endpoints begin with:

```text
/api/v1
```

Health endpoints cannot mentioned with version
/health


## 3. Content Type

Endpoints that accept a request body require JSON:

```http
Content-Type: application/json
```

## 4. Authentication

Protected endpoints require a JWT access token in the `Authorization` header:

```http
Authorization: Bearer <access_token>
```

Example:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

The access token expires after 900 seconds, or 15 minutes.

## 5. Timestamp Format

All timestamps use the ISO 8601 UTC format:

```text
2026-09-15T10:30:00.000Z
```

## 6. Standard Success Response

Successful responses containing data use the following structure:

```json
{
  "data": {}
}
```

The exact value of `data` depends on the endpoint.

## 7. Standard Error Response

All API errors follow one consistent structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "requestId": "a4fcd832-4a93-45cf-aefe-71325d578ac6"
  }
}
```

Validation errors can also contain `details`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {
      "issues": [
        {
          "path": "body.email",
          "message": "Invalid email address"
        }
      ]
    },
    "requestId": "a4fcd832-4a93-45cf-aefe-71325d578ac6"
  }
}
```

### Error response fields

| Field             | Type   | Meaning                                     |
| ----------------- | ------ | ------------------------------------------- |
| `error`           | object | Contains information about the error        |
| `error.code`      | string | Stable machine-readable error code          |
| `error.message`   | string | Human-readable explanation                  |
| `error.details`   | object | Optional additional validation information  |
| `error.requestId` | string | Identifier used to find the request in logs |

---

# Authentication Endpoints

## 8. Register an Account

Creates a new user account using an email address and password.

### Requirement IDs

`FR-1`, `FR-2`, `FR-3`, `FR-7`, `DR-7`, `SR-1`, `SR-2`, `SR-7`

### Request

```http
POST /api/v1/auth/register
```

### Authentication

Not required.

### Request headers

| Header         | Required | Value              |
| -------------- | -------: | ------------------ |
| `Content-Type` |      Yes | `application/json` |

### Request body

| Field      | Type   | Required | Validation                          | Meaning                       |
| ---------- | ------ | -------: | ----------------------------------- | ----------------------------- |
| `email`    | string |      Yes | Valid email; maximum 254 characters | User’s unique email address   |
| `password` | string |      Yes | 12–128 characters                   | Password used to authenticate |

The email is trimmed and converted to lowercase before it is stored.

### Example request

```bash
curl -i -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jenushan@example.com",
    "password": "strong-password-123"
  }'
```

### Success response

```http
HTTP/1.1 201 Created
Content-Type: application/json
```

```json
{
  "data": {
    "id": "4d395a15-853a-4d2f-93d5-041868663cd2",
    "email": "jenushan@example.com",
    "createdAt": "2026-09-15T10:30:00.000Z"
  }
}
```

### Success-response fields

| Field            | Type            | Meaning                  |
| ---------------- | --------------- | ------------------------ |
| `data`           | object          | Registered user          |
| `data.id`        | string/UUID     | Unique user identifier   |
| `data.email`     | string          | Normalized email address |
| `data.createdAt` | string/datetime | Account creation time    |

The response never contains the password or stored password hash.

### Possible responses

|                      Status | Error code             | Cause                             |
| --------------------------: | ---------------------- | --------------------------------- |
|               `201 Created` | —                      | Account created successfully      |
|           `400 Bad Request` | `VALIDATION_ERROR`     | Email or password is invalid      |
|              `409 Conflict` | `EMAIL_ALREADY_EXISTS` | An account already uses the email |
| `500 Internal Server Error` | `INTERNAL_ERROR`       | Unexpected internal failure       |

### Duplicate-email error

```json
{
  "error": {
    "code": "EMAIL_ALREADY_EXISTS",
    "message": "An account with this email already exists",
    "requestId": "c76546ac-e520-4be1-a6cb-e03b31813ec3"
  }
}
```

### Invalid-input error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {
      "issues": [
        {
          "path": "body.email",
          "message": "Invalid email address"
        }
      ]
    },
    "requestId": "37869c3a-7cad-4f24-91d4-a881736a8d75"
  }
}
```
---

## 9. Log In

Authenticates a user and issues a time-limited JWT access token.

### Requirement IDs

`FR-4`, `FR-5`, `SR-2`, `SR-4`, `SR-5`

### Request

```http
POST /api/v1/auth/login
```

### Authentication

Not required.

### Request headers

| Header         | Required | Value              |
| -------------- | -------: | ------------------ |
| `Content-Type` |      Yes | `application/json` |

### Request body

| Field      | Type   | Required | Validation                          | Meaning                  |
| ---------- | ------ | -------: | ----------------------------------- | ------------------------ |
| `email`    | string |      Yes | Valid email; maximum 254 characters | Registered account email |
| `password` | string |      Yes | 12–128 characters                   | Account password         |

### Example request

```bash
curl -i -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jenushan@example.com",
    "password": "strong-password-123"
  }'
```

### Success response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "data": {
    "accessToken": "<actual-access-token>",
    "tokenType": "Bearer",
    "expiresIn": 900
  }
}
```

### Success-response fields

| Field              | Type    | Meaning                                |
| ------------------ | ------- | -------------------------------------- |
| `data`             | object  | Authentication result                  |
| `data.accessToken` | string  | JWT used to access protected endpoints |
| `data.tokenType`   | string  | Always `Bearer`                        |
| `data.expiresIn`   | integer | Token lifetime in seconds              |

### Possible responses

|                      Status | Error code            | Cause                                          |
| --------------------------: | --------------------- | ---------------------------------------------- |
|                    `200 OK` | —                     | Authentication successful                      |
|           `400 Bad Request` | `VALIDATION_ERROR`    | Email or password format is invalid            |
|          `401 Unauthorized` | `INVALID_CREDENTIALS` | Email is unregistered or password is incorrect |
| `500 Internal Server Error` | `INTERNAL_ERROR`      | Unexpected internal failure                    |

### Invalid-credentials response

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect",
    "requestId": "9c588068-b02b-429e-af88-48af71fe3354"
  }
}
```

The API deliberately returns the same status, code, message, and response structure for:

1. An unregistered email
2. A registered email with an incorrect password

This prevents callers from determining whether an account exists.

---

## 10. Retrieve the Current Account

Returns the account information belonging to the authenticated user.

### Requirement IDs

`FR-6`, `FR-7`, `SR-4`, `SR-5`, `SR-6`

### Request

```http
GET /api/v1/auth/me
```

### Authentication

Required.

### Request headers

| Header          | Required | Value                   |
| --------------- | -------: | ----------------------- |
| `Authorization` |      Yes | `Bearer <access_token>` |

### Path parameters

None.

### Query parameters

None.

### Request body

None.

### Example request

```bash
curl -i http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <actual-access-token>"
```

### Success response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "data": {
    "id": "4d395a15-853a-4d2f-93d5-041868663cd2",
    "email": "jenushan@example.com",
    "createdAt": "2026-09-15T10:30:00.000Z"
  }
}
```

### Success-response fields

| Field            | Type            | Meaning                |
| ---------------- | --------------- | ---------------------- |
| `data`           | object          | Authenticated user     |
| `data.id`        | string/UUID     | Unique user identifier |
| `data.email`     | string          | User’s email address   |
| `data.createdAt` | string/datetime | Account creation time  |

The response never contains a password or password hash.

### Possible responses

|                      Status | Error code        | Cause                                |
| --------------------------: | ----------------- | ------------------------------------ |
|                    `200 OK` | —                 | Account returned successfully        |
|          `401 Unauthorized` | `UNAUTHENTICATED` | Token is missing, invalid or expired |
|             `404 Not Found` | `USER_NOT_FOUND`  | Token user no longer exists          |
| `500 Internal Server Error` | `INTERNAL_ERROR`  | Unexpected internal failure          |

### Missing-token response

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "A valid access token is required",
    "requestId": "bbfc16a9-7c2e-434c-a663-ea109548a449"
  }
}
```

### Expired-token response

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "A valid access token is required",
    "requestId": "9ffaf7bd-14c8-4beb-8950-36e87905b46e"
  }
}
```
---
# Operational Endpoint

## 11. Check Service Health

Reports the availability of the service, PostgreSQL database and Redis cache separately.

### Requirement IDs

`FR-21`, `CR-5`, `OR-6`

### Request

```http
GET /health
```

### Authentication

Not required.

### Request headers

No special headers are required.

### Path parameters

None.

### Query parameters

None.

### Request body

None.

### Example request

```bash
curl -i http://localhost:3000/health
```

### Healthy response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "data": {
    "status": "available",
    "checks": {
      "service": "available",
      "database": "available",
      "cache": "available"
    }
  }
}
```

### Response fields

| Field                  | Type   | Allowed values             | Meaning                      |
| ---------------------- | ------ | -------------------------- | ---------------------------- |
| `data`                 | object | —                          | Health-check result          |
| `data.status`          | string | `available`, `degraded`    | Overall service status       |
| `data.checks`          | object | —                          | Individual component results |
| `data.checks.service`  | string | `available`                | HTTP service availability    |
| `data.checks.database` | string | `available`, `unavailable` | PostgreSQL availability      |
| `data.checks.cache`    | string | `available`, `unavailable` | Redis availability           |

### Redis-unavailable response

The service can continue without Redis. Therefore, Redis failure does not necessarily return `503`.

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "data": {
    "status": "available",
    "checks": {
      "service": "available",
      "database": "available",
      "cache": "unavailable"
    }
  }
}
```

### Database-unavailable response

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
```

```json
{
  "data": {
    "status": "degraded",
    "checks": {
      "service": "available",
      "database": "unavailable",
      "cache": "available"
    }
  }
}
```
### Possible responses

|                    Status | Cause                                                                     |
| ------------------------: | ------------------------------------------------------------------------- |
|                  `200 OK` | Service and database are available; cache may be available or unavailable |
| `503 Service Unavailable` | PostgreSQL database is unavailable                                        |

---


---

# TODO Endpoints

## 12. Create a TODO Item

Creates a new TODO item for the authenticated user. The created TODO belongs only to the user identified by the JWT access token.

### Requirement IDs

`FR-8`, `FR-9`, `FR-18`, `FR-19`, `DR-6`, `DR-7`, `DR-10`, `SR-1`, `SR-7`

### Request

```http
POST /api/v1/todo
```

### Authentication

Required. The request must contain a valid JWT access token.

### Request headers

| Header | Required | Value |
| --- | ---: | --- |
| `Authorization` | Yes | `Bearer <access_token>` |
| `Content-Type` | Yes | `application/json` |

**### Path parameters**

None.

**### Query parameters**

None.

### Request body

| Field | Type | Required | Validation and allowed values | Meaning |
| --- | --- | ---: | --- | --- |
| `title` | string | Yes | 1–200 characters | Title of the TODO item |
| `description` | string or `null` | No | Maximum 5000 characters | Optional details about the TODO item |
| `state` | string | No | `pending`, `in_progress`, or `completed`; default is `pending` | Current state of the TODO item |
| `dueDate` | string/datetime or `null` | No | ISO 8601 datetime containing a timezone offset | Optional due date of the TODO item |

The authenticated user ID is obtained from the JWT. The client must not provide an `ownerId` in the request body.

### Example request

```bash
curl -i -X POST http://localhost:3000/api/v1/todo \
  -H "Authorization: Bearer <actual-access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Complete Day 2 task",
    "description": "Implement and document the create TODO endpoint",
    "state": "pending",
    "dueDate": "2026-09-20T12:00:00Z"
  }'
```

### Success response

```http
HTTP/1.1 201 Created
Content-Type: application/json
```

```json
{
  "data": {
    "id": "3c0cf078-8c35-49fb-928c-f03714ec5e32",
    "ownerId": "4d395a15-853a-4d2f-93d5-041868663cd2",
    "title": "Complete Day 2 task",
    "description": "Implement and document the create TODO endpoint",
    "state": "pending",
    "dueDate": "2026-09-20T12:00:00.000Z",
    "createdAt": "2026-09-16T08:30:00.000Z",
    "updatedAt": "2026-09-16T08:30:00.000Z"
  }
}
```

**### Success-response fields**

| Field | Type | Meaning |
| --- | --- | --- |
| `data` | object | Created TODO item |
| `data.id` | string/UUID | Unique TODO identifier |
| `data.ownerId` | string/UUID | Identifier of the authenticated owner |
| `data.title` | string | TODO title |
| `data.description` | string or `null` | Optional TODO details |
| `data.state` | string | One of `pending`, `in_progress`, or `completed` |
| `data.dueDate` | string/datetime or `null` | Optional due date |
| `data.createdAt` | string/datetime | Time at which the TODO was created |
| `data.updatedAt` | string/datetime | Time at which the TODO was last updated |


### Possible responses

| Status | Error code | Cause |
| ---: | --- | --- |
| `201 Created` | — | TODO item created successfully |
| `400 Bad Request` | `VALIDATION_ERROR` | A request field is missing or invalid |
| `401 Unauthorized` | `UNAUTHENTICATED` | Access token is missing, invalid, or expired |
| `409 Conflict` | `TODO_TITLE_EXISTS` | The owner already has an undeleted TODO with the same title |
| `500 Internal Server Error` | `INTERNAL_ERROR` | Unexpected internal failure |

### Invalid-state error

Example request body:

```json
{
  "title": "Complete Day 2 task",
  "state": "cancelled"
}
```

Example response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {
      "issues": [
        {
          "path": "body.state",
          "message": "Invalid option: expected one of pending, in_progress, or completed"
        }
      ]
    },
    "requestId": "9af63a5d-a59b-4f86-a6e9-b6cd57b15156"
  }
}
```


### Invalid-input error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {
      "issues": [
        {
          "path": "body.email",
          "message": "Invalid email address"
        }
      ]
    },
    "requestId": "37869c3a-7cad-4f24-91d4-a881736a8d75"
  }
}
```

### Duplicate-title error

The same authenticated user cannot own two undeleted TODO items with identical titles.

```json
{
  "error": {
    "code": "TODO_TITLE_EXISTS",
    "message": "An active TODO with this title already exists",
    "requestId": "178d6b2c-75f5-4fc5-bfc4-38812fb04ffd"
  }
}
```

Two different users may each create a TODO with the same title.

### Missing-token error

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "A valid access token is required",
    "requestId": "0d495373-72af-4491-8b05-f8299013137f"
  }
}
---
```


## 13. List TODO Items

Returns a paginated list of TODO items owned by the authenticated user. The list supports state filtering and sorting by creation date or due date.

### Requirement IDs

`FR-10`, `FR-11`, `FR-12`, `FR-13`, `CR-1`, `CR-2`, `CR-3`, `CR-6`

### Request

```http
GET /api/v1/todo
```

### Authentication

Required. The request must contain a valid JWT access token.

### Request headers

| Header          | Required | Value                   |
| --------------- | -------: | ----------------------- |
| `Authorization` |      Yes | `Bearer <access_token>` |

### Path parameters

None.

### Query parameters

| Parameter   | Type    | Required | Default     | Allowed values                        | Meaning                       |
| ----------- | ------- | -------: | ----------- | ------------------------------------- | ----------------------------- |
| `page`      | integer |       No | `1`         | Minimum `1`                           | Requested page number         |
| `pageSize`  | integer |       No | `20`        | `1`–`100`                             | Number of TODO items per page |
| `state`     | string  |       No | —           | `pending`, `in_progress`, `completed` | Filters TODOs by state        |
| `sortBy`    | string  |       No | `createdAt` | `createdAt`, `dueDate`                | Field used for sorting        |
| `sortOrder` | string  |       No | `desc`      | `asc`, `desc`                         | Sorting direction             |

### Request body

None.

### Example request

```bash
curl -i "http://localhost:3000/api/v1/todo?page=1&pageSize=20&state=pending&sortBy=dueDate&sortOrder=asc" \
  -H "Authorization: Bearer <actual-access-token>"
```

### Success response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "data": {
    "items": [
      {
        "id": "3c0cf078-8c35-49fb-928c-f03714ec5e32",
        "ownerId": "4d395a15-853a-4d2f-93d5-041868663cd2",
        "title": "Complete Day 2 task",
        "description": "Implement the TODO endpoints",
        "state": "pending",
        "dueDate": "2026-09-20T12:00:00.000Z",
        "createdAt": "2026-09-16T08:30:00.000Z",
        "updatedAt": "2026-09-16T08:30:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 1,
      "totalPages": 1
    }
  }
}
```

### Success-response fields

| Field                        | Type                      | Meaning                                    |
| ---------------------------- | ------------------------- | ------------------------------------------ |
| `data`                       | object                    | List result                                |
| `data.items`                 | array                     | TODO items owned by the authenticated user |
| `data.items[].id`            | string/UUID               | Unique TODO identifier                     |
| `data.items[].ownerId`       | string/UUID               | Identifier of the authenticated owner      |
| `data.items[].title`         | string                    | TODO title                                 |
| `data.items[].description`   | string or `null`          | Optional TODO details                      |
| `data.items[].state`         | string                    | `pending`, `in_progress`, or `completed`   |
| `data.items[].dueDate`       | string/datetime or `null` | Optional due date                          |
| `data.items[].createdAt`     | string/datetime           | Creation time                              |
| `data.items[].updatedAt`     | string/datetime           | Last update time                           |
| `data.pagination`            | object                    | Pagination information                     |
| `data.pagination.page`       | integer                   | Current page                               |
| `data.pagination.pageSize`   | integer                   | Maximum items on the page                  |
| `data.pagination.totalItems` | integer                   | Total matching TODO items                  |
| `data.pagination.totalPages` | integer                   | Total available pages                      |

The client can determine the total number of pages using `totalPages` without sending another request.

### Empty-list response

```json
{
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 0,
      "totalPages": 0
    }
  }
}
```

### Possible responses

|                      Status | Error code         | Cause                                        |
| --------------------------: | ------------------ | -------------------------------------------- |
|                    `200 OK` | —                  | TODO list returned successfully              |
|           `400 Bad Request` | `VALIDATION_ERROR` | A query parameter is invalid                 |
|          `401 Unauthorized` | `UNAUTHENTICATED`  | Access token is missing, invalid, or expired |
| `500 Internal Server Error` | `INTERNAL_ERROR`   | Unexpected internal failure                  |

### Invalid-query error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {
      "issues": [
        {
          "path": "query.pageSize",
          "message": "Too big: expected number to be <=100"
        }
      ]
    },
    "requestId": "10313d2e-902a-467a-a341-b0e8151789aa"
  }
}
```

---

## 14. Retrieve One TODO Item

Returns one undeleted TODO item owned by the authenticated user.

### Requirement IDs

`FR-14`, `FR-20`, `CR-1`, `CR-2`, `CR-3`, `CR-6`

### Request

```http
GET /api/v1/todo/{id}
```

### Authentication

Required. The request must contain a valid JWT access token.

### Request headers

| Header          | Required | Value                   |
| --------------- | -------: | ----------------------- |
| `Authorization` |      Yes | `Bearer <access_token>` |

### Path parameters

| Parameter | Type        | Required | Meaning                |
| --------- | ----------- | -------: | ---------------------- |
| `id`      | string/UUID |      Yes | Unique TODO identifier |

### Query parameters

None.

### Request body

None.

### Example request

```bash
curl -i http://localhost:3000/api/v1/todo/3c0cf078-8c35-49fb-928c-f03714ec5e32 \
  -H "Authorization: Bearer <actual-access-token>"
```

### Success response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "data": {
    "id": "3c0cf078-8c35-49fb-928c-f03714ec5e32",
    "ownerId": "4d395a15-853a-4d2f-93d5-041868663cd2",
    "title": "Complete Day 2 task",
    "description": "Implement the TODO endpoints",
    "state": "pending",
    "dueDate": "2026-09-20T12:00:00.000Z",
    "createdAt": "2026-09-16T08:30:00.000Z",
    "updatedAt": "2026-09-16T08:30:00.000Z"
  }
}
```

### Success-response fields

| Field              | Type                      | Meaning                                  |
| ------------------ | ------------------------- | ---------------------------------------- |
| `data`             | object                    | Requested TODO item                      |
| `data.id`          | string/UUID               | Unique TODO identifier                   |
| `data.ownerId`     | string/UUID               | Identifier of the authenticated owner    |
| `data.title`       | string                    | TODO title                               |
| `data.description` | string or `null`          | Optional TODO details                    |
| `data.state`       | string                    | `pending`, `in_progress`, or `completed` |
| `data.dueDate`     | string/datetime or `null` | Optional due date                        |
| `data.createdAt`   | string/datetime           | Creation time                            |
| `data.updatedAt`   | string/datetime           | Last update time                         |

### Ownership behaviour

The API returns the same `404 TODO_NOT_FOUND` response when:

1. The TODO does not exist.
2. The TODO has been deleted.
3. The TODO belongs to another user.

This prevents the caller from discovering whether another user owns the requested TODO.

### Possible responses

|                      Status | Error code         | Cause                                               |
| --------------------------: | ------------------ | --------------------------------------------------- |
|                    `200 OK` | —                  | TODO returned successfully                          |
|           `400 Bad Request` | `VALIDATION_ERROR` | TODO ID is not a valid UUID                         |
|          `401 Unauthorized` | `UNAUTHENTICATED`  | Access token is missing, invalid, or expired        |
|             `404 Not Found` | `TODO_NOT_FOUND`   | TODO is absent, deleted, or belongs to another user |
| `500 Internal Server Error` | `INTERNAL_ERROR`   | Unexpected internal failure                         |

### Invalid-ID error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {
      "issues": [
        {
          "path": "params.id",
          "message": "Invalid UUID"
        }
      ]
    },
    "requestId": "74d2bb5c-a48f-4fa5-8858-44539b991c7d"
  }
}
```

### TODO-not-found error

```json
{
  "error": {
    "code": "TODO_NOT_FOUND",
    "message": "TODO item not found",
    "requestId": "514ea384-f882-4d2f-a454-29d3f9511a49"
  }
}
```

---

## 15. Update a TODO Item

Partially updates an undeleted TODO item owned by the authenticated user. Only supplied fields are changed; omitted fields remain unchanged.

### Requirement IDs

`FR-15`, `FR-16`, `FR-18`, `FR-20`, `CR-4`, `SR-1`, `SR-7`

### Request

```http
PATCH /api/v1/todo/{id}
```

### Authentication

Required. The request must contain a valid JWT access token.

### Request headers

| Header          | Required | Value                   |
| --------------- | -------: | ----------------------- |
| `Authorization` |      Yes | `Bearer <access_token>` |
| `Content-Type`  |      Yes | `application/json`      |

### Path parameters

| Parameter | Type        | Required | Meaning                |
| --------- | ----------- | -------: | ---------------------- |
| `id`      | string/UUID |      Yes | Unique TODO identifier |

### Query parameters

None.

### Request body

At least one field must be supplied.

| Field         | Type                      | Required | Validation and allowed values          | Meaning                                  |
| ------------- | ------------------------- | -------: | -------------------------------------- | ---------------------------------------- |
| `title`       | string                    |       No | 1–200 characters                       | New TODO title                           |
| `description` | string or `null`          |       No | Maximum 5000 characters                | New description; use `null` to remove it |
| `state`       | string                    |       No | `pending`, `in_progress`, `completed`  | New TODO state                           |
| `dueDate`     | string/datetime or `null` |       No | ISO 8601 datetime with timezone offset | New due date; use `null` to remove it    |

The client must not provide `id`, `ownerId`, `createdAt`, `updatedAt`, or `deletedAt`.

### Example request

```bash
curl -i -X PATCH http://localhost:3000/api/v1/todo/3c0cf078-8c35-49fb-928c-f03714ec5e32 \
  -H "Authorization: Bearer <actual-access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "completed",
    "description": "The TODO API implementation is complete"
  }'
```

### Success response

```http
HTTP/1.1 200 OK
Content-Type: application/json
```

```json
{
  "data": {
    "id": "3c0cf078-8c35-49fb-928c-f03714ec5e32",
    "ownerId": "4d395a15-853a-4d2f-93d5-041868663cd2",
    "title": "Complete Day 2 task",
    "description": "The TODO API implementation is complete",
    "state": "completed",
    "dueDate": "2026-09-20T12:00:00.000Z",
    "createdAt": "2026-09-16T08:30:00.000Z",
    "updatedAt": "2026-09-16T11:45:00.000Z"
  }
}
```

### Success-response fields

| Field              | Type                      | Meaning                               |
| ------------------ | ------------------------- | ------------------------------------- |
| `data`             | object                    | Updated TODO item                     |
| `data.id`          | string/UUID               | Unique TODO identifier                |
| `data.ownerId`     | string/UUID               | Identifier of the authenticated owner |
| `data.title`       | string                    | Current TODO title                    |
| `data.description` | string or `null`          | Current TODO details                  |
| `data.state`       | string                    | Current TODO state                    |
| `data.dueDate`     | string/datetime or `null` | Current due date                      |
| `data.createdAt`   | string/datetime           | Original creation time                |
| `data.updatedAt`   | string/datetime           | Most recent update time               |

### Partial-update behaviour

For this request:

```json
{
  "state": "completed"
}
```

Only `state` and the server-managed `updatedAt` value change. The title, description, due date, owner and creation time remain unchanged.

### Ownership behaviour

A missing, deleted, or foreign-owned TODO produces the same `404 TODO_NOT_FOUND` response.

### Possible responses

|                      Status | Error code          | Cause                                                              |
| --------------------------: | ------------------- | ------------------------------------------------------------------ |
|                    `200 OK` | —                   | TODO updated successfully                                          |
|           `400 Bad Request` | `VALIDATION_ERROR`  | ID, body, field or state is invalid                                |
|          `401 Unauthorized` | `UNAUTHENTICATED`   | Access token is missing, invalid, or expired                       |
|             `404 Not Found` | `TODO_NOT_FOUND`    | TODO is absent, deleted, or belongs to another user                |
|              `409 Conflict` | `TODO_TITLE_EXISTS` | Another active TODO owned by the same user has the requested title |
| `500 Internal Server Error` | `INTERNAL_ERROR`    | Unexpected internal failure                                        |

### Empty-body error

Request:

```json
{}
```

Response:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {
      "issues": [
        {
          "path": "body",
          "message": "At least one field must be provided"
        }
      ]
    },
    "requestId": "34708812-60ef-4470-bb46-f8013181124b"
  }
}
```

### Duplicate-title error

```json
{
  "error": {
    "code": "TODO_TITLE_EXISTS",
    "message": "An active TODO with this title already exists",
    "requestId": "d81d634b-e50a-46aa-ac05-b30ee617ac07"
  }
}
```

### TODO-not-found error

```json
{
  "error": {
    "code": "TODO_NOT_FOUND",
    "message": "TODO item not found",
    "requestId": "455d2fe6-88d0-4f17-aa0b-f47cc043f215"
  }
}
```

---
