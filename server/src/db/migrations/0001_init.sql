-- 0001_init: initial schema. Source of truth: docs/DATABASE_SCHEMA.md §5.

CREATE TABLE users (
  id                INTEGER PRIMARY KEY,
  email             TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  name              TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  email_verified_at TEXT,
  status            TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  deleted_at        TEXT
) STRICT;
CREATE INDEX ix_users_search ON users (name COLLATE NOCASE)
  WHERE status = 'active' AND email_verified_at IS NOT NULL;

CREATE TABLE login_methods (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type             TEXT    NOT NULL CHECK (type IN ('password','google')),
  password_hash    TEXT,
  provider_subject TEXT,
  created_at       TEXT    NOT NULL,
  CHECK (type <> 'password' OR password_hash IS NOT NULL),
  CHECK (type <> 'google'   OR provider_subject IS NOT NULL),
  UNIQUE (user_id, type)
) STRICT;
CREATE UNIQUE INDEX ux_login_google_subject ON login_methods (provider_subject)
  WHERE type = 'google';

CREATE TABLE email_verification_tokens (
  id                    INTEGER PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash            TEXT    NOT NULL UNIQUE,
  purpose               TEXT    NOT NULL CHECK (purpose IN ('verify_email','link_password')),
  pending_password_hash TEXT,
  expires_at            TEXT    NOT NULL,
  used_at               TEXT,
  created_at            TEXT    NOT NULL,
  CHECK (purpose <> 'link_password' OR pending_password_hash IS NOT NULL)
) STRICT;
CREATE INDEX ix_evt_user ON email_verification_tokens (user_id);

CREATE TABLE sessions (
  id           TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent   TEXT,
  created_at   TEXT    NOT NULL,
  last_seen_at TEXT    NOT NULL,
  expires_at   TEXT    NOT NULL
) STRICT;
CREATE INDEX ix_sessions_user ON sessions (user_id);

CREATE TABLE groups (
  id                 INTEGER PRIMARY KEY,
  name               TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  description        TEXT    CHECK (description IS NULL OR length(description) <= 200),
  created_by_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL
) STRICT;

CREATE TABLE memberships (
  id                     INTEGER PRIMARY KEY,
  group_id               INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id                INTEGER NOT NULL REFERENCES users(id),
  role                   TEXT    NOT NULL CHECK (role IN ('admin','member')),
  status                 TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','left','removed')),
  joined_at              TEXT    NOT NULL,
  ended_at               TEXT,
  ended_by_membership_id INTEGER REFERENCES memberships(id),
  CHECK ((status = 'active') = (ended_at IS NULL))
) STRICT;
CREATE UNIQUE INDEX ux_membership_active_user  ON memberships (group_id, user_id) WHERE status = 'active';
CREATE UNIQUE INDEX ux_membership_active_admin ON memberships (group_id)          WHERE status = 'active' AND role = 'admin';
CREATE INDEX ix_membership_user ON memberships (user_id, status);

