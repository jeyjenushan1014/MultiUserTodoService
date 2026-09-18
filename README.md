# Multi-User TODO Service

A secure multi-user TODO REST API built with Node.js, TypeScript, Express, PostgreSQL, Redis, JWT and Docker.

Each user can create an account, log in and manage only their own TODO items. The service supports validation, pagination, filtering, sorting, caching, health checks, structured logging and database migrations.

## Features

* User registration using email and password
* Secure password hashing with bcrypt
* JWT-based authentication
* Retrieve authenticated account details
* Create, retrieve, update and delete TODO items
* User-based TODO ownership protection
* Fixed TODO states
* Partial TODO updates
* Pagination
* State filtering
* Creation-date and due-date sorting
* PostgreSQL raw SQL queries
* File-based database migrations
* Redis caching with expiration
* Cache invalidation after writes
* Graceful fallback when Redis is unavailable
* Service, database and cache health checks
* Structured request logging
* Sensitive-data redaction
* Docker and Docker Compose support
* Strict TypeScript configuration
* Consistent API error responses

## Technology Stack

| Concern          | Technology                |
| ---------------- | ------------------------- |
| Language         | TypeScript                |
| Runtime          | Node.js                   |
| Framework        | Express.js                |
| Validation       | Zod                       |
| Database         | PostgreSQL                |
| Database access  | `pg` raw SQL driver       |
| Migrations       | `node-pg-migrate`         |
| Authentication   | JSON Web Token            |
| Password hashing | bcrypt                    |
| Cache            | Redis                     |
| Logging          | Pino and `pino-http`      |
| Security headers | Helmet                    |
| Testing          | Vitest and Supertest      |
| Containers       | Docker and Docker Compose |

## Project Structure

```text
MultiUserTodoService/
├── docs/
│   ├── api.md
│   └── QUESTIONS.md
├── src/
│   ├── config/
│   │   ├── cache.ts
│   │   ├── database.ts
│   │   ├── env.ts
│   │   └── logger.ts
│   ├── db/
│   │   └── migrations/
│   │       ├── 001_create_users.ts
│   │       └── 002_create_todos.ts
│   ├── tests/
│   │   └── todo.validation.test.ts
│   ├── features/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.repository.ts
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.types.ts
│   │   │   └── auth.validation.ts
│   │   ├── health/
│   │   │   ├── health.controller.ts
│   │   │   ├── health.repository.ts
│   │   │   ├── health.routes.ts
│   │   │   └── health.service.ts
│   │   └── todo/
│   │       ├── todo.cache.ts
│   │       ├── todo.controller.ts
│   │       ├── todo.repository.ts
│   │       ├── todo.routes.ts
│   │       ├── todo.service.ts
│   │       ├── todo.types.ts
│   │       └── todo.validation.ts
│   ├── middleware/
│   │   ├── authenticate.ts
│   │   ├── error-handler.ts
│   │   └── request-logger.ts
│   ├── shared/
│   │   ├── app-error.ts
│   │   ├── async-handler.ts
│   │   └── validate.ts
│   ├── app.ts
│   └── server.ts
    ├── tests/
│        └── todo.validation.test.ts
├── .dockerignore
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── package.json
├── package-lock.json
└── tsconfig.json
```

## Quick Start for New Developers

If you are setting up the project for the first time on your local machine, use this Docker-first workflow:

1. Clone the repository:

```bash
git clone https://github.com/jeyjenushan1014/MultiUserTodoService.git
cd MultiUserTodoService
```

2. Create the environment file from the example:

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

### Linux or macOS

```bash
cp .env.example .env
```

3. Update the values in `.env` if needed. At minimum, make sure the database, cache and JWT settings are present:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://todo_user:todo_password@localhost:5432/todo_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-at-least-32-random-characters
JWT_EXPIRES_IN_SECONDS=900
```

4. Start PostgreSQL, Redis and the API container together:

```bash
docker compose up --build
```

This builds the application image automatically and runs the API in Docker, so you do not need to install packages locally or run `npm run dev` manually.

5. In a second terminal, install the host dependencies. This is required because the migration command runs on your machine, outside the API container:

```bash
npm install
```

6. Apply the database migrations:

```bash
npm run migrate
```

7. Open the app in your browser or API client:

```text
http://localhost:3000
```

The service is ready when the server starts without errors and the health endpoint responds successfully:

```bash
curl http://localhost:3000/health
```

If you want the full setup details, environment variables, troubleshooting and endpoint documentation, continue with the sections below.

## Prerequisites

Install the following software before running the project:

* Node.js LTS
* npm
* Docker Desktop
* Git

Check the installations:

```bash
node --version
npm --version
docker --version
docker compose version
git --version
```

## Clone the Repository

```bash
git clone https://github.com/jeyjenushan1014/MultiUserTodoService.git
cd MultiUserTodoService
```

## Environment Configuration

Copy `.env.example` to `.env`.

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

### Linux or macOS

```bash
cp .env.example .env
```

Configure `.env`:

```env
NODE_ENV=development
PORT=3000

