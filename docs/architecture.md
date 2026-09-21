# Architecture

## Project Overview

The Multi-User Todo Platform is being converted from a single Node.js application into a microservice-based system.

Day 1 Part 1 establishes the monorepo structure required to develop separate applications and shared packages.

## Current Repository Structure

```text
MultiUserTodoService/
├── apps/
│   ├── account-service/
│   └── gateway/
├── packages/
│   ├── common/
│   └── contracts/
├── docs/
├── scripts/
├── package.json
├── package-lock.json
└── tsconfig.base.json
```

## Workspace Responsibilities

### Gateway

Location:

```text
apps/gateway
```

The Gateway workspace will become the single public entry point to the platform.

The HTTP server and routing logic are not implemented in Part 1.

### Account Service

Location:

```text
apps/account-service
```

The Account Service workspace will own account and authentication responsibilities.

The HTTP server, database and account APIs are not implemented in Part 1.

### Contracts Package

Location:

```text
packages/contracts
```

The Contracts package contains data structures shared across service boundaries.

Part 1 defines the common error-response and health-response contracts.

The package must not contain:

* Database queries
* Database row types
* Controllers
* Repositories
* Business logic

### Common Package

Location:

```text
packages/common
```

The Common package is reserved for small reusable technical utilities.

Business logic must remain inside the service that owns it.

## Monorepo Decision

The project uses npm workspaces.

Each application and shared package has its own:

* `package.json`
* `tsconfig.json`
* source directory
* build command

The monorepo allows the services and shared contracts to be developed in one repository without mixing their responsibilities.

## TypeScript Rules

The project uses strict TypeScript.

The shared configuration enables:

* Strict type checking
* No implicit `any`
* Strict null checking
* Unknown error variables
* Checked array access
* Explicit return checking
* Node.js ESM module resolution

Every workspace extends the root `tsconfig.base.json`.

## Dependency Rule

Applications may import shared contracts and technical utilities:

```text
Gateway --------> Contracts
Gateway --------> Common

Account Service -> Contracts
Account Service -> Common
```

Applications must not import each other's internal source code.

For example, the Gateway must not import an Account Service repository or service class.

## Current Implementation Status

Completed in Day 1 Part 1:

* npm workspace configuration
* Gateway workspace
* Account Service workspace
* Contracts package
* Common package
* Strict TypeScript configuration
* ESLint configuration
* Repository build command
* Repository test command
* Repository check command
* Clean script

Not implemented in Part 1:

* HTTP servers
* Docker
* Docker Compose
* PostgreSQL
* Redis
* RabbitMQ
* Authentication
* Registration
* Login
* Events

These items will be documented only after their relevant implementation parts are completed.

## Shared Packages

### Contracts Package

Location:

```text
packages/contracts
```

The Contracts package contains data structures shared across service boundaries.

Current structure:

```text
src/
├── events/
│   ├── account-event.contract.ts
│   └── event-envelope.contract.ts
├── http/
│   ├── error.contract.ts
│   └── health.contract.ts
├── identity/
│   └── caller-identity.contract.ts
└── index.ts
```

Each contract is stored in a file related to its responsibility.

The root `index.ts` contains no contract definitions or implementation. It only exposes the package's supported public exports.

Applications must import contracts using:

```typescript
import type {
  HealthResponse,
} from "@todo/contracts";
```

Applications must not import internal contract files directly.

The Contracts package must not contain:

* Controllers
* Services
* Repositories
* Database queries
* Database row models
* Business logic

### Common Package

Location:

```text
packages/common
```

The Common package contains small reusable technical utilities.

Current structure:

```text
src/
├── constants/
│   └── platform.constants.ts
├── errors/
│   └── app-error.ts
├── http/
│   └── async-handler.ts
├── request-context/
│   └── request-context.ts
├── security/
│   ├── identity-signature.ts
│   └── opaque-token.ts
└── index.ts
```

The Common package currently provides:

* Shared technical constants
* Standard application errors
* Async Express error forwarding
* Request-scoped context
* Secure opaque-token generation
* Opaque-token hashing
* Internal identity encoding
* Internal identity signing and verification

