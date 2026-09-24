exports.up = (pgm) => {
  pgm.addColumns(
    "todo_owners",
    {
      email: {
        type:
          "varchar(320)",
      },
    },
  );
};

exports.down = (pgm) => {
  pgm.dropColumns(
    "todo_owners",
    [
      "email",
    ],
  );
};