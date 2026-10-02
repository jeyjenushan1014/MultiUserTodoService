exports.up = (pgm) => {
  pgm.addColumn("notification_event_deliveries", {
    recipient_identity_hash: { type: "varchar" },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn("notification_event_deliveries", "recipient_identity_hash");
};