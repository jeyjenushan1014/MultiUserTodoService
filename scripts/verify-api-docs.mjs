import { readFile } from "node:fs/promises";

const documentation =
  await readFile(
    new URL("../docs/api.md", import.meta.url),
    "utf8",
  );

const publicEndpoints = [
  "GET /health",
  "GET /health/dependencies",
  "POST /api/v1/auth/register",
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/refresh",
  "POST /api/v1/auth/logout",
  "POST /api/v1/auth/logout-all",
  "POST /api/v1/auth/password-reset/request",
  "POST /api/v1/auth/password-reset/confirm",
  "GET /api/v1/users/me",
  "PATCH /api/v1/users/me/email",
  "POST /api/v1/todos",
  "GET /api/v1/todos",
  "GET /api/v1/todos/:todoId",
  "GET /api/v1/todos/:todoId/history",
  "PATCH /api/v1/todos/:todoId",
  "DELETE /api/v1/todos/:todoId",
  "POST /api/v1/todos/:todoId/shares",
  "DELETE /api/v1/todos/:todoId/shares/:recipientId",
];

const missingEndpoints =
  publicEndpoints.filter(
    (endpoint) =>
      !documentation.includes(
        `\`${endpoint}\``,
      ),
  );

if (missingEndpoints.length > 0) {
  throw new Error(
    `Missing API documentation:\n${missingEndpoints.join("\n")}`,
  );
}

const requiredSections = [
  "Shared response fields",
  "Ordered user flows",
  "Session revocation and history",
];

const missingSections =
  requiredSections.filter(
    (section) =>
      !documentation.includes(section),
  );

if (missingSections.length > 0) {
  throw new Error(
    `Missing API documentation sections:\n${missingSections.join("\n")}`,
  );
}

console.log(
  `API documentation verified for ${publicEndpoints.length} public endpoints.`,
);
