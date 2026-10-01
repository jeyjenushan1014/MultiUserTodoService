exports.up = (pgm) => {
  pgm.createTable("account_deletion_tombstones", {
    user_id_hash: { type: "char(64)", primaryKey: true },
    deleted_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
  });
};

exports.down = (pgm) => {
  pgm.dropTable("account_deletion_tombstones");
};