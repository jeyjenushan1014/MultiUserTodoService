exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE todo_shares
    DROP CONSTRAINT fk_todo_shares_todo_owner;

    ALTER TABLE todo_shares
    ADD CONSTRAINT fk_todo_shares_todo_owner
    FOREIGN KEY (todo_id, owner_id)
    REFERENCES todos (id, owner_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE todo_shares
    DROP CONSTRAINT fk_todo_shares_todo_owner;

    ALTER TABLE todo_shares
    ADD CONSTRAINT fk_todo_shares_todo_owner
    FOREIGN KEY (todo_id, owner_id)
    REFERENCES todos (id, owner_id)
    ON DELETE CASCADE;
  `);
};