exports.up = (pgm) => {
  pgm.createTable(
    "notification_event_deliveries",
    {
      event_id: {
        type: "uuid",
        primaryKey: true,
      },

      status: {
        type: "text",
        notNull: true,
        default: "processing",
      },

      processing_token: {
        type: "uuid",
        notNull: true,
      },

      lease_until: {
        type: "timestamptz",
        notNull: true,
      },

      attempts: {
        type: "integer",
        notNull: true,
        default: 1,
      },

      last_error: {
        type: "text",
      },

      updated_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("CURRENT_TIMESTAMP"),
      },
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable(
    "notification_event_deliveries",
  );
};