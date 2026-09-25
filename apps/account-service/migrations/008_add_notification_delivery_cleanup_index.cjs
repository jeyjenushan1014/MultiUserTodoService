exports.up = (pgm) => {
  pgm.createIndex(
    "notification_event_deliveries",
    [
      "updated_at",
    ],
    {
      name:
        "idx_notification_deliveries_cleanup_updated",
      where:
        "status <> 'processing'",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropIndex(
    "notification_event_deliveries",
    "updated_at",
    {
      name:
        "idx_notification_deliveries_cleanup_updated",
      ifExists: true,
    },
  );
};
