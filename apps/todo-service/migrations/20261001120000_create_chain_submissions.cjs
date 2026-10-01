exports.up = (pgm) => {
  pgm.createTable("chain_submissions", {
    id: {
      type: "uuid",
      primaryKey: true,
      notNull: true,
    },

    // Identifies the originating application event.
    // Must be random and unique; do not store the full TODO event payload here.
    source_event_id: {
      type: "uuid",
      notNull: true,
      unique: true,
    },

    task_id: {
      type: "uuid",
      notNull: true,
    },

    workspace_id: {
      type: "uuid",
      notNull: true,
    },

    action: {
      type: "varchar(16)",
      notNull: true,
    },

    chain_id: {
      type: "bigint",
      notNull: true,
    },

    contract_address: {
      type: "varchar(42)",
      notNull: true,
    },

    writer_address: {
      type: "varchar(42)",
      notNull: true,
    },

    status: {
      type: "varchar(16)",
      notNull: true,
      default: "pending",
    },

    attempts: {
      type: "integer",
      notNull: true,
      default: 0,
    },

    next_attempt_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("CURRENT_TIMESTAMP"),
    },

    // Filled when the worker reserves a nonce for this submission.
    nonce: {
      type: "bigint",
    },

    transaction_hash: {
      type: "varchar(66)",
    },

    replacement_transaction_hash: {
      type: "varchar(66)",
    },

    confirmed_block_number: {
      type: "bigint",
    },

    confirmed_block_hash: {
      type: "varchar(66)",
    },

    locked_at: {
      type: "timestamptz",
    },

    locked_by: {
      type: "varchar(100)",
    },

    last_error: {
      type: "text",
    },

    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("CURRENT_TIMESTAMP"),
    },

    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("CURRENT_TIMESTAMP"),
    },
  });

  pgm.addConstraint(
    "chain_submissions",
    "chain_submissions_action_check",
    {
      check: "action IN ('created', 'updated', 'deleted')",
    },
  );

  pgm.addConstraint(
    "chain_submissions",
    "chain_submissions_status_check",
    {
      check:
        "status IN ('pending', 'reserved', 'submitted', 'confirmed', 'replaced', 'abandoned', 'dead_letter')",
    },
  );

  pgm.addConstraint(
    "chain_submissions",
    "chain_submissions_attempts_check",
    {
      check: "attempts >= 0",
    },
  );

  pgm.createIndex(
    "chain_submissions",
    ["next_attempt_at", "created_at"],
    {
      name: "idx_chain_submissions_pending",
      where: "status IN ('pending', 'reserved')",
    },
  );

  pgm.createIndex(
    "chain_submissions",
    ["chain_id", "writer_address", "nonce"],
    {
      name: "idx_chain_submissions_writer_nonce",
      unique: true,
      where: "nonce IS NOT NULL",
    },
  );

  pgm.createIndex(
    "chain_submissions",
    ["transaction_hash"],
    {
      name: "idx_chain_submissions_transaction_hash",
      where: "transaction_hash IS NOT NULL",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable("chain_submissions");
};