POSTGRES_USER=todo_user
POSTGRES_PASSWORD=todo_password
POSTGRES_DB=todo_db
POSTGRES_PORT=5432

REDIS_PORT=6379

DATABASE_URL=postgres://todo_user:todo_password@localhost:5432/todo_db
REDIS_URL=redis://localhost:6379

JWT_SECRET=replace-with-at-least-32-random-characters
JWT_EXPIRES_IN_SECONDS=900

CACHE_TTL_SECONDS=60
LOG_LEVEL=info
```

The `.env` file contains credentials and must never be committed to Git.

## Generate a JWT Secret

### Using OpenSSL

```cmd
openssl rand -hex 32
```

### Using Node.js

If OpenSSL is unavailable on Windows, run:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `.env`:

```env
JWT_SECRET=your-generated-secret
```

Never share or commit this secret.

## Install Dependencies

```bash
npm install
```

For a clean installation using `package-lock.json`:

```bash
npm ci
```

## Start PostgreSQL and Redis

Start the database and cache containers:

```bash
docker compose up -d postgres redis
```

Check their status:

```bash
docker compose ps
```

Both containers should be running or healthy.

View PostgreSQL logs:

```bash
docker compose logs postgres
```

View Redis logs:

```bash
docker compose logs redis
```

## Apply Database Migrations

After PostgreSQL becomes healthy, apply all pending migrations:

```bash
npm run migrate
```

The migrations create the complete database schema in order:

```text
001_create_users
002_create_todos
```

Do not edit a migration after it has been committed. Create a new migration when the schema requires another change.

To roll back the latest migration:

```bash
npm run migrate:down
```

## Run the Application Locally

Start the development server:

```bash
npm run dev
```

The API will be available at:

```text
http://localhost:3000
```

The development process automatically restarts when TypeScript source files change.

## Run with Docker

Build and start PostgreSQL, Redis and the API:

```bash
docker compose up --build
```

Run in the background:

```bash
docker compose up --build -d
```

Check the containers:

```bash
docker compose ps
```

View API logs:

```bash
docker compose logs -f api
```

Stop the containers:

```bash
docker compose down
```

The database and Redis data remain in Docker volumes after `docker compose down`.

To intentionally remove the development data and volumes:

```bash
docker compose down -v
```

Warning: the `-v` command permanently deletes the local PostgreSQL and Redis data.

## Available Scripts

| Command                | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Start the development server with automatic restart |
| `npm run build`        | Compile TypeScript into JavaScript                  |
| `npm start`            | Run the compiled production application             |
| `npm run migrate`      | Apply pending database migrations                   |
| `npm run migrate:down` | Roll back the latest migration                      |
| `npm test`             | Run automated tests                                 |
| `npm run lint`         | Check the source code with ESLint                   |
| `npm run check`        | Run linting, compilation and tests                  |

## Build the Project

```bash
npm run build
```

Compiled JavaScript is generated inside:

```text
dist/
```

Run the compiled application:

```bash
npm start
```

## Run Tests

```bash
npm test
```

Run the complete quality check:

```bash
npm run check
```

The project must compile with zero TypeScript errors.

## API Base URL

```text
http://localhost:3000
```

Versioned API endpoints begin with:

```text
/api/v1
```

The health endpoint is available at:

```text
/health
```

## API Endpoints

### Authentication

| Method | Endpoint                | Authentication | Purpose                                |
| ------ | ----------------------- | -------------- | -------------------------------------- |
| `POST` | `/api/v1/auth/register` | No             | Create an account                      |
| `POST` | `/api/v1/auth/login`    | No             | Log in and receive a JWT               |
| `GET`  | `/api/v1/auth/me`       | Yes            | Retrieve authenticated account details |

### TODO Items

| Method   | Endpoint            | Authentication | Purpose                        |
| -------- | ------------------- | -------------- | ------------------------------ |
| `POST`   | `/api/v1/todo`     | Yes            | Create a TODO                  |
| `GET`    | `/api/v1/todo`     | Yes            | List owned TODOs               |
| `GET`    | `/api/v1/todo/:id` | Yes            | Retrieve one owned TODO        |
| `PATCH`  | `/api/v1/todo/:id` | Yes            | Partially update an owned TODO |
| `DELETE` | `/api/v1/todo/:id` | Yes            | Delete an owned TODO           |

### Operations

| Method | Endpoint  | Authentication | Purpose                                        |
| ------ | --------- | -------------- | ---------------------------------------------- |
| `GET`  | `/health` | No             | Check service, database and cache availability |

Complete request fields, response fields, examples and status codes are documented in [`docs/api.md`](docs/api.md).

## TODO States

A TODO state must be one of:

```text
pending
in_progress
completed
```

Any other value is rejected before reaching the database.

## Pagination, Filtering and Sorting

The TODO list endpoint supports:

```http
GET /api/v1/todo?page=1&pageSize=20
```

Filter by state:

```http
GET /api/v1/todo?state=pending
```

Sort by creation date:

```http
GET /api/v1/todo?sortBy=createdAt&sortOrder=desc
```

Sort by due date:

```http
GET /api/v1/todo?sortBy=dueDate&sortOrder=asc
```

Supported values:

| Parameter   | Values                                |
| ----------- | ------------------------------------- |
| `page`      | Integer greater than or equal to `1`  |
| `pageSize`  | Integer from `1` to `100`             |
| `state`     | `pending`, `in_progress`, `completed` |
| `sortBy`    | `createdAt`, `dueDate`                |
| `sortOrder` | `asc`, `desc`                         |

## Authentication

Protected endpoints require an access token:

```http
Authorization: Bearer <access_token>
```

Access tokens expire after the configured period:

```env
JWT_EXPIRES_IN_SECONDS=900
```

An expired, missing or invalid token produces:

```http
401 Unauthorized
```

## Data Ownership

Every TODO belongs to one user.

The authenticated user can only:

* List their own TODO items
* Retrieve their own TODO items
* Update their own TODO items
* Delete their own TODO items

A missing, deleted or foreign-owned TODO produces the same response:

```http
404 Not Found
```

This prevents users from discovering another user’s TODO information.

## Caching

Redis caches repeated TODO read operations:

```http
GET /api/v1/todo
GET /api/v1/todo/:id
```

Cache behaviour:

* Cache entries expire after a configured TTL.
* Cache keys include the authenticated user ID.
* Different pagination, filtering and sorting options use different cache entries.
* Creating a TODO invalidates the owner’s cache.
* Updating a TODO invalidates the owner’s cache.
* Deleting a TODO invalidates the owner’s cache.
* Redis failure causes the service to use PostgreSQL.
* Cache hits and misses are recorded in application logs.

PostgreSQL remains the source of truth.

## Health Check

Request:

```bash
curl http://localhost:3000/health
```

Healthy response:

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

Redis-unavailable response:

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

The service can continue using PostgreSQL when Redis is unavailable.

## Standard Success Response

```json
{
  "data": {}
}
```

## Standard Error Response

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "requestId": "request-id"
  }
}
```

