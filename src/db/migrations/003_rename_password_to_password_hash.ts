import type { MigrationBuilder } from "node-pg-migrate";

export function up(pgm: MigrationBuilder): void {
  pgm.renameColumn("users", "password", "password_hash");
}

export function down(pgm: MigrationBuilder): void {
  pgm.renameColumn("users", "password_hash", "password");
}
