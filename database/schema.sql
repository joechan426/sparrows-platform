CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_date DATE,
  location TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Divisions belong to a tournament (e.g. Mixed A, Mixed B).
-- The live schema uses Prisma (Division table, cuid ids); this documents the concept.
CREATE TABLE divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Pools belong to a division (e.g. Pool A, Pool B). Registrations can be assigned to a pool.
CREATE TABLE pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  division TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- stage: 'POOL' (pool matches, pool_id set) or 'KNOCKOUT' (division-level knockout, pool_id NULL).
-- seed_a/seed_b: for knockout matches, the seed number (1-based) of team A and team B.
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id),
  division_id UUID NOT NULL REFERENCES divisions(id),
  pool_id UUID REFERENCES pools(id), -- NULL for knockout matches
  stage TEXT NOT NULL, -- 'POOL' | 'KNOCKOUT'
  team_a_registration_id TEXT NOT NULL, -- references TournamentRegistration(id) in Prisma schema
  team_b_registration_id TEXT NOT NULL,
  duty_registration_id TEXT,
  seed_a INT, -- knockout: seed of team A (1-based)
  seed_b INT, -- knockout: seed of team B (1-based)
  scheduled_at TIMESTAMP,
  status TEXT NOT NULL,
  court_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE match_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  set_number INT NOT NULL,
  team_a_score INT NOT NULL,
  team_b_score INT NOT NULL
);

-- Members represent app/web users for event registration.
-- Only preferred_name and email are required profile fields for now.
-- Admin bulk delete removes related event_registrations first, then the member (application-level).
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preferred_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Calendar events represent imported or managed events (e.g. from Google Calendar).
-- source_type: e.g. 'GOOGLE', 'MANUAL'
-- sport_type: 'VOLLEYBALL' | 'PICKLEBALL' | 'TENNIS'
-- event_type: 'NORMAL' | 'SPECIAL'
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP NOT NULL,
  location TEXT,
  source_type TEXT NOT NULL,
  sport_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  registration_open BOOLEAN NOT NULL DEFAULT FALSE,
  capacity INT,
  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  price_cents INT,
  currency TEXT NOT NULL DEFAULT 'AUD',
  -- Named payout profile (Stripe Connect / PayPal REST app) for this paid event.
  payment_profile_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Event registrations link members to calendar events.
-- One member may register only once per event.
-- payment_status: NONE | AWAITING_PAYMENT | PAID | FAILED | WAIVED
-- payment_provider: STRIPE | PAYPAL | MANUAL
CREATE TABLE event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id),
  calendar_event_id UUID NOT NULL REFERENCES calendar_events(id),
  team_name TEXT,
  status TEXT NOT NULL,
  attendance TEXT NOT NULL DEFAULT 'DEFAULT',
  payment_status TEXT NOT NULL DEFAULT 'NONE',
  amount_due_cents INT,
  amount_paid_cents INT,
  payment_provider TEXT,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  paypal_order_id TEXT,
  paid_at TIMESTAMP,
  manager_payment_note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (member_id, calendar_event_id)
);

CREATE TABLE payment_platform_settings (
  id TEXT PRIMARY KEY,
  stripe_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  paypal_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  square_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE member_payment_methods (
  id TEXT PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT NOT NULL,
  brand TEXT,
  last4 TEXT,
  exp_month INT,
  exp_year INT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, stripe_payment_method_id)
);

-- Admin panel users (separate from members/app users).
-- Login uses user_name (plain text). role: 'ADMIN' | 'SUPER_MANAGER' | 'MANAGER'
CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  user_name TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SUPER_MANAGER', 'MANAGER', 'COACH')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- JSON array of Refine resource names this ADMIN hides from their own nav only (e.g. ["tournaments"]).
  hidden_nav_resources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Named merchant payout configuration (Super Manager / Admin managed).
CREATE TABLE payment_profiles (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  stripe_connected_account_id TEXT UNIQUE,
  stripe_connect_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  paypal_merchant_id TEXT,
  paypal_rest_client_id_enc TEXT,
  paypal_rest_client_secret_enc TEXT,
  created_by_admin_id TEXT REFERENCES admin_users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Page/module permissions for managers. ADMIN has all permissions implicitly.
-- module: 'TOURNAMENTS' | 'TEAMS' | 'CALENDAR_EVENTS' | 'MEMBERS' | 'ANNOUNCEMENTS'
CREATE TABLE admin_permissions (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('TOURNAMENTS', 'TEAMS', 'CALENDAR_EVENTS', 'MEMBERS', 'ANNOUNCEMENTS', 'PAYMENT_PROFILES', 'ADMIN_USERS', 'PAYMENTS')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (admin_user_id, module)
);

-- Manager/Admin announcements shown in sparrowsweb and sparrows-app profile.
CREATE TABLE announcements (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  message TEXT NOT NULL,
  created_by_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- If you already had admin_users before hidden_nav_resources existed, run once on Neon/Postgres:
-- ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS hidden_nav_resources JSONB NOT NULL DEFAULT '[]'::jsonb;