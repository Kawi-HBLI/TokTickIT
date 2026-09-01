-- Forward correction for databases that already applied the Lab 2 foundation.
-- Preserve existing ticket numbers and sequence state; only future formatting changes.
-- Rollback policy: deploy another corrective function migration if needed.
-- Do not restore the truncating formatter or reset the sequence.
CREATE OR REPLACE FUNCTION next_ticket_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  sequence_text TEXT := nextval('"ticket_number_seq"')::TEXT;
BEGIN
  RETURN 'TKT-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
    lpad(sequence_text, GREATEST(5, length(sequence_text)), '0');
END;
$$;
