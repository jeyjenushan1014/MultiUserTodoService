exports.up = (pgm) => {
  pgm.createTable(
    "todos",
    {
      id: {
        type: "uuid",
        primaryKey: true,
        notNull: true,
      },

      owner_id: {
        type: "uuid",
        notNull: true,
        references:
          "todo_owners(id)",
        onDelete:
          "RESTRICT",
        onUpdate:
          "CASCADE",
      },

      title: {
        type: "varchar(200)",
        notNull: true,
      },

      description: {
        type: "varchar(5000)",
      },

      state: {
        type: "varchar(20)",
        notNull: true,
        default: "pending",
      },

      due_date: {
        type: "timestamptz",
      },

      created_at: {
        type: "timestamptz",
        notNull: true,
        default:
          pgm.func(
            "CURRENT_TIMESTAMP",
          ),
      },

      updated_at: {
        type: "timestamptz",
        notNull: true,
        default:
          pgm.func(
            "CURRENT_TIMESTAMP",
          ),
      },

      deleted_at: {
        type: "timestamptz",
      },
    },
  );

  pgm.addConstraint(
    "todos",
    "chk_todos_title_not_blank",
    {
      check:
        "char_length(btrim(title)) BETWEEN 1 AND 200",
    },
  );

  pgm.addConstraint(
    "todos",
    "chk_todos_description_length",
    {
      check:
        "description IS NULL OR char_length(description) <= 5000",
    },
  );

  pgm.addConstraint(
    "todos",
    "chk_todos_state",
    {
      check:
        "state IN ('pending', 'in_progress', 'completed', 'cancelled')",
    },
  );

  pgm.addConstraint(
    "todos",
    "chk_todos_updated_after_creation",
    {
      check:
        "updated_at >= created_at",
    },
  );

  /*
   Enforces one active title per owner.

   LOWER and BTRIM make title comparison:
   - case-insensitive
   - insensitive to leading/trailing spaces

   Soft-deleted rows are excluded.
  */
  pgm.sql(`
    CREATE UNIQUE INDEX
      uq_todos_owner_normalized_title_active
    ON todos (
      owner_id,
      LOWER(BTRIM(title))
    )
    WHERE deleted_at IS NULL;
  `);

  /*
   Supports the most common list query:

   WHERE owner_id = ?
     AND deleted_at IS NULL
   ORDER BY created_at DESC, id DESC
  */
  pgm.sql(`
    CREATE INDEX
      idx_todos_owner_created_active
    ON todos (
      owner_id,
      created_at DESC,
      id DESC
    )
    WHERE deleted_at IS NULL;
  `);

  /*
   Supports owner-scoped filtering by state.
  */
  pgm.sql(`
    CREATE INDEX
      idx_todos_owner_state_created_active
    ON todos (
      owner_id,
      state,
      created_at DESC,
      id DESC
    )
    WHERE deleted_at IS NULL;
  `);

  /*
   Supports owner-scoped due-date sorting.

   TODOs without a due date appear after dated TODOs.
  */
  pgm.sql(`
    CREATE INDEX
      idx_todos_owner_due_date_active
    ON todos (
      owner_id,
      due_date ASC NULLS LAST,
      id ASC
    )
    WHERE deleted_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable(
    "todos",
  );
};