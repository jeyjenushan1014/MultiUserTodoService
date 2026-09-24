exports.up = (pgm) => {
  pgm.createTable(
    "outbox_events",
    {
      id: {
        type: "uuid",
        primaryKey: true,
        notNull: true,
      },

      aggregate_type: {
        type: "varchar(50)",
        notNull: true,
      },

      aggregate_id: {
        type: "uuid",
        notNull: true,
      },

      event_type: {
        type: "varchar(100)",
        notNull: true,
      },

      event_version: {
        type: "integer",
        notNull: true,
      },

      payload: {
        type: "jsonb",
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

      published_at: {
        type: "timestamptz",
      },

      publish_attempts: {
        type: "integer",
        notNull: true,
        default: 0,
      },

      next_attempt_at: {
        type: "timestamptz",
        notNull: true,
        default:
          pgm.func(
            "CURRENT_TIMESTAMP",
          ),
      },

      last_error: {
        type: "text",
      },

      locked_at: {
        type: "timestamptz",
      },

      locked_by: {
        type: "varchar(100)",
      },

      created_at: {
        type: "timestamptz",
        notNull: true,
        default:
          pgm.func(
            "CURRENT_TIMESTAMP",
          ),
      },
    },
  );

  pgm.addConstraint(
    "outbox_events",
    "outbox_events_event_version_positive",
    {
      check:
        "event_version > 0",
    },
  );

  pgm.addConstraint(
    "outbox_events",
    "outbox_events_publish_attempts_non_negative",
    {
      check:
        "publish_attempts >= 0",
    },
  );

  pgm.createIndex(
    "outbox_events",
    [
      "next_attempt_at",
      "occurred_at",
    ],
    {
      name:
        "idx_todo_outbox_pending_delivery",

      where:
        "published_at IS NULL",
    },
  );

  pgm.createIndex(
    "outbox_events",
    [
      "aggregate_type",
      "aggregate_id",
      "occurred_at",
    ],
    {
      name:
        "idx_todo_outbox_aggregate",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable(
    "outbox_events",
  );
};