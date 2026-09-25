exports.up = (pgm) => {
  pgm.createIndex(
    "outbox_events",
    "published_at",
    {
      name: "idx_todo_outbox_cleanup_published",
      where: "published_at IS NOT NULL",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropIndex("outbox_events", "published_at", {
    name: "idx_todo_outbox_cleanup_published",
    ifExists: true,
  });
};