exports.up = (pgm) => {
  pgm.createTable(
    "todo_idempotency_records",
    {
      owner_id: {
        type: "uuid",
        notNull: true,
      },

      idempotency_key: {
        type: "varchar(128)",
        notNull: true,
      },

      request_hash: {
        type: "char(64)",
        notNull: true,
      },

      todo_id: {
        type: "uuid",
        notNull: true,
      },

      created_at: {
        type: "timestamptz",
        notNull: true,
      },

      expires_at: {
        type: "timestamptz",
        notNull: true,
      },
    },
    {
      constraints: {
        primaryKey: [
          "owner_id",
          "idempotency_key",
        ],
      },
    },
  );

  pgm.createIndex(
    "todo_idempotency_records",
    "expires_at",
    {
      name:
        "idx_todo_idempotency_records_expires_at",
    },
  );

  pgm.createIndex(
    "todo_idempotency_records",
    "todo_id",
    {
      name:
        "idx_todo_idempotency_records_todo_id",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable(
    "todo_idempotency_records",
  );
};