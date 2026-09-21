exports.up = (pgm) => {
  pgm.createTable(
    "users",
    {
      id: {
        type: "uuid",
        primaryKey: true,
      },

      email: {
        type: "varchar(254)",
        notNull: true,
      },

      password_hash: {
        type: "text",
        notNull: true,
      },

      created_at: {
        type: "timestamptz",
        notNull: true,
        default:
          pgm.func("CURRENT_TIMESTAMP"),
      },

      updated_at: {
        type: "timestamptz",
        notNull: true,
        default:
          pgm.func("CURRENT_TIMESTAMP"),
      },
    },
  );

  pgm.addConstraint(
    "users",
    "users_email_normalized_check",
    {
      check:
        "email = LOWER(BTRIM(email))",
    },
  );

  pgm.addConstraint(
    "users",
    "users_email_not_empty_check",
    {
      check:
        "LENGTH(email) > 0",
    },
  );

  pgm.addConstraint(
    "users",
    "users_password_hash_not_empty_check",
    {
      check:
        "LENGTH(password_hash) > 0",
    },
  );

  pgm.createIndex(
    "users",
    "email",
    {
      name:
        "users_email_unique_index",
      unique: true,
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable(
    "users",
  );
};