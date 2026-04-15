-- ============================================================
-- REUNION SITE — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ============================================================


-- ---- ATTENDEES TABLE ----
CREATE TABLE IF NOT EXISTS attendees (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Identity
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  preferred_name   TEXT,

  -- Contact
  email            TEXT NOT NULL,
  phone            TEXT,

  -- Event-specific
  graduation_year  SMALLINT,
  current_city     TEXT,
  current_state    TEXT,
  guest_count      SMALLINT NOT NULL DEFAULT 0,
  attending_status TEXT NOT NULL CHECK (attending_status IN ('yes', 'no', 'maybe')),
  comments         TEXT,

  -- Consent & communication
  email_opt_in      BOOLEAN NOT NULL DEFAULT TRUE,
  sms_opt_in        BOOLEAN NOT NULL DEFAULT FALSE,
  consent_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  signup_source     TEXT DEFAULT 'direct',  -- e.g. 'facebook', 'direct', 'manual_entry'

  -- Constraints
  CONSTRAINT attendees_email_unique UNIQUE (email),
  CONSTRAINT graduation_year_range CHECK (graduation_year BETWEEN 1950 AND 2030),
  CONSTRAINT guest_count_positive CHECK (guest_count >= 0 AND guest_count <= 10)
);

-- Indexes for common admin queries
CREATE INDEX idx_attendees_attending_status ON attendees (attending_status);
CREATE INDEX idx_attendees_graduation_year  ON attendees (graduation_year);
CREATE INDEX idx_attendees_email_opt_in     ON attendees (email_opt_in);
CREATE INDEX idx_attendees_sms_opt_in       ON attendees (sms_opt_in);
CREATE INDEX idx_attendees_created_at       ON attendees (created_at DESC);


-- ---- COMMUNICATION LOGS TABLE ----
CREATE TABLE IF NOT EXISTS communication_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  type             TEXT NOT NULL CHECK (type IN ('email', 'sms')),
  subject          TEXT,
  body             TEXT,
  recipient_count  INT NOT NULL DEFAULT 0,
  sent_by          TEXT,   -- admin user email
  notes            TEXT
);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Public users can INSERT (submit RSVP) but NOT read other rows.
-- Admin users (authenticated via Supabase Auth) can do everything.
-- The public can SELECT only aggregate stats (via a secure function).

ALTER TABLE attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert a new attendee (RSVP submission)
CREATE POLICY "public_can_insert_attendees"
  ON attendees FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow authenticated admin users full access
CREATE POLICY "admin_full_access_attendees"
  ON attendees FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Communication logs: admins only
CREATE POLICY "admin_full_access_comms"
  ON communication_logs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- PUBLIC STATS FUNCTION
-- Returns aggregate counts only — no PII exposed to public
-- ============================================================
CREATE OR REPLACE FUNCTION get_public_stats()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSON;
BEGIN
  SELECT json_build_object(
    'total',  COUNT(*),
    'yes',    COUNT(*) FILTER (WHERE attending_status = 'yes'),
    'maybe',  COUNT(*) FILTER (WHERE attending_status = 'maybe'),
    'no',     COUNT(*) FILTER (WHERE attending_status = 'no')
  ) INTO result FROM attendees;
  RETURN result;
END;
$$;

-- Allow anonymous users to call this function
GRANT EXECUTE ON FUNCTION get_public_stats() TO anon;


-- ============================================================
-- DUPLICATE EMAIL CHECK (optional stored procedure)
-- Called before insert to give a friendlier error
-- ============================================================
CREATE OR REPLACE FUNCTION check_email_exists(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM attendees WHERE email = lower(trim(check_email)));
END;
$$;

GRANT EXECUTE ON FUNCTION check_email_exists(TEXT) TO anon;


-- ============================================================
-- ADMIN USER SETUP
-- In Supabase Dashboard → Authentication → Users
-- Click "Invite user" and add the organizer's email.
-- They'll receive a magic link to set their password.
-- No additional admin_users table needed at this scale.
-- ============================================================


-- ============================================================
-- SAMPLE DATA (for testing — delete before going live)
-- ============================================================
/*
INSERT INTO attendees
  (first_name, last_name, email, phone, graduation_year, current_city, current_state, guest_count, attending_status, email_opt_in, sms_opt_in, signup_source)
VALUES
  ('Sarah',  'Mitchell', 'sarah@example.com', '(555) 111-2222', 2005, 'Chicago',    'IL', 1, 'yes',   true, false, 'facebook'),
  ('Marcus', 'Hayes',    'marcus@example.com', null,            2005, 'Austin',     'TX', 0, 'yes',   true, true,  'direct'),
  ('Priya',  'Sharma',   'priya@example.com',  null,            2005, 'New York',   'NY', 2, 'maybe', true, false, 'facebook'),
  ('James',  'Torres',   'james@example.com',  '(555) 999-0000',2004, 'Springfield','IL', 0, 'no',    true, false, 'direct'),
  ('Nia',    'Johnson',  'nia@example.com',    null,            2005, 'Atlanta',    'GA', 1, 'yes',   true, true,  'facebook');
*/
