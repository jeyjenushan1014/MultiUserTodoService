# Multi-User TODO Platform API

## 1. Overview

The Multi-User TODO Platform is being migrated from a single application to independently deployable services.

Clients access the platform through the API Gateway.

The API Gateway is the only public application entry point. Internal services are not directly reachable from a client.

This document contains only endpoints that are currently implemented and verified in the distributed platform.

The previous monolithic API documentation is preserved at:

```text
docs/legacy/day2-monolith-api.md
```

## 2. Public Base URL

```text
http://localhost:3000
```

Future versioned business endpoints will begin with:

```text
/api/v1
```

Operational health endpoints are not versioned.

## 3. Content Type

Endpoints that accept a request body require:

```http
Content-Type: application/json
```

JSON request bodies are limited to 100 KB.

## 4. Request IDs

The Gateway accepts an optional request ID:

```http
x-request-id: UUID
```

If the supplied value is a valid UUID, the Gateway preserves it.

If the value is missing or invalid, the Gateway generates a new UUID.

Every response includes:

```http
x-request-id: UUID
```

The same request ID is used in structured logs and error responses.

## 5. Standard Error Response

All platform errors use the following structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Safe human-readable message",
    "requestId": "a4fcd832-4a93-45cf-aefe-71325d578ac6"
  }
}
```

Validation errors may include an optional `details` array:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "requestId": "a4fcd832-4a93-45cf-aefe-71325d578ac6",
    "details": [
      {
        "field": "body.email",
        "message": "Invalid email address"
      }
    ]
  }
}
```

### Error fields

| Field                     | Type        | Description                                        |
| ------------------------- | ----------- | -------------------------------------------------- |
| `error`                   | object      | Contains error information                         |
| `error.code`              | string      | Stable machine-readable error code                 |
| `error.message`           | string      | Safe human-readable message                        |
| `error.requestId`         | string/UUID | Identifier used to correlate the request with logs |
| `error.details`           | array       | Optional validation-error details                  |
| `error.details[].field`   | string      | Optional invalid request field                     |
| `error.details[].message` | string      | Validation failure message                         |

Internal stack traces, database credentials, passwords and tokens are not returned in error responses.

# Public Operational Endpoints

## 6. Gateway Health

Reports whether the Gateway process is available.

### Request

```http
GET /health
```

### Authentication

Not required.

### Path parameters

None.

### Query parameters

None.

### Request body

None.

### Example request

```powershell
curl.exe -i http://localhost:3000/health
```

### Successful response

```http
HTTP/1.1 200 OK
Content-Type: application/json
x-request-id: UUID
```

```json
{
  "status": "healthy",
  "service": "gateway"
}
```

### Response fields

| Field     | Type   | Description                  |
| --------- | ------ | ---------------------------- |
| `status`  | string | Current Gateway status       |
| `service` | string | Service reporting its health |

### Current behaviour

The Gateway does not yet use Redis or call the Account Service in the current implementation part.

Therefore, this endpoint reports the Gateway process health only.

Downstream dependency status will be added after those dependencies are integrated.

# Internal Operational Endpoints

Internal endpoints are available only through the Docker network. They are not public client APIs.

## 7. Account Service Health

Reports whether the Account Service can reach its owned PostgreSQL database.

### Internal address

```text
http://account-service:3001/health
```

### Request

```http
GET /health
```

### Authentication

Not required inside the development Docker network.

This endpoint is not published to a host port.

### Example internal request

Run the request from the Gateway container:

```powershell
docker compose exec gateway `
  wget `
  -qO- `
  http://account-service:3001/health
```

### Healthy response

```http
HTTP/1.1 200 OK
Content-Type: application/json
x-request-id: UUID
```

```json
{
  "status": "healthy",
  "service": "account-service",
  "dependencies": {
    "database": "available"
  }
}
```

### Database-unavailable response

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
x-request-id: UUID
```

```json
{
  "status": "unhealthy",
  "service": "account-service",
  "dependencies": {
    "database": "unavailable"
  }
}
```

### Response fields

| Field                   | Type   | Description                                               |
| ----------------------- | ------ | --------------------------------------------------------- |
| `status`                | string | `healthy` or `unhealthy`                                  |
| `service`               | string | Service reporting its health                              |
| `dependencies`          | object | Availability of dependencies owned or used by the service |
| `dependencies.database` | string | `available` or `unavailable`                              |

### Failure behaviour

If PostgreSQL is unavailable:

* The Account Service process remains running.
* The endpoint remains reachable through the Docker network.
* The endpoint returns `503`.
* The database is reported as unavailable.
* The Account Service does not expose database credentials.
* The Account Service can recover after PostgreSQL returns without requiring a process restart.

# Gateway Error Responses

## 8. Unknown Public Route

### Example request

```powershell
curl.exe -i http://localhost:3000/unknown
```

### Response

```http
HTTP/1.1 404 Not Found
```

```json
{
  "error": {
    "code": "ROUTE_NOT_FOUND",
    "message": "Route GET /unknown was not found",
    "requestId": "UUID"
  }
}
```

## 9. Invalid JSON

### Response

```http
HTTP/1.1 400 Bad Request
```

```json
{
  "error": {
    "code": "INVALID_JSON",
    "message": "Request body contains invalid JSON",
    "requestId": "UUID"
  }
}
```

## 10. Payload Too Large

A JSON body larger than 100 KB is rejected.

### Response

```http
HTTP/1.1 413 Payload Too Large
```

```json
{
  "error": {
    "code": "PAYLOAD_TOO_LARGE",
    "message": "Request body is too large",
    "requestId": "UUID"
  }
}
```

# Implementation Status

| Endpoint                         | Exposure               | Status                                          |
| -------------------------------- | ---------------------- | ----------------------------------------------- |
| `GET /health` on Gateway         | Public                 | Implemented and tested                          |
| `GET /health` on Account Service | Internal               | Implemented and tested                          |
| `POST /api/v1/auth/register`     | Public through Gateway | Not implemented in the distributed platform yet |
| `POST /api/v1/auth/login`        | Public through Gateway | Not implemented in the distributed platform yet |
| `GET /api/v1/auth/me`            | Public through Gateway | Not implemented in the distributed platform yet |
| Todo endpoints                   | Public through Gateway | Not migrated to the distributed platform yet    |

An endpoint must be changed to `Implemented and tested` only after its implementation, automated tests and manual verification are complete.
