# Multi-User TODO Service API Documentation

## 1. API Overview

The Multi-User TODO Service allows users to create accounts, authenticate using email and password, and securely manage their own TODO items.

This document covers the Day 1 endpoints:

1. Register a user account


## 2. Base URL

```text
http://localhost:3000
```

All versioned application endpoints begin with:

```text
/api/v1
```


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
