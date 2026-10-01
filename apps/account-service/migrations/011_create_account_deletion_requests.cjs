exports.up = (pgm) => {
  pgm.createTable("account_deletion_requests", {
    id: { type: "uuid", primaryKey: true },
    user_id: { type: "uuid" },
    idempotency_key_hash: { type: "char(64)", notNull: true },
    correlation_id: { type: "text", notNull: true },
    status: { type: "text", notNull: true, default: "pending" },
    current_step: { type: "text", notNull: true, default: "prepare-workspaces" },
    orphaned_workspace_ids: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    workspace_ids: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    session_ids: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    attempts: { type: "integer", notNull: true, default: 0 },
    next_attempt_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
    lease_owner: { type: "text" },
    lease_expires_at: { type: "timestamptz" },
    last_error: { type: "text" },
    requested_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
    completed_at: { type: "timestamptz" },
  });
  pgm.addConstraint("account_deletion_requests", "account_deletion_requests_user_key_unique", {
    unique: ["user_id", "idempotency_key_hash"],
  });
  pgm.addConstraint("account_deletion_requests", "account_deletion_requests_status_check", {
    check: "status IN ('pending', 'running', 'completed', 'failed')",
  });
  pgm.createIndex("account_deletion_requests", ["status", "next_attempt_at", "requested_at"], {
    name: "account_deletion_requests_status_requested_index",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("account_deletion_requests");
};