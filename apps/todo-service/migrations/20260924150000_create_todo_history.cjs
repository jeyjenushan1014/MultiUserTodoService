exports.up = (pgm) => {
  pgm.createTable("todo_history", {
    id: {
      type: "uuid",
      primaryKey: true,
      default: pgm.func("gen_random_uuid()"),
    },

    event_id: {
      type: "uuid",
      notNull: true,
      unique: true,
    },

    todo_id: {
      type: "uuid",
      notNull: true,
    },

    actor_id: {
      type: "uuid",
      notNull: true,
    },

    event_type: {
      type: "varchar(100)",
      notNull: true,
    },

    request_id: {
      type: "uuid",
      notNull: true,
    },

    occurred_at: {
      type: "timestamptz",
      notNull: true,
    },

    details: {
      type: "jsonb",
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },

    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("CURRENT_TIMESTAMP"),
    },
  });

  pgm.createIndex(
    "todo_history",
    ["todo_id", "occurred_at"],
    {
      name:
        "idx_todo_history_todo_occurred_at",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable("todo_history");
};