CREATE TABLE expenses (
  id                       INTEGER PRIMARY KEY,
  group_id                 INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  payer_membership_id      INTEGER NOT NULL REFERENCES memberships(id),
  created_by_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  description              TEXT    NOT NULL CHECK (length(description) BETWEEN 1 AND 100),
  notes                    TEXT    CHECK (notes IS NULL OR length(notes) <= 500),
  amount_paise             INTEGER NOT NULL CHECK (amount_paise > 0),
  expense_date             TEXT    NOT NULL CHECK (expense_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  split_method             TEXT    NOT NULL CHECK (split_method IN ('equal','exact','percentage')),
  status                   TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  created_at               TEXT    NOT NULL,
  updated_at               TEXT    NOT NULL,
  updated_by_membership_id INTEGER REFERENCES memberships(id),
  deleted_at               TEXT,
  deleted_by_membership_id INTEGER REFERENCES memberships(id),
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
) STRICT;
CREATE INDEX ix_expenses_group_date ON expenses (group_id, status, expense_date DESC, id DESC);
CREATE INDEX ix_expenses_payer      ON expenses (payer_membership_id, status, expense_date);

CREATE TABLE expense_shares (
  id            INTEGER PRIMARY KEY,
  expense_id    INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  membership_id INTEGER NOT NULL REFERENCES memberships(id),
  share_paise   INTEGER NOT NULL CHECK (share_paise > 0),
  input_paise   INTEGER CHECK (input_paise IS NULL OR input_paise > 0),
  input_bp      INTEGER CHECK (input_bp IS NULL OR input_bp BETWEEN 1 AND 10000),
  position      INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (expense_id, membership_id),
  UNIQUE (expense_id, position)
) STRICT;
CREATE INDEX ix_shares_membership ON expense_shares (membership_id);

CREATE TABLE settlements (
  id                        INTEGER PRIMARY KEY,
  group_id                  INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_membership_id        INTEGER NOT NULL REFERENCES memberships(id),
  to_membership_id          INTEGER NOT NULL REFERENCES memberships(id),
  amount_paise              INTEGER NOT NULL CHECK (amount_paise > 0),
  settlement_date           TEXT    NOT NULL CHECK (settlement_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  note                      TEXT    CHECK (note IS NULL OR length(note) <= 200),
  recorded_by_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  status                    TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  created_at                TEXT    NOT NULL,
  updated_at                TEXT    NOT NULL,
  updated_by_membership_id  INTEGER REFERENCES memberships(id),
  deleted_at                TEXT,
  deleted_by_membership_id  INTEGER REFERENCES memberships(id),
  CHECK (from_membership_id <> to_membership_id),
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
) STRICT;
CREATE INDEX ix_settlements_group_date ON settlements (group_id, status, settlement_date DESC, id DESC);
CREATE INDEX ix_settlements_from       ON settlements (from_membership_id, status);
CREATE INDEX ix_settlements_to         ON settlements (to_membership_id, status);

CREATE TABLE change_records (
  id                  INTEGER PRIMARY KEY,
  group_id            INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  entity_type         TEXT    NOT NULL CHECK (entity_type IN ('expense','settlement')),
  entity_id           INTEGER NOT NULL,
  action              TEXT    NOT NULL CHECK (action IN ('created','updated','deleted')),
  actor_membership_id INTEGER NOT NULL REFERENCES memberships(id),
  before_json         TEXT    CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json          TEXT    CHECK (after_json  IS NULL OR json_valid(after_json)),
  created_at          TEXT    NOT NULL
) STRICT;
CREATE INDEX ix_change_entity ON change_records (entity_type, entity_id, id);

CREATE TABLE activity_events (
  id                  INTEGER PRIMARY KEY,
  group_id            INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  actor_membership_id INTEGER REFERENCES memberships(id),
  type                TEXT    NOT NULL CHECK (type IN (
                        'group_created','group_updated','member_added','member_removed','member_left',
                        'admin_transferred','expense_created','expense_updated','expense_deleted',
                        'settlement_created','settlement_updated','settlement_deleted')),
  subject_type        TEXT    CHECK (subject_type IN ('expense','settlement','membership','group')),
  subject_id          INTEGER,
  summary             TEXT    NOT NULL,
  created_at          TEXT    NOT NULL
) STRICT;
CREATE INDEX ix_activity_group ON activity_events (group_id, id DESC);

CREATE TABLE notifications (
  id                INTEGER PRIMARY KEY,
  recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  group_id          INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  group_name        TEXT    NOT NULL,
  type              TEXT    NOT NULL CHECK (type IN (
                      'added_to_group','removed_from_group','admin_transferred','group_deleted',
                      'expense_created','expense_updated','expense_deleted',
                      'settlement_created','settlement_updated','settlement_deleted')),
  entity_type       TEXT    CHECK (entity_type IN ('expense','settlement','group')),
  entity_id         INTEGER,
  message           TEXT    NOT NULL,
  read_at           TEXT,
  created_at        TEXT    NOT NULL
) STRICT;
CREATE INDEX ix_notif_recipient ON notifications (recipient_user_id, id DESC);
CREATE INDEX ix_notif_unread    ON notifications (recipient_user_id) WHERE read_at IS NULL;
