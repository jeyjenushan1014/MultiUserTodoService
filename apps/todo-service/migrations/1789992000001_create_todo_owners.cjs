exports.up = (pgm) => {
  pgm.createTable(
    "todo_owners",
    {
      id: {
        type: "uuid",
        primaryKey: true,
        notNull: true,
      },

      account_created_at: {
        type: "timestamptz",
        notNull: true,
      },

      created_at: {
        type: "timestamptz",
        notNull: true,
        default:
          pgm.func(
            "CURRENT_TIMESTAMP",
          ),
      },

      deactivated_at: {
        type: "timestamptz",
      },
    },
  );

  pgm.createIndex(
    "todo_owners",
    ["deactivated_at"],
    {
      name:
        "idx_todo_owners_deactivated_at",
      where:
        "deactivated_at IS NOT NULL",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable(
    "todo_owners",
  );
};