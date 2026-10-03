exports.up = (pgm) => {
  pgm.sql(`
    DO $roles$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'account_routine_operator')
         OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'account_break_glass_operator')
         OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'account_operator_auditor') THEN
        RAISE EXCEPTION 'OP-8 account operator roles already exist; inspect them before migrating';
      END IF;

      CREATE ROLE account_routine_operator
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      CREATE ROLE account_break_glass_operator
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      CREATE ROLE account_operator_auditor
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END
    $roles$;

    CREATE TABLE public.operator_access_audit (
      audit_id uuid PRIMARY KEY,
      event_id uuid NOT NULL,
      phase text NOT NULL CHECK (phase IN ('opened', 'closed')),
      incident_id varchar(100) NOT NULL,
      operator_id varchar(100) NOT NULL,
      approver_id varchar(100) NOT NULL,
      target_database name NOT NULL,
      login_role name NOT NULL,
      statement_sha256 varchar(64) NOT NULL CHECK (statement_sha256 ~ '^[0-9a-f]{64}$'),
      recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      expires_at timestamptz,
      outcome text,
      CONSTRAINT operator_access_audit_distinct_approver
        CHECK (operator_id <> approver_id),
      CONSTRAINT operator_access_audit_phase_fields
        CHECK (
          (phase = 'opened' AND expires_at IS NOT NULL AND outcome IS NULL)
          OR
          (phase = 'closed' AND expires_at IS NULL AND outcome IN ('completed', 'aborted'))
        ),
      CONSTRAINT operator_access_audit_event_phase_unique UNIQUE (event_id, phase)
    );

    CREATE FUNCTION public.reject_operator_access_audit_mutation()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = pg_catalog, public
    AS $audit$
    BEGIN
      RAISE EXCEPTION 'operator access audit is append-only';
    END;
    $audit$;

    CREATE TRIGGER operator_access_audit_no_row_mutation
      BEFORE UPDATE OR DELETE ON public.operator_access_audit
      FOR EACH ROW EXECUTE FUNCTION public.reject_operator_access_audit_mutation();

    CREATE TRIGGER operator_access_audit_no_truncate
      BEFORE TRUNCATE ON public.operator_access_audit
      FOR EACH STATEMENT EXECUTE FUNCTION public.reject_operator_access_audit_mutation();

    CREATE FUNCTION public.begin_account_break_glass(
      p_audit_id uuid,
      p_incident_id text,
      p_operator_id text,
      p_approver_id text,
      p_statement_sha256 text,
      p_expires_at timestamptz
    )
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $audit$
    BEGIN
      IF p_incident_id IS NULL OR p_incident_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,99}$' THEN
        RAISE EXCEPTION 'incident id must be a 3-100 character reference';
      END IF;
      IF p_operator_id IS NULL OR length(btrim(p_operator_id)) NOT BETWEEN 1 AND 100
         OR p_approver_id IS NULL OR length(btrim(p_approver_id)) NOT BETWEEN 1 AND 100
         OR p_operator_id = p_approver_id THEN
        RAISE EXCEPTION 'operator and distinct approver identities are required';
      END IF;
      IF p_statement_sha256 IS NULL OR p_statement_sha256 !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'a lowercase SHA-256 statement digest is required';
      END IF;
      IF p_expires_at IS NULL OR p_expires_at <= clock_timestamp()
         OR p_expires_at > clock_timestamp() + interval '1 hour' THEN
        RAISE EXCEPTION 'approval expiry must be within the next hour';
      END IF;

      INSERT INTO public.operator_access_audit (
        audit_id, event_id, phase, incident_id, operator_id, approver_id,
        target_database, login_role, statement_sha256, expires_at
      ) VALUES (
        p_audit_id, p_audit_id, 'opened', p_incident_id, p_operator_id, p_approver_id,
        current_database(), session_user, p_statement_sha256, p_expires_at
      );
      RETURN p_audit_id;
    END;
    $audit$;

    CREATE FUNCTION public.close_account_break_glass(
      p_audit_id uuid,
      p_close_audit_id uuid,
      p_operator_id text,
      p_outcome text
    )
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $audit$
    DECLARE
      opening public.operator_access_audit%ROWTYPE;
    BEGIN
      SELECT * INTO opening
      FROM public.operator_access_audit
      WHERE audit_id = p_audit_id AND phase = 'opened';

      IF NOT FOUND OR opening.login_role <> session_user OR opening.operator_id <> p_operator_id THEN
        RAISE EXCEPTION 'matching open break-glass record and operator session are required';
      END IF;
      IF p_outcome NOT IN ('completed', 'aborted') THEN
        RAISE EXCEPTION 'outcome must be completed or aborted';
      END IF;

      INSERT INTO public.operator_access_audit (
        audit_id, event_id, phase, incident_id, operator_id, approver_id,
        target_database, login_role, statement_sha256, outcome
      ) VALUES (
        p_close_audit_id, opening.event_id, 'closed', opening.incident_id,
        opening.operator_id, opening.approver_id, opening.target_database,
        opening.login_role, opening.statement_sha256, p_outcome
      );
      RETURN p_close_audit_id;
    END;
    $audit$;

    REVOKE ALL ON TABLE public.operator_access_audit
      FROM PUBLIC, account_routine_operator, account_break_glass_operator, account_operator_auditor;
    GRANT SELECT ON TABLE public.operator_access_audit TO account_operator_auditor;

    REVOKE ALL ON FUNCTION public.reject_operator_access_audit_mutation() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.begin_account_break_glass(uuid, text, text, text, text, timestamptz) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.close_account_break_glass(uuid, uuid, text, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.begin_account_break_glass(uuid, text, text, text, text, timestamptz)
      TO account_break_glass_operator;
    GRANT EXECUTE ON FUNCTION public.close_account_break_glass(uuid, uuid, text, text)
      TO account_break_glass_operator;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP FUNCTION public.close_account_break_glass(uuid, uuid, text, text);
    DROP FUNCTION public.begin_account_break_glass(uuid, text, text, text, text, timestamptz);
    DROP TRIGGER operator_access_audit_no_truncate ON public.operator_access_audit;
    DROP TRIGGER operator_access_audit_no_row_mutation ON public.operator_access_audit;
    DROP FUNCTION public.reject_operator_access_audit_mutation();
    DROP TABLE public.operator_access_audit;
    DROP ROLE account_operator_auditor;
    DROP ROLE account_break_glass_operator;
    DROP ROLE account_routine_operator;
  `);
};
