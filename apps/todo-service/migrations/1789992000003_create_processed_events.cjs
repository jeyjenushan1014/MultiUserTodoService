exports.up = (pgm) => {
  pgm.createTable(
    "processed_events",
    {
      event_id: {
        type: "uuid",
        primaryKey: true,
        notNull: true,
      },

      event_type: {
        type: "varchar(150)",
        notNull: true,
      },

      consumer_name: {
        type: "varchar(100)",
        notNull: true,
      },

      occurred_at: {
        type: "timestamptz",
        notNull: true,
      },

      processed_at: {
        type: "timestamptz",
        notNull: true,
        default:
          pgm.func(
            "CURRENT_TIMESTAMP",
          ),
      },
    },
  );

  pgm.createIndex(
    "processed_events",
    ["processed_at"],
    {
      name:
        "idx_processed_events_processed_at",
    },
  );

  pgm.createIndex(
    "processed_events",
    [
      "consumer_name",
      "event_type",
    ],
    {
      name:
        "idx_processed_events_consumer_type",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable(
    "processed_events",
  );
};