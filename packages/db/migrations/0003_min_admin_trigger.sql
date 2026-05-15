CREATE OR REPLACE FUNCTION assert_min_one_admin() RETURNS trigger AS $$
DECLARE admin_count int;
BEGIN
  SELECT COUNT(*) INTO admin_count FROM users WHERE role = 'Admin';
  IF admin_count < 1 THEN
    RAISE EXCEPTION 'min-Admin invariant violated: chapter must have at least one Admin'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER trg_min_one_admin
  AFTER INSERT OR UPDATE OF role OR DELETE ON users
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_min_one_admin();
