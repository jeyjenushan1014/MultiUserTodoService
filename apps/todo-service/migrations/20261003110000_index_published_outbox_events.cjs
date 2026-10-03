exports.up = (pgm) => {
  pgm.createIndex(
    "outbox_events",
    ["occurred_at", "id"],
    {
      name: "idx_todo_outbox_published_range",
      where: "published_at IS NOT NULL",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropIndex(
    "outbox_events",
    ["occurred_at", "id"],
    {
      name: "idx_todo_outbox_published_range",
    },
  );
};