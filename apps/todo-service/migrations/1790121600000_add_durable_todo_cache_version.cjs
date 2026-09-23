exports.up = (pgm) => {
  pgm.addColumn(
    "todo_owners",
    {
      cache_version: {
        type: "bigint",
        notNull: true,
        default: 0,
      },
    },
  );

  pgm.addConstraint(
    "todo_owners",
    "chk_todo_owners_cache_version_non_negative",
    {
      check:
        "cache_version >= 0",
    },
  );

  pgm.sql(`
    CREATE OR REPLACE FUNCTION
      increment_todo_owner_cache_version()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      affected_owner_id uuid;
    BEGIN
      affected_owner_id :=
        COALESCE(
          NEW.owner_id,
          OLD.owner_id
        );

      UPDATE todo_owners
      SET cache_version =
        cache_version + 1
      WHERE id =
        affected_owner_id;

      RETURN COALESCE(
        NEW,
        OLD
      );
    END;
    $$;
  `);

  pgm.sql(`
    CREATE TRIGGER
      trg_todos_increment_owner_cache_version
    AFTER INSERT OR UPDATE OR DELETE
    ON todos
    FOR EACH ROW
    EXECUTE FUNCTION
      increment_todo_owner_cache_version();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS
      trg_todos_increment_owner_cache_version
    ON todos;
  `);

  pgm.sql(`
    DROP FUNCTION IF EXISTS
      increment_todo_owner_cache_version();
  `);

  pgm.dropConstraint(
    "todo_owners",
    "chk_todo_owners_cache_version_non_negative",
  );

  pgm.dropColumn(
    "todo_owners",
    "cache_version",
  );
};