import { database } from "../../config/database.js";
import type { UserDatabaseRow } from "./auth.types.js";

export async function createUser(
  email: string,
  password: string,
): Promise<UserDatabaseRow> {
  const result = await database.query<UserDatabaseRow>(
    `
      INSERT INTO users (
        email,
        password_hash
      )
      VALUES ($1, $2)
      RETURNING
        id,
        email,
        password_hash,
        created_at
    `,
    [email, password],
  );

  return result.rows[0]!;
}

export async function findUserByEmail(
  email: string,
): Promise<UserDatabaseRow | undefined> {
  const result = await database.query<UserDatabaseRow>(
    `
      SELECT
        id,
        email,
        password_hash,
        created_at
      FROM users
      WHERE lower(email) = lower($1)
    `,
    [email],
  );

  return result.rows[0];
}

export async function findUserById(
  userId: string,
): Promise<UserDatabaseRow | undefined> {
  const result = await database.query<UserDatabaseRow>(
    `
      SELECT
        id,
        email,
        password_hash,
        created_at
      FROM users
      WHERE id = $1
    `,
    [userId],
  );

  return result.rows[0];
}