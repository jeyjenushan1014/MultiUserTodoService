exports.up = (pgm) => {
  pgm.createTable("chain_writer_nonces", {
    chain_id: {
      type: "bigint",
      notNull: true,
    },
    writer_address: {
      type: "varchar(42)",
      notNull: true,
    },
    next_nonce: {
      type: "bigint",
      notNull: true,
      default: 0,
    },
    updated_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("CURRENT_TIMESTAMP"),
    },
  });

  pgm.addConstraint(
    "chain_writer_nonces",
    "chain_writer_nonces_pkey",
    {
      primaryKey: ["chain_id", "writer_address"],
    },
  );
};

exports.down = (pgm) => {
  pgm.dropTable("chain_writer_nonces");
};
