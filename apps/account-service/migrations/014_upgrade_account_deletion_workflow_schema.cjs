exports.up = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM account_deletion_requests) THEN
        RAISE EXCEPTION 'Account deletion requests exist; migrate their workflow state before applying migration 014';
      END IF;
    END $$;

    ALTER TABLE account_deletion_requests
      DROP CONSTRAINT IF EXISTS account_deletion_status_check,
      DROP CONSTRAINT IF EXISTS account_deletion_requests_status_check;

    ALTER TABLE account_deletion_requests
      ALTER COLUMN identity_hash DROP NOT NULL,
      ALTER COLUMN notification_event_ids SET DEFAULT ARRAY[]::uuid[],
      ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
  `);

  pgm.addColumn("account_deletion_requests", {
    idempotency_key_hash: { type: "char(64)" },
    correlation_id: { type: "text" },
    current_step: { type: "text", notNull: true, default: "prepare-workspaces" },
    orphaned_workspace_ids: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    workspace_ids: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    session_ids: { type: "jsonb", notNull: true, default: pgm.func("'[]'::jsonb") },
    lease_owner: { type: "text" },
    lease_expires_at: { type: "timestamptz" },
    user_id_hash: { type: "char(64)" },
  });

  pgm.sql(`
    ALTER TABLE account_deletion_requests
      ADD CONSTRAINT account_deletion_requests_status_check
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'processing', 'retry', 'blocked'));
  `);
  pgm.addConstraint("account_deletion_requests", "account_deletion_requests_user_key_unique", {
    unique: ["user_id", "idempotency_key_hash"],
  });
  pgm.createIndex("account_deletion_requests", ["status", "next_attempt_at", "requested_at"], {
    name: "account_deletion_requests_status_requested_index",
  });
};

exports.down = (pgm) => {
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM account_deletion_requests) THEN
        RAISE EXCEPTION 'Cannot reverse migration 014 while account deletion requests exist';
      END IF;
    END $$;

    ALTER TABLE account_deletion_requests
      DROP CONSTRAINT IF EXISTS account_deletion_requests_status_check,
      DROP CONSTRAINT IF EXISTS account_deletion_requests_user_key_unique;

    ALTER TABLE account_deletion_requests
      ALTER COLUMN identity_hash SET NOT NULL,
      ALTER COLUMN notification_event_ids DROP DEFAULT,
      ALTER COLUMN updated_at DROP DEFAULT;
  `);
  pgm.dropIndex("account_deletion_requests", ["status", "next_attempt_at", "requested_at"], {
    name: "account_deletion_requests_status_requested_index",
  });
  pgm.dropColumns("account_deletion_requests", [
    "idempotency_key_hash",
    "correlation_id",
    "current_step",
    "orphaned_workspace_ids",
    "workspace_ids",
    "session_ids",
    "lease_owner",
    "lease_expires_at",
    "user_id_hash",
  ]);
  pgm.addConstraint("account_deletion_requests", "account_deletion_status_check", {
    check: "status IN ('pending', 'processing', 'retry', 'completed', 'blocked')",
  });
};