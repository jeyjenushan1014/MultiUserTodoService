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
        password
      )
      VALUES ($1, $2)
      RETURNING
        id,
        email,
        password,
        created_at
    `,
    [email, password],
  );

  return result.rows[0]!;
}
