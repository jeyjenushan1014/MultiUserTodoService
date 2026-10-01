exports.up = (pgm) => {
  pgm.createTable("chain_projection_checkpoints", {
    chain_id: {
      type: "bigint",
      notNull: true,
    },
    contract_address: {
      type: "varchar(42)",
      notNull: true,
    },
    last_scanned_block: {
      type: "bigint",
      notNull: true,
    },
    last_scanned_block_hash: {
      type: "varchar(66)",
      notNull: true,
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.addConstraint(
    "chain_projection_checkpoints",
    "chain_projection_checkpoints_pkey",
    {
      primaryKey: ["chain_id", "contract_address"],
    },
  );

  pgm.createTable("chain_projection_blocks", {
    chain_id: {
      type: "bigint",
      notNull: true,
    },
    contract_address: {
      type: "varchar(42)",
      notNull: true,
    },
    block_number: {
      type: "bigint",
      notNull: true,
    },
    block_hash: {
      type: "varchar(66)",
      notNull: true,
    },
  });

  pgm.addConstraint(
    "chain_projection_blocks",
    "chain_projection_blocks_pkey",
    {
      primaryKey: ["chain_id", "contract_address", "block_number"],
    },
  );

  pgm.createTable("task_chain_events", {
    chain_id: {
      type: "bigint",
      notNull: true,
    },
    contract_address: {
      type: "varchar(42)",
      notNull: true,
    },
    transaction_hash: {
      type: "varchar(66)",
      notNull: true,
    },
    log_index: {
      type: "integer",
      notNull: true,
    },
    block_number: {
      type: "bigint",
      notNull: true,
    },
    block_hash: {
      type: "varchar(66)",
      notNull: true,
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
    chain_timestamp: {
      type: "bigint",
      notNull: true,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("current_timestamp"),
    },
  });

  pgm.addConstraint(
    "task_chain_events",
    "task_chain_events_action_check",
    {
      check: "action IN ('created', 'updated', 'deleted')",
    },
  );

  pgm.addConstraint(
    "task_chain_events",
    "task_chain_events_identity_pkey",
    {
      primaryKey: [
        "chain_id",
        "contract_address",
        "transaction_hash",
        "log_index",
      ],
    },
  );

  pgm.sql(`
    ALTER TABLE task_chain_events
    ADD CONSTRAINT task_chain_events_block_fk
    FOREIGN KEY (
      chain_id,
      contract_address,
      block_number
    )
    REFERENCES chain_projection_blocks (
      chain_id,
      contract_address,
      block_number
    )
    ON DELETE CASCADE;
  `);

  pgm.createIndex(
    "task_chain_events",
    ["task_id", "chain_timestamp", "transaction_hash", "log_index"],
    {
      name: "idx_task_chain_events_history",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable("task_chain_events");
  pgm.dropTable("chain_projection_blocks");
  pgm.dropTable("chain_projection_checkpoints");
};