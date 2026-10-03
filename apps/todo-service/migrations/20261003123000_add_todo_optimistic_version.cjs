exports.up = (pgm) => {
  pgm.addColumn(
    "todos",
    {
      version: {
        type: "integer",
        notNull: true,
        default: 1,
      },
    },
  );

  pgm.addConstraint(
    "todos",
    "chk_todos_version_positive",
    {
      check: "version >= 1",
    },
  );

  pgm.sql(`
    CREATE FUNCTION increment_todo_version()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.version := OLD.version + 1;
      RETURN NEW;
    END;
    $$;

    CREATE TRIGGER trg_todos_increment_version
    BEFORE UPDATE ON todos
    FOR EACH ROW
    EXECUTE FUNCTION increment_todo_version();

    UPDATE todo_owners
    SET cache_version = cache_version + 1;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_todos_increment_version
      ON todos;
    DROP FUNCTION IF EXISTS increment_todo_version();
  `);

  pgm.dropConstraint(
    "todos",
    "chk_todos_version_positive",
  );

  pgm.dropColumn(
    "todos",
    "version",
  );
};
