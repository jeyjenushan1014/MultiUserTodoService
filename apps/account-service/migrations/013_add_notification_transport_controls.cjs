exports.up = (pgm) => {
  pgm.addColumn("notification_event_deliveries", {
    destination: { type: "text" },
  });
  pgm.addConstraint("notification_event_deliveries", "notification_delivery_destination_check", {
    check: "destination IS NULL OR destination IN ('sink', 'external')",
  });
  pgm.createTable("notification_mail_settings", {
    id: { type: "integer", primaryKey: true },
    mode: { type: "text", notNull: true, default: "sink" },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
  });
  pgm.addConstraint("notification_mail_settings", "notification_mail_settings_singleton_check", {
    check: "id = 1 AND mode IN ('sink', 'external')",
  });
  pgm.sql("INSERT INTO notification_mail_settings (id, mode) VALUES (1, 'sink')");

  pgm.createTable("notification_mail_mode_audit", {
    id: { type: "uuid", primaryKey: true },
    previous_mode: { type: "text", notNull: true },
    new_mode: { type: "text", notNull: true },
    changed_by: { type: "text", notNull: true },
    changed_at: { type: "timestamptz", notNull: true, default: pgm.func("CURRENT_TIMESTAMP") },
  });
  pgm.createIndex("notification_mail_mode_audit", "changed_at", {
    name: "notification_mail_mode_audit_retention_idx",
  });
};

exports.down = (pgm) => {
  pgm.dropTable("notification_mail_mode_audit");
  pgm.dropTable("notification_mail_settings");
  pgm.dropConstraint("notification_event_deliveries", "notification_delivery_destination_check");
  pgm.dropColumn("notification_event_deliveries", "destination");
};