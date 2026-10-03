exports.up = (pgm) => {
  pgm.addColumn("chain_submissions", {
    transaction_request: { type: "jsonb" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("chain_submissions", "transaction_request");
};
