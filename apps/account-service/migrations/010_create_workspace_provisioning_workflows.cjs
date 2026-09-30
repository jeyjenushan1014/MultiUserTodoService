exports.up = (pgm) => {
  pgm.createTable("workflows", {
    id: { type: "uuid", primaryKey: true },
    kind: { type: "text", notNull: true },
    owner_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "CASCADE" },
    idempotency_key: { type: "text", notNull: true },
    correlation_id: { type: "text", notNull: true },
    input: { type: "jsonb", notNull: true },
    status: { type: "text", notNull: true },
    current_step: { type: "text" },
    lease_owner: { type: "text" },
    lease_expires_at: { type: "timestamptz" },
    next_attempt_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
  });
  pgm.addConstraint("workflows", "workflows_owner_idempotency_unique", {
    unique: ["owner_id", "idempotency_key"],
  });
  pgm.createIndex("workflows", ["status", "next_attempt_at"]);

  pgm.createTable("workflow_steps", {
    workflow_id: { type: "uuid", notNull: true, references: "workflows(id)", onDelete: "CASCADE" },
    name: { type: "text", notNull: true },
    position: { type: "integer", notNull: true },
    status: { type: "text", notNull: true, default: "pending" },
    attempts: { type: "integer", notNull: true, default: 0 },
    compensation_attempts: { type: "integer", notNull: true, default: 0 },
    last_error: { type: "text" },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
  });
  pgm.addConstraint("workflow_steps", "workflow_steps_primary_key", {
    primaryKey: ["workflow_id", "name"],
  });

  pgm.createTable("workspace_provisioning_reservations", {
    workflow_id: { type: "uuid", primaryKey: true, references: "workflows(id)", onDelete: "CASCADE" },
    owner_id: { type: "uuid", notNull: true, references: "users(id)", onDelete: "CASCADE" },
    workspace_name: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("workspace_provisioning_reservations");
  pgm.dropTable("workflow_steps");
  pgm.dropTable("workflows");
};
