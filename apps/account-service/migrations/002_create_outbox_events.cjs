exports.up = (pgm) => {
  pgm.createTable(
    "outbox_events",
    {
      id: {
        type: "uuid",
        primaryKey: true,
      },

      aggregate_type: {
        type: "varchar(100)",
        notNull: true,
      },

      aggregate_id: {
        type: "uuid",
        notNull: true,
      },

      event_type: {
        type: "varchar(150)",
        notNull: true,
      },

      event_version: {
        type: "integer",
        notNull: true,
        default: 1,
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
        default:
          pgm.func("CURRENT_TIMESTAMP"),
      },

      published_at: {
        type: "timestamptz",
        notNull: false,
      },

      publish_attempts: {
        type: "integer",
        notNull: true,
        default: 0,
      },

      last_error: {
        type: "text",
        notNull: false,
      },

      locked_at: {
        type: "timestamptz",
        notNull: false,
      },

      locked_by: {
        type: "varchar(100)",
        notNull: false,
      },
    },
  );

  pgm.addConstraint(
    "outbox_events",
    "outbox_event_version_positive_check",
    {
      check:
        "event_version > 0",
    },
  );

  pgm.addConstraint(
    "outbox_events",
    "outbox_publish_attempts_non_negative_check",
    {
      check:
        "publish_attempts >= 0",
    },
  );

  pgm.addConstraint(
    "outbox_events",
    "outbox_aggregate_type_not_empty_check",
    {
      check:
        "LENGTH(aggregate_type) > 0",
    },
  );

  pgm.addConstraint(
    "outbox_events",
    "outbox_event_type_not_empty_check",
    {
      check:
        "LENGTH(event_type) > 0",
    },
  );

  pgm.createIndex(
    "outbox_events",
    "occurred_at",
    {
      name:
        "outbox_events_pending_index",
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
        "outbox_events_aggregate_index",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable(
    "outbox_events",
  );
};