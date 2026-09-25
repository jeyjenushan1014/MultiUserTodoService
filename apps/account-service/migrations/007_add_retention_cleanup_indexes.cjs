exports.up = (pgm) => {
  pgm.createIndex(
    "sessions",
    "expires_at",
    {
      name: "idx_sessions_cleanup_expiry",
    },
  );

  pgm.createIndex(
    "sessions",
    "revoked_at",
    {
      name: "idx_sessions_cleanup_revoked",
      where: "revoked_at IS NOT NULL",
    },
  );

  pgm.createIndex(
    "refresh_tokens",
    "expires_at",
    {
      name: "idx_refresh_tokens_cleanup_expiry",
    },
  );

  pgm.createIndex(
    "refresh_tokens",
    "used_at",
    {
      name: "idx_refresh_tokens_cleanup_used",
      where: "used_at IS NOT NULL",
    },
  );

  pgm.createIndex(
    "password_reset_tokens",
    "used_at",
    {
      name: "idx_password_reset_tokens_cleanup_used",
      where: "used_at IS NOT NULL",
    },
  );

  pgm.createIndex(
    "outbox_events",
    "published_at",
    {
      name: "idx_account_outbox_cleanup_published",
      where: "published_at IS NOT NULL",
    },
  );
};

exports.down = (pgm) => {
  pgm.dropIndex("outbox_events", "published_at", {
    name: "idx_account_outbox_cleanup_published",
    ifExists: true,
  });
  pgm.dropIndex("password_reset_tokens", "used_at", {
    name: "idx_password_reset_tokens_cleanup_used",
    ifExists: true,
  });
  pgm.dropIndex("refresh_tokens", "used_at", {
    name: "idx_refresh_tokens_cleanup_used",
    ifExists: true,
  });
  pgm.dropIndex("refresh_tokens", "expires_at", {
    name: "idx_refresh_tokens_cleanup_expiry",
    ifExists: true,
  });
  pgm.dropIndex("sessions", "revoked_at", {
    name: "idx_sessions_cleanup_revoked",
    ifExists: true,
  });
  pgm.dropIndex("sessions", "expires_at", {
    name: "idx_sessions_cleanup_expiry",
    ifExists: true,
  });
};