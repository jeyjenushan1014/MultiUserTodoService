/*
Creates the durable TODO-sharing relationship.

A withdrawn share is retained for history by setting
withdrawn_at. A partial unique index allows only one
active share for a TODO and recipient while still
permitting the same TODO to be shared again after a
previous share was withdrawn.
*/

exports.up = (pgm) => {
  /*
   * PostgreSQL requires the referenced column set to
   * have a unique constraint before it can be used by
   * a composite foreign key.
   *
   * This also guarantees that a TODO ID and owner ID
   * identify one ownership relationship.
   */
  pgm.createIndex(
    "todos",
    [
      "id",
      "owner_id",
    ],
    {
      name:
        "uq_todos_id_owner_id",

      unique:
        true,
    },
  );

  pgm.createTable(
    "todo_shares",
    {
      id: {
        type:
          "uuid",

        primaryKey:
          true,

        notNull:
          true,
      },

      todo_id: {
        type:
          "uuid",

        notNull:
          true,
      },

      owner_id: {
        type:
          "uuid",

        notNull:
          true,
      },

      recipient_id: {
        type:
          "uuid",

        notNull:
          true,
      },

      permission: {
        type:
          "varchar(30)",

        notNull:
          true,

        default:
          "state-update",
      },

      created_by_request_id: {
        type:
          "uuid",

        notNull:
          true,
      },

      shared_at: {
        type:
          "timestamptz",

        notNull:
          true,

        default:
          pgm.func(
            "CURRENT_TIMESTAMP",
          ),
      },

      withdrawn_at: {
        type:
          "timestamptz",

        notNull:
          false,
      },
    },
  );

  /*
   * Guarantees that the owner recorded on the share
   * is the actual owner of the referenced TODO.
   */
  pgm.sql(`
    ALTER TABLE todo_shares
    ADD CONSTRAINT fk_todo_shares_todo_owner
    FOREIGN KEY (
      todo_id,
      owner_id
    )
    REFERENCES todos (
      id,
      owner_id
    )
    ON DELETE CASCADE
  `);

  /*
   * The owner cannot share a TODO with themselves.
   */
  pgm.addConstraint(
    "todo_shares",
    "chk_todo_shares_recipient_not_owner",
    {
      check:
        "recipient_id <> owner_id",
    },
  );

  /*
   * The current requirements allow shared users to
   * update only the TODO state.
   */
  pgm.addConstraint(
    "todo_shares",
    "chk_todo_shares_permission",
    {
      check:
        "permission = 'state-update'",
    },
  );

  /*
   * A withdrawal timestamp cannot precede the share
   * creation timestamp.
   */
  pgm.addConstraint(
    "todo_shares",
    "chk_todo_shares_withdrawn_after_shared",
    {
      check:
        "withdrawn_at IS NULL OR withdrawn_at >= shared_at",
    },
  );

  /*
   * Only one active share is permitted for the same
   * TODO and recipient.
   *
   * Withdrawn historical rows are excluded.
   */
  pgm.createIndex(
    "todo_shares",
    [
      "todo_id",
      "recipient_id",
    ],
    {
      name:
        "uq_todo_shares_active_todo_recipient",

      unique:
        true,

      where:
        "withdrawn_at IS NULL",
    },
  );

  /*
   * Supports:
   *
   * GET TODOs shared with the authenticated user.
   */
  pgm.createIndex(
    "todo_shares",
    [
      "recipient_id",
      "shared_at",
    ],
    {
      name:
        "idx_todo_shares_active_recipient",

      where:
        "withdrawn_at IS NULL",
    },
  );

  /*
   * Supports:
   *
   * - owner share listing;
   * - withdrawal authorization;
   * - ownership-scoped share lookup.
   */
  pgm.createIndex(
    "todo_shares",
    [
      "owner_id",
      "todo_id",
    ],
    {
      name:
        "idx_todo_shares_active_owner_todo",

      where:
        "withdrawn_at IS NULL",
    },
  );

  /*
   * Supports checking whether the current user has an
   * active share for one specific TODO.
   */
  pgm.createIndex(
    "todo_shares",
    [
      "todo_id",
      "recipient_id",
      "permission",
    ],
    {
      name:
        "idx_todo_shares_active_authorization",

      where:
        "withdrawn_at IS NULL",
    },
  );
};

exports.down = (pgm) => {
  /*
   * Drop the dependent sharing table first.
   */
  pgm.dropTable(
    "todo_shares",
    {
      ifExists:
        true,

      cascade:
        true,
    },
  );

  /*
   * This index was created only to support the
   * composite TODO ownership foreign key.
   */
  pgm.dropIndex(
    "todos",
    [
      "id",
      "owner_id",
    ],
    {
      name:
        "uq_todos_id_owner_id",

      ifExists:
        true,
    },
  );
};