exports.up = (pgm) => {
  pgm.createTable("notification_address_reservations", {
    event_id: { type: "uuid", notNull: true },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    email: { type: "varchar(254)", notNull: true },
    reserved_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("CURRENT_TIMESTAMP"),
    },
  });
  pgm.addConstraint("notification_address_reservations", "notification_address_reservations_event_email_key", {
    primaryKey: ["event_id", "email"],
  });
  pgm.createIndex("notification_address_reservations", ["email", "reserved_at"], {
    name: "notification_address_reservations_window_idx",
  });
  pgm.createIndex("notification_address_reservations", "user_id", {
    name: "notification_address_reservations_user_idx",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("notification_address_reservations");
};