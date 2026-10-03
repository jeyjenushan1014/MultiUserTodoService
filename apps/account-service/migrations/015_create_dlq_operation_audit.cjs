exports.up = (pgm) => {
  pgm.createTable("dlq_operation_audit", {
    id: { type: "uuid", primaryKey: true },
    event_id: { type: "uuid", notNull: true },
    source_queue: { type: "varchar(100)", notNull: true },
    operator_id: { type: "varchar(100)", notNull: true },
    status: { type: "varchar(30)", notNull: true },
    requested_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
    completed_at: { type: "timestamptz" },
  });
  pgm.addConstraint("dlq_operation_audit", "dlq_operation_audit_status_check", {
    check: "status IN ('started', 'queued', 'already_processed', 'failed', 'outcome_uncertain')",
  });
  pgm.createIndex("dlq_operation_audit", ["event_id", "requested_at"]);
};

exports.down = (pgm) => pgm.dropTable("dlq_operation_audit");
