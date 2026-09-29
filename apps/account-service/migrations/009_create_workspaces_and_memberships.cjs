exports.up = (pgm) => {
  pgm.createTable("workspaces", {
    id: {
      type: "uuid",
      primaryKey: true,
    },
    name: {
      type: "varchar(120)",
      notNull: true,
    },
    created_by: {
      type: "uuid",
      notNull: true,
      references: "users(id)",
      onDelete: "RESTRICT",
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("CURRENT_TIMESTAMP"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("CURRENT_TIMESTAMP"),
    },
  });

  pgm.addConstraint("workspaces", "workspaces_name_trimmed_check", {
    check: "name = BTRIM(name) AND LENGTH(name) BETWEEN 1 AND 120",
  });

  pgm.createTable("workspace_members", {
    workspace_id: {
      type: "uuid",
      notNull: true,
      references: "workspaces(id)",
      onDelete: "CASCADE",
    },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users(id)",
      onDelete: "RESTRICT",
    },
    role: {
      type: "varchar(32)",
      notNull: true,
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("CURRENT_TIMESTAMP"),
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("CURRENT_TIMESTAMP"),
    },
  });

  pgm.addConstraint("workspace_members", "workspace_members_primary_key", {
    primaryKey: ["workspace_id", "user_id"],
  });

  pgm.createIndex("workspace_members", ["user_id", "workspace_id"], {
    name: "workspace_members_user_workspace_index",
  });

  pgm.createIndex("workspace_members", ["workspace_id", "role"], {
    name: "workspace_members_workspace_role_index",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("workspace_members");
  pgm.dropTable("workspaces");
};