exports.up = (pgm) => {
  pgm.addColumns(
    "outbox_events",
    {


      next_attempt_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func(
          "CURRENT_TIMESTAMP",
        ),
      },
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
        "idx_outbox_events_pending_delivery",
      where:
        "published_at IS NULL",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropIndex(
    "outbox_events",
    [
      "next_attempt_at",
      "occurred_at",
    ],
    {
      name:
        "idx_outbox_events_pending_delivery",
      ifExists: true,
    },
  );

  pgm.dropColumns(
    "outbox_events",
    [
      "next_attempt_at",
    ],
  );
};