The root `index.ts` contains no implementation. It only exposes the package's supported public exports.

Business logic, controllers, repositories and database models must remain inside the service that owns them.

## Internal Identity Security

The Gateway will create an internal identity after authenticating a request.

The internal identity contains:

* User ID
* Session ID
* Email address
* Request ID
* Issued time

The Gateway signs the encoded identity using HMAC-SHA256.

An internal service must verify the signature before trusting or decoding the identity.

A modified identity, incorrect secret or malformed signature must be rejected.

Signature values are compared using a timing-safe comparison.

## Sensitive Credential Storage

Refresh tokens and password-reset credentials will use opaque random values.

Opaque credentials are generated using cryptographically secure random bytes.

The raw credential will be returned only to the appropriate caller or delivery process. It must not be stored in the database or written to logs.

Only a SHA-256 hash of the credential will be stored.

If an attacker obtains a database copy, the stored hash cannot be used directly as the original credential.

## Request Context

The Common package uses asynchronous request context to store:

* Request ID
* Service name

The context remains available during asynchronous operations belonging to the same request.

Concurrent requests must retain separate contexts and must not leak request information to each other.

## Part 2 Implementation Status

Completed:

* Standard error-response contracts
* Health-response contracts
* Internal caller-identity contracts
* Versioned event-envelope contract
* Account-event contracts
* Standard application error
* Async controller error forwarding
* Request-scoped context
* Opaque-token generation and hashing
* Internal identity signing and verification
* Unit tests for shared security utilities

Not implemented in Part 2:

* HTTP servers
* Authentication middleware
* Registration API
* Database persistence
* Docker infrastructure
* RabbitMQ publishing

The account-event types currently define contracts only. They must not be considered operational events until publishing and delivery are implemented and tested.


## API Gateway Foundation

### Responsibility

The API Gateway is the planned single public entry point to the platform.

The Gateway foundation currently provides:

* Environment-variable validation
* Structured JSON logging
* Sensitive-field log redaction
* Request-ID generation and propagation
* Request-scoped asynchronous context
* HTTP request logging
* Security headers
* JSON request-size limits
* Gateway health reporting
* Standard not-found responses
* Standard global error handling
* Graceful process shutdown

Authentication, rate limiting, Redis and downstream service communication are not implemented in this part.

### Gateway Structure

```text
apps/gateway/src/
├── __tests__/
│   └── app.test.ts
├── config/
│   ├── env.ts
│   └── logger.ts
├── middleware/
│   ├── error-handler.middleware.ts
│   ├── not-found.middleware.ts
│   ├── request-context.middleware.ts
│   └── request-logger.middleware.ts
├── modules/
│   └── health/
│       ├── health.controller.ts
│       ├── health.routes.ts
│       ├── health.service.test.ts
│       └── health.service.ts
├── app.ts
└── server.ts
```

### Health Module

The health feature follows this flow:

```text
GET /health
    ↓
health.routes.ts
    ↓
health.controller.ts
    ↓
health.service.ts
    ↓
HTTP response
```

Each file has one responsibility:

| File                     | Responsibility                                  |
| ------------------------ | ----------------------------------------------- |
| `health.routes.ts`       | Maps the HTTP method and path to the controller |
| `health.controller.ts`   | Handles the HTTP request and response           |
| `health.service.ts`      | Produces the Gateway health result              |
| `health.service.test.ts` | Verifies the health-service behaviour           |

The health module does not use a repository because it does not currently read or write database data.

### Middleware Order

Gateway middleware runs in the following order:

```text
Security headers
→ Request context
→ Request logging
→ JSON body parser
→ Application routes
→ Not-found middleware
→ Global error middleware
```

The middleware order is important.

Request context runs before body parsing so that malformed JSON errors also receive a request ID.

The not-found middleware runs after all valid routes.

The global error middleware runs last so errors from all earlier middleware and routes use the standard error-response format.

### Request ID

The Gateway accepts an optional `x-request-id` request header.

If the supplied value is a valid UUID, the Gateway preserves it.

If the header is missing or invalid, the Gateway generates a new UUID.