Validation errors can contain additional details:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {
      "issues": [
        {
          "path": "body.title",
          "message": "Title is required"
        }
      ]
    },
    "requestId": "request-id"
  }
}
```

Internal errors are logged by the service but implementation details are not returned to clients.

## Common Status Codes

|                      Status | Meaning                                      |
| --------------------------: | -------------------------------------------- |
|                    `200 OK` | Request succeeded                            |
|               `201 Created` | Resource created successfully                |
|            `204 No Content` | Resource deleted successfully                |
|           `400 Bad Request` | Input validation failed                      |
|          `401 Unauthorized` | Authentication is missing or invalid         |
|             `404 Not Found` | Resource does not exist or is not accessible |
|              `409 Conflict` | A uniqueness rule was violated               |
| `500 Internal Server Error` | Unexpected internal failure                  |
|   `503 Service Unavailable` | Required database dependency is unavailable  |

## Security

The service implements the following protections:

* Passwords are hashed using bcrypt.
* Plain passwords are never stored.
* JWT secrets are supplied at runtime.
* JWT tokens expire after a bounded period.
* SQL queries use parameters.
* Request input is validated before database access.
* Users cannot access another user’s TODO items.
* Internal error details are not returned to clients.
* Passwords, tokens and authorization headers are redacted from logs.
* Real credentials are excluded from version control.
* Helmet configures common security-related HTTP headers.

## Logging

Every HTTP request is logged with enough information to identify:

* HTTP method
* Request path
* Response status
* Request ID
* Request duration

Cache reads record:

```text
cacheHit: true
```

or:

```text
cacheHit: false
```

Passwords, access tokens, authorization headers and cookies are not written to logs.

## Database Migrations

The database schema is managed only through migration files stored in the repository.

Apply migrations:

```bash
npm run migrate
```

Roll back the latest migration:

```bash
npm run migrate:down
```

Existing committed migration files must not be edited. Schema corrections must be implemented using a new migration.

## Troubleshooting

### PostgreSQL connection refused

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Check its status:

```bash
docker compose ps
```

Verify the port:

```powershell
Test-NetConnection localhost -Port 5432
```

### Redis connection refused

Start Redis:

```bash
docker compose up -d redis
```

Verify the port:

```powershell
Test-NetConnection localhost -Port 6379
```

The API should continue using PostgreSQL when Redis is unavailable.

### Migration cannot connect to PostgreSQL

Confirm that `.env` contains:

```env
DATABASE_URL=postgres://todo_user:todo_password@localhost:5432/todo_db
```

Then run:

```bash
npm run migrate
```

### Port 5432 is already in use

Change the host port:

```env
POSTGRES_PORT=5433
```

Update the local database URL:

```env
DATABASE_URL=postgres://todo_user:todo_password@localhost:5433/todo_db
```

Restart the containers:

```bash
docker compose down
docker compose up -d postgres redis
```

### Port 3000 is already in use

Change:

```env
PORT=3001
API_PORT=3001
```

Restart the application.

## Questions and Resolutions

Development questions, attempted solutions and final resolutions are recorded in:

```text
docs/QUESTIONS.md
```

## License

This project is provided for backend training and educational purposes.
