exports.up = (pgm) => {
  pgm.createTable("todo_owner_projection_rebuilds", {
    id: {
      type: "uuid",
      primaryKey: true,
      notNull: true,
    },

    started_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("CURRENT_TIMESTAMP"),
    },

    completed_at: {
      type: "timestamptz",
    },
  });

  pgm.createTable("todo_owner_projection_rebuild_members", {
    rebuild_id: {
      type: "uuid",
      notNull: true,
      references: "todo_owner_projection_rebuilds(id)",
      onDelete: "CASCADE",
    },

    user_id: {
      type: "uuid",
      notNull: true,
    },
  });

  pgm.addConstraint(
    "todo_owner_projection_rebuild_members",
    "todo_owner_projection_rebuild_members_pkey",
    {
      primaryKey: ["rebuild_id", "user_id"],
    },
  );

  pgm.createIndex(
    "todo_owner_projection_rebuild_members",
    ["user_id"],
    {
      name: "idx_owner_projection_rebuild_members_user_id",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable("todo_owner_projection_rebuild_members");
  pgm.dropTable("todo_owner_projection_rebuilds");
};