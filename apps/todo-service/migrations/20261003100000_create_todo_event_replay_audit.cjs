exports.up = (pgm) => {
  pgm.createTable("todo_event_replay_audit", {
    id: {
      type: "uuid",
      primaryKey: true,
      notNull: true,
    },
    event_id: {
      type: "uuid",
      notNull: true,
    },
    target_consumer: {
      type: "varchar(100)",
      notNull: true,
    },
    operator_id: {
      type: "varchar(100)",
      notNull: true,
    },
    status: {
      type: "varchar(30)",
      notNull: true,
    },
    error_code: {
      type: "varchar(80)",
    },
    requested_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("CURRENT_TIMESTAMP"),
    },
    completed_at: {
      type: "timestamptz",
    },
  });

  pgm.addConstraint(
    "todo_event_replay_audit",
    "todo_event_replay_audit_target_check",
    { check: "target_consumer = 'todo-history'" },
  );

  pgm.addConstraint(
    "todo_event_replay_audit",
    "todo_event_replay_audit_status_check",
    { check: "status IN ('started', 'queued', 'already_processed', 'failed')" },
  );

  pgm.createIndex(
    "todo_event_replay_audit",
    ["event_id", "target_consumer", "requested_at"],
    { name: "idx_todo_event_replay_audit_lookup" },
  );
};

exports.down = (pgm) => {
  pgm.dropTable("todo_event_replay_audit");
};