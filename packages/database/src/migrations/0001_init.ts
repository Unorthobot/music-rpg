/**
 * Initial schema.
 *
 * Migrations are plain SQL embedded in TypeScript so the exact same statements
 * run against embedded PGlite (local dev, unit/integration/E2E tests) and
 * hosted Postgres, with no bundler or file-system assumptions.
 *
 * Rules for future migrations: append a new file, never edit a shipped one.
 */
export const migration0001Init = {
  id: "0001_init",
  sql: /* sql */ `
CREATE TABLE IF NOT EXISTS users (
  id                 text PRIMARY KEY,
  email              text NOT NULL,
  username           text NOT NULL,
  display_name       text NOT NULL,
  avatar_url         text,
  password_hash      text,
  account_status     text NOT NULL DEFAULT 'ACTIVE',
  onboarding_state   text NOT NULL DEFAULT 'NOT_STARTED',
  subscription_tier  text NOT NULL DEFAULT 'FREE',
  locale             text NOT NULL DEFAULT 'en-ZA',
  timezone           text NOT NULL DEFAULT 'Africa/Johannesburg',
  is_internal        boolean NOT NULL DEFAULT false,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (username);

CREATE TABLE IF NOT EXISTS sessions (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  user_agent  text,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS worlds (
  id                text PRIMARY KEY,
  name              text NOT NULL,
  slug              text NOT NULL,
  status            text NOT NULL DEFAULT 'ACTIVE',
  current_game_time timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS worlds_slug_key ON worlds (slug);

CREATE TABLE IF NOT EXISTS scenes (
  id          text PRIMARY KEY,
  world_id    text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS scenes_world_slug_key ON scenes (world_id, slug);
CREATE INDEX IF NOT EXISTS scenes_world_id_idx ON scenes (world_id);

CREATE TABLE IF NOT EXISTS careers (
  id                      text PRIMARY KEY,
  user_id                 text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  world_id                text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  status                  text NOT NULL DEFAULT 'ONBOARDING',
  career_act              text NOT NULL DEFAULT 'UNDERGROUND'
                          CHECK (career_act IN ('UNDERGROUND','COME_UP','INDUSTRY','LEGACY')),
  career_type             text CHECK (career_type IN ('SOLO','GROUP')),
  controlled_entity_type  text CHECK (controlled_entity_type IN ('ARTIST','GROUP')),
  controlled_entity_id    text,
  onboarding_state        text NOT NULL DEFAULT 'CAREER_TYPE',
  started_at              timestamptz NOT NULL DEFAULT now(),
  current_game_date       timestamptz NOT NULL,
  fame                    integer NOT NULL DEFAULT 0,
  respect                 integer NOT NULL DEFAULT 0,
  heat                    integer NOT NULL DEFAULT 0,
  legacy                  integer NOT NULL DEFAULT 0,
  money_balance           bigint NOT NULL DEFAULT 0,
  primary_scene_id        text REFERENCES scenes(id) ON DELETE SET NULL,
  onboarding_completed_at timestamptz,
  last_active_at          timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS careers_user_world_key ON careers (user_id, world_id);
CREATE INDEX IF NOT EXISTS careers_user_id_idx ON careers (user_id);
CREATE INDEX IF NOT EXISTS careers_world_id_idx ON careers (world_id);

CREATE TABLE IF NOT EXISTS artists (
  id                  text PRIMARY KEY,
  world_id            text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  stage_name          text NOT NULL,
  slug                text NOT NULL,
  origin              text,
  biography           text,
  artist_type         text NOT NULL DEFAULT 'PLAYER'
                      CHECK (artist_type IN ('PLAYER','CORE_NPC','WORLD_NPC','PROCEDURAL')),
  status              text NOT NULL DEFAULT 'ACTIVE',
  archetype           text,
  creative_philosophy text,
  visual_identity     jsonb,
  current_group_id    text,
  preferred_role      text,
  fame                integer NOT NULL DEFAULT 0,
  respect             integer NOT NULL DEFAULT 0,
  heat                integer NOT NULL DEFAULT 0,
  legacy              integer NOT NULL DEFAULT 0,
  is_public           boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS artists_world_slug_key ON artists (world_id, slug);
CREATE INDEX IF NOT EXISTS artists_world_id_idx ON artists (world_id);
CREATE INDEX IF NOT EXISTS artists_current_group_id_idx ON artists (current_group_id);
CREATE INDEX IF NOT EXISTS artists_artist_type_idx ON artists (artist_type);

CREATE TABLE IF NOT EXISTS artist_skills (
  artist_id       text PRIMARY KEY REFERENCES artists(id) ON DELETE CASCADE,
  lyricism        integer NOT NULL DEFAULT 0,
  flow            integer NOT NULL DEFAULT 0,
  melody          integer NOT NULL DEFAULT 0,
  storytelling    integer NOT NULL DEFAULT 0,
  performance     integer NOT NULL DEFAULT 0,
  production      integer NOT NULL DEFAULT 0,
  experimentation integer NOT NULL DEFAULT 0,
  versatility     integer NOT NULL DEFAULT 0,
  battle_iq       integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artist_psychology (
  artist_id       text PRIMARY KEY REFERENCES artists(id) ON DELETE CASCADE,
  confidence      integer NOT NULL DEFAULT 50,
  discipline      integer NOT NULL DEFAULT 50,
  ambition        integer NOT NULL DEFAULT 50,
  resilience      integer NOT NULL DEFAULT 50,
  ego             integer NOT NULL DEFAULT 50,
  patience        integer NOT NULL DEFAULT 50,
  adaptability    integer NOT NULL DEFAULT 50,
  risk_tolerance  integer NOT NULL DEFAULT 50,
  competitiveness integer NOT NULL DEFAULT 50,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trait_definitions (
  key         text PRIMARY KEY,
  name        text NOT NULL,
  description text NOT NULL,
  category    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artist_traits (
  id          text PRIMARY KEY,
  artist_id   text NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  trait_key   text NOT NULL,
  source      text NOT NULL DEFAULT 'DISCOVERY',
  strength    integer NOT NULL DEFAULT 50,
  acquired_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS artist_traits_artist_trait_key ON artist_traits (artist_id, trait_key);
CREATE INDEX IF NOT EXISTS artist_traits_artist_id_idx ON artist_traits (artist_id);

CREATE TABLE IF NOT EXISTS archetype_definitions (
  key             text PRIMARY KEY,
  name            text NOT NULL,
  tagline         text NOT NULL,
  description     text NOT NULL,
  sound_bias      jsonb NOT NULL,
  skill_bias      jsonb NOT NULL,
  psychology_bias jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS sound_profiles (
  id                      text PRIMARY KEY,
  owner_type              text NOT NULL CHECK (owner_type IN ('ARTIST','GROUP')),
  owner_id                text NOT NULL,
  dark_bright             real NOT NULL DEFAULT 0,
  raw_polished            real NOT NULL DEFAULT 0,
  minimal_dense           real NOT NULL DEFAULT 0,
  organic_electronic      real NOT NULL DEFAULT 0,
  classic_futuristic      real NOT NULL DEFAULT 0,
  accessible_experimental real NOT NULL DEFAULT 0,
  melodic_rhythmic        real NOT NULL DEFAULT 0,
  intimate_anthemic       real NOT NULL DEFAULT 0,
  summary                 text,
  derived_from            jsonb,
  version                 integer NOT NULL DEFAULT 1,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sound_profiles_owner_key ON sound_profiles (owner_type, owner_id);

CREATE TABLE IF NOT EXISTS groups (
  id                 text PRIMARY KEY,
  world_id           text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name               text NOT NULL,
  slug               text NOT NULL,
  biography           text,
  creative_direction  text,
  creative_philosophy text,
  archetype           text,
  status             text NOT NULL DEFAULT 'FORMING',
  fame               integer NOT NULL DEFAULT 0,
  respect            integer NOT NULL DEFAULT 0,
  heat               integer NOT NULL DEFAULT 0,
  legacy             integer NOT NULL DEFAULT 0,
  money_balance      bigint NOT NULL DEFAULT 0,
  chemistry          integer NOT NULL DEFAULT 50,
  is_public          boolean NOT NULL DEFAULT false,
  founded_at         timestamptz NOT NULL DEFAULT now(),
  dissolved_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS groups_world_slug_key ON groups (world_id, slug);
CREATE INDEX IF NOT EXISTS groups_world_id_idx ON groups (world_id);

CREATE TABLE IF NOT EXISTS group_memberships (
  id            text PRIMARY KEY,
  group_id      text NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  artist_id     text NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  role          text NOT NULL DEFAULT 'MULTI_ROLE'
                CHECK (role IN ('LEAD_MC','MC','SINGER','PRODUCER','DJ','MULTI_ROLE')),
  influence     integer NOT NULL DEFAULT 50,
  satisfaction  integer NOT NULL DEFAULT 50,
  commitment    integer NOT NULL DEFAULT 50,
  solo_ambition integer NOT NULL DEFAULT 50,
  is_founder    boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'ACTIVE',
  joined_at     timestamptz NOT NULL DEFAULT now(),
  left_at       timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS group_memberships_group_artist_key ON group_memberships (group_id, artist_id);
CREATE INDEX IF NOT EXISTS group_memberships_group_id_idx ON group_memberships (group_id);
CREATE INDEX IF NOT EXISTS group_memberships_artist_id_idx ON group_memberships (artist_id);

CREATE TABLE IF NOT EXISTS sound_discovery_questions (
  id          text PRIMARY KEY,
  version     integer NOT NULL DEFAULT 1,
  order_index integer NOT NULL,
  prompt      text NOT NULL,
  help_text   text,
  kind        text NOT NULL DEFAULT 'CHOICE' CHECK (kind IN ('CHOICE','FREE_TEXT')),
  applies_to  text NOT NULL DEFAULT 'BOTH' CHECK (applies_to IN ('SOLO','GROUP','BOTH')),
  options     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sound_discovery_questions_order_idx ON sound_discovery_questions (version, order_index);

CREATE TABLE IF NOT EXISTS sound_discovery_sessions (
  id           text PRIMARY KEY,
  career_id    text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('ARTIST','GROUP')),
  version      integer NOT NULL DEFAULT 1,
  status       text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS','COMPLETED')),
  responses    jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sound_discovery_sessions_career_key ON sound_discovery_sessions (career_id);

CREATE TABLE IF NOT EXISTS game_events (
  id              text PRIMARY KEY,
  sequence        bigserial NOT NULL,
  world_id        text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  career_id       text REFERENCES careers(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  actor_type      text NOT NULL,
  actor_id        text,
  target_type     text,
  target_id       text,
  visibility      text NOT NULL DEFAULT 'PRIVATE'
                  CHECK (visibility IN ('PRIVATE','CREW','INDUSTRY','LOCAL_PUBLIC','GLOBAL_PUBLIC')),
  importance      integer NOT NULL DEFAULT 10,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS game_events_idempotency_key ON game_events (idempotency_key);
CREATE INDEX IF NOT EXISTS game_events_world_id_idx ON game_events (world_id);
CREATE INDEX IF NOT EXISTS game_events_career_id_idx ON game_events (career_id);
CREATE INDEX IF NOT EXISTS game_events_event_type_idx ON game_events (event_type);
CREATE INDEX IF NOT EXISTS game_events_occurred_at_idx ON game_events (occurred_at);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id            text PRIMARY KEY,
  world_id      text REFERENCES worlds(id) ON DELETE CASCADE,
  career_id     text REFERENCES careers(id) ON DELETE CASCADE,
  job_type      text NOT NULL,
  status        text NOT NULL DEFAULT 'QUEUED',
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  result        jsonb,
  error         text,
  attempts      integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS generation_jobs_status_idx ON generation_jobs (status);
CREATE INDEX IF NOT EXISTS generation_jobs_career_id_idx ON generation_jobs (career_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  career_id  text REFERENCES careers(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);

CREATE TABLE IF NOT EXISTS analytics_events (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  user_id      text,
  career_id    text,
  anonymous_id text,
  properties   jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_name_idx ON analytics_events (name);
CREATE INDEX IF NOT EXISTS analytics_events_user_id_idx ON analytics_events (user_id);
`,
};
