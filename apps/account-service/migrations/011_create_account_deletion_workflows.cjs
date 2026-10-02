exports.up = (pgm) => {
  pgm.createTable("account_deletion_requests", {
    id: { type: "uuid", primaryKey: true },
    user_id: { type: "uuid", references: "users(id)", onDelete: "SET NULL" },
    identity_hash: { type: "varchar", notNull: true, unique: true },
    anonymized_owner_id: { type: "uuid" },
    notification_event_ids: { type: "uuid[]", notNull: true },
    status: { type: "varchar", notNull: true, default: "pending" },
    attempts: { type: "integer", notNull: true, default: 0 },
    next_attempt_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
    locked_at: { type: "timestamptz" },
    locked_by: { type: "varchar" },
    last_error: { type: "text" },
    requested_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
    updated_at: { type: "timestamptz", notNull: true },
    completed_at: { type: "timestamptz" },
  });
  pgm.addConstraint("account_deletion_requests", "account_deletion_status_check", {
    check: "status IN ('pending', 'processing', 'retry', 'completed', 'blocked')",
  });
  pgm.addConstraint("account_deletion_requests", "account_deletion_attempts_check", {
    check: "attempts >= 0",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("account_deletion_requests");
};