exports.up = (pgm) => {
  pgm.createTable(
    "password_reset_tokens",
    {
      id: {
        type: "uuid",
        primaryKey: true,
      },

      user_id: {
        type: "uuid",
        notNull: true,
        references: "users(id)",
        onDelete: "CASCADE",
      },

      token_hash: {
        type: "varchar(64)",
        notNull: true,
        unique: true,
      },

      expires_at: {
        type: "timestamptz",
        notNull: true,
      },

      used_at: {
        type: "timestamptz",
      },

      created_at: {
        type: "timestamptz",
        notNull: true,
        default: pgm.func("CURRENT_TIMESTAMP"),
      },
    },
  );

  pgm.createIndex(
    "password_reset_tokens",
    ["user_id", "created_at"],
    {
      name: "idx_password_reset_tokens_user_created",
    },
  );

  pgm.createIndex(
    "password_reset_tokens",
    ["expires_at"],
    {
      name: "idx_password_reset_tokens_expires_at",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable(
    "password_reset_tokens",
  );
};