The request ID is:

* Returned in the `x-request-id` response header
* Stored in asynchronous request context
* Added to structured logs
* Added to error responses

Invalid request-ID values are replaced instead of being trusted.

### Request Context

The Gateway uses `AsyncLocalStorage` through the Common package.

The request context stores:

* Request ID
* Service name

Each concurrent request receives a separate context. Request information must not leak between requests.

### Logging

Gateway logs use structured JSON.

Request logs include:

* HTTP method
* Request path
* Response status
* Request ID
* Request duration

Sensitive values such as passwords, access tokens, refresh tokens, reset tokens and authorization headers are configured for redaction.

Request bodies are not written to request logs.

### Error Handling

The Gateway uses one standard error-response shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Safe error message",
    "requestId": "UUID"
  }
}
```

Optional validation details may be included when appropriate.

The Gateway currently handles:

| Condition                | Status | Error code              |
| ------------------------ | -----: | ----------------------- |
| Unknown route            |    404 | `ROUTE_NOT_FOUND`       |
| Malformed JSON           |    400 | `INVALID_JSON`          |
| Request body over 100 KB |    413 | `PAYLOAD_TOO_LARGE`     |
| Unexpected error         |    500 | `INTERNAL_SERVER_ERROR` |

Unexpected internal error details and stack traces are logged but are not returned to the client.

### Security

The Gateway currently applies the following HTTP protections:

* Helmet security headers
* Disabled `x-powered-by` header
* JSON body-size limit
* Request-ID validation
* Safe error messages
* Sensitive-field log redaction

Authentication and authorization will be added in their relevant implementation parts.

### Health Behaviour

The Gateway exposes:

```http
GET /health
```

Part 3 does not integrate Redis or downstream services. Therefore, the endpoint currently reports only the health of the Gateway process.

Current response:

```json
{
  "status": "healthy",
  "service": "gateway"
}
```

Dependency health checks will be added only after those dependencies are integrated.

### Graceful Shutdown

The Gateway listens for:

* `SIGINT`
* `SIGTERM`

When either signal is received, the Gateway:

1. Stops accepting new connections.
2. Allows active connections to finish.
3. Closes the HTTP server.
4. Exits normally.

A forced-shutdown timeout prevents the process from hanging indefinitely.

### TypeScript Configuration

The Gateway uses two TypeScript configurations:

| Configuration         | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `tsconfig.json`       | Type-checks application and test files without producing output |
| `tsconfig.build.json` | Builds production source files into `dist` and excludes tests   |

This prevents automated tests from being included in the production build.

### Current Implementation Status

Completed:

* Gateway HTTP server
* Health route, controller and service
* Request-ID middleware
* Request-context middleware
* Request logging
* Structured logger
* Security headers
* JSON body-size limit
* Not-found handling
* Global error handling
* Graceful shutdown
* Gateway unit and HTTP integration tests

Not implemented:

* Redis connection
* Distributed rate limiting
* JWT authentication
* Session validation
* Account Service communication
* Signed internal identity forwarding
* Downstream timeout handling
* Circuit breaker behaviour

## Local Container Architecture

The Part 4 development environment runs through Docker Compose.

Current containers:

| Container | Responsibility |
|---|---|
| `gateway` | Public HTTP entry point |
| `account-postgres` | Future Account Service datastore |
| `redis` | Future shared cache, projections and counters |
| `rabbitmq` | Future durable asynchronous message transport |
| `mailpit` | Future local email capture |

### Network Exposure

The Gateway is the only public application entry point.

Development infrastructure ports are bound to `127.0.0.1` so they are reachable only from the local machine.

Current local ports:

| Component | Local port |
|---|---:|
| Gateway | 3000 |
| Account PostgreSQL | 55432 |
| Redis | 56379 |
| RabbitMQ | 5672 |
| RabbitMQ Management | 15672 |
| Mailpit SMTP | 1025 |
| Mailpit UI | 8025 |

Internal containers will communicate using Docker service names rather than `localhost`.

Examples:

```text
account-postgres:5432
redis:6379
rabbitmq:5672
mailpit:1025