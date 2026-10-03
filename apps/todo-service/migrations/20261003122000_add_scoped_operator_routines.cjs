exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION public.begin_todo_break_glass(
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
         OR p_operator_id <> session_user
         OR p_approver_id IS NULL OR length(btrim(p_approver_id)) NOT BETWEEN 1 AND 100
         OR p_operator_id = p_approver_id THEN
        RAISE EXCEPTION 'authenticated login identity and a distinct approver are required';
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

    CREATE FUNCTION public.operator_chain_projection_progress()
    RETURNS TABLE(chain_id bigint, last_scanned_block bigint, updated_at timestamptz)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $operator$
      SELECT checkpoint.chain_id, checkpoint.last_scanned_block, checkpoint.updated_at
      FROM public.chain_projection_checkpoints AS checkpoint
      ORDER BY checkpoint.updated_at DESC, checkpoint.chain_id
      LIMIT 50
    $operator$;

    CREATE FUNCTION public.operator_access_audit_recent(p_limit integer DEFAULT 20)
    RETURNS TABLE(
      incident_id varchar(100),
      phase text,
      operator_id varchar(100),
      approver_id varchar(100),
      target_database name,
      recorded_at timestamptz,
      expires_at timestamptz,
      outcome text
    )
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    AS $operator$
    BEGIN
      IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION 'audit limit must be between 1 and 50';
      END IF;

      RETURN QUERY
        SELECT audit.incident_id, audit.phase, audit.operator_id, audit.approver_id,
               audit.target_database, audit.recorded_at, audit.expires_at, audit.outcome
        FROM public.operator_access_audit AS audit
        ORDER BY audit.recorded_at DESC, audit.audit_id DESC
        LIMIT p_limit;
    END;
    $operator$;

    REVOKE ALL ON TABLE public.operator_access_audit
      FROM todo_operator_auditor;
    REVOKE ALL ON FUNCTION public.operator_chain_projection_progress() FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.operator_access_audit_recent(integer) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.operator_chain_projection_progress() TO todo_routine_operator;
    GRANT EXECUTE ON FUNCTION public.operator_access_audit_recent(integer)
      TO todo_routine_operator, todo_operator_auditor;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION public.begin_todo_break_glass(
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

    DROP FUNCTION public.operator_access_audit_recent(integer);
    DROP FUNCTION public.operator_chain_projection_progress();
    GRANT SELECT ON TABLE public.operator_access_audit TO todo_operator_auditor;
  `);
};
