exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable(
    "sessions",
    {
      id: {
        type: "uuid",
        primaryKey: true,
      },

      user_id: {
        type: "uuid",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },

      expires_at: {
        type: "timestamptz",
        notNull: true,
      },

      revoked_at: {
        type: "timestamptz",
      },

      created_at: {
        type: "timestamptz",
        notNull: true,
        default:
          pgm.func("CURRENT_TIMESTAMP"),
      },
    },
  );

  pgm.createIndex(
    "sessions",
    [
      "user_id",
      "expires_at",
    ],
    {
      name:
        "sessions_user_expiry_index",
    },
  );

  pgm.createTable(
    "refresh_tokens",
    {
      id: {
        type: "uuid",
        primaryKey: true,
      },

      session_id: {
        type: "uuid",
        notNull: true,
        references: "sessions",
        onDelete: "CASCADE",
      },

      family_id: {
        type: "uuid",
        notNull: true,
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

      replaced_by_token_id: {
        type: "uuid",
      },

      created_at: {
        type: "timestamptz",
        notNull: true,
        default:
          pgm.func("CURRENT_TIMESTAMP"),
      },
    },
  );

  pgm.createIndex(
    "refresh_tokens",
    [
      "session_id",
      "expires_at",
    ],
    {
      name:
        "refresh_tokens_session_expiry_index",
    },
  );

  pgm.createIndex(
    "refresh_tokens",
    [
      "family_id",
    ],
    {
      name:
        "refresh_tokens_family_index",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable(
    "refresh_tokens",
  );

  pgm.dropTable(
    "sessions",
  );
};