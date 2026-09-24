/*
This imports the TypeScript type MigrationBuilder from the node-pg-migrate package.
 This type is used to define the structure of the migration functions up and down, which are responsible for creating and dropping the users table in the database. 
*/

import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.createTable("users", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    email: {
      type: "text",
      notNull: true,
    },

    password: {
      type: "text",
      notNull: true,
    },

    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("now()"),
    },
  });

  pgm.createIndex("users", "lower(email)", {
    name: "uq_users_email_lower",
    unique: true,
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable("users");
}