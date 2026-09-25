exports.up = (pgm) => {
  pgm.addColumn(
    "todo_owners",
    {
      projection_occurred_at: {
        type: "timestamptz",
        notNull: true,
        default:
          pgm.func(
            "CURRENT_TIMESTAMP",
          ),
      },
    },
  );

  pgm.sql(
    `
      UPDATE todo_owners
      SET projection_occurred_at = account_created_at
    `,
  );

  pgm.sql(
    `
      ALTER TABLE todo_owners
      ALTER COLUMN projection_occurred_at DROP DEFAULT
    `,
  );

  pgm.createTable(
    "todo_owner_pending_email_changes",
    {
      user_id: {
        type: "uuid",
        primaryKey: true,
        notNull: true,
      },

      email: {
        type: "varchar(320)",
        notNull: true,
      },

      occurred_at: {
        type: "timestamptz",
        notNull: true,
      },

      event_id: {
        type: "uuid",
        notNull: true,
      },
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable(
    "todo_owner_pending_email_changes",
  );

  pgm.dropColumn(
    "todo_owners",
    "projection_occurred_at",
  );
};