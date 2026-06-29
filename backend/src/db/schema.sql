-- ============================================================================
-- Disha — Multilingual CAP Guidance Web App — SQLite schema (better-sqlite3)
-- Engine pragmas are set at connection open in app code (see connection.ts):
--   PRAGMA journal_mode = WAL;        -- concurrent readers during peak season
--   PRAGMA foreign_keys = ON;         -- enforce FK constraints
--   PRAGMA busy_timeout = 5000;       -- avoid SQLITE_BUSY under load
--   PRAGMA synchronous = NORMAL;      -- safe + fast with WAL
-- Conventions:
--   - All ids are TEXT (ULID generated in app).
--   - All timestamps are INTEGER unix-epoch MILLISECONDS (UTC).
--   - All booleans are INTEGER 0/1 with CHECK constraints.
--   - Money stored in INTEGER paise (1 INR = 100 paise) to avoid float error.
--   - Embeddings stored as BLOB (float32 little-endian, 1536 dims default).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- USERS & AUTH
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  full_name         TEXT,
  email             TEXT,
  mobile            TEXT,
  password_hash     TEXT,
  email_verified    INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0,1)),
  mobile_verified   INTEGER NOT NULL DEFAULT 0 CHECK (mobile_verified IN (0,1)),
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','hi','mr')),
  location_city     TEXT,
  location_district TEXT,
  location_state    TEXT DEFAULT 'Maharashtra',
  current_plan_code TEXT NOT NULL DEFAULT 'freemium'
                    REFERENCES plans(code) ON UPDATE CASCADE,
  plan_valid_until  INTEGER,
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','suspended','deleted')),
  notify_in_app     INTEGER NOT NULL DEFAULT 1 CHECK (notify_in_app IN (0,1)),
  notify_email      INTEGER NOT NULL DEFAULT 1 CHECK (notify_email IN (0,1)),
  notify_whatsapp   INTEGER NOT NULL DEFAULT 0 CHECK (notify_whatsapp IN (0,1)),
  notify_sms        INTEGER NOT NULL DEFAULT 0 CHECK (notify_sms IN (0,1)),
  last_login_at     INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  deleted_at        INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_email  ON users(email)  WHERE email  IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_mobile ON users(mobile) WHERE mobile IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_users_plan          ON users(current_plan_code, plan_valid_until);
CREATE INDEX IF NOT EXISTS ix_users_status        ON users(status);
CREATE INDEX IF NOT EXISTS ix_users_created       ON users(created_at);

CREATE TABLE IF NOT EXISTS otp_codes (
  id             TEXT PRIMARY KEY,
  user_id        TEXT REFERENCES users(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  destination    TEXT NOT NULL,
  purpose        TEXT NOT NULL CHECK (purpose IN ('login','signup','verify_email','verify_mobile','reset_password')),
  code_hash      TEXT NOT NULL,
  attempts       INTEGER NOT NULL DEFAULT 0,
  max_attempts   INTEGER NOT NULL DEFAULT 5,
  consumed_at    INTEGER,
  expires_at     INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  created_ip     TEXT
);
CREATE INDEX IF NOT EXISTS ix_otp_lookup  ON otp_codes(destination, purpose, expires_at);
CREATE INDEX IF NOT EXISTS ix_otp_user    ON otp_codes(user_id);
CREATE INDEX IF NOT EXISTS ix_otp_expires ON otp_codes(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash  TEXT NOT NULL,
  user_agent          TEXT,
  ip_address          TEXT,
  device_label        TEXT,
  expires_at          INTEGER NOT NULL,
  revoked_at          INTEGER,
  last_used_at        INTEGER,
  created_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_sessions_expires ON sessions(expires_at);

-- ---------------------------------------------------------------------------
-- ADMIN USERS & RBAC
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roles (
  code        TEXT PRIMARY KEY CHECK (code IN ('super_admin','admin','kb_manager','counsellor','support')),
  name        TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id             TEXT PRIMARY KEY,
  full_name      TEXT NOT NULL,
  email          TEXT NOT NULL,
  mobile         TEXT,
  password_hash  TEXT NOT NULL,
  role_code      TEXT NOT NULL REFERENCES roles(code) ON UPDATE CASCADE,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','disabled')),
  totp_secret    TEXT,
  last_login_at  INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_admin_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS ix_admin_role         ON admin_users(role_code);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id                 TEXT PRIMARY KEY,
  admin_user_id      TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  ip_address         TEXT,
  user_agent         TEXT,
  expires_at         INTEGER NOT NULL,
  revoked_at         INTEGER,
  created_at         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_admin_sessions_admin ON admin_sessions(admin_user_id);

-- ---------------------------------------------------------------------------
-- PLANS, SUBSCRIPTIONS, PAYMENTS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plans (
  code               TEXT PRIMARY KEY CHECK (code IN ('freemium','premium','super_premium')),
  name               TEXT NOT NULL,
  description        TEXT,
  price_paise        INTEGER NOT NULL DEFAULT 0 CHECK (price_paise >= 0),
  currency           TEXT NOT NULL DEFAULT 'INR',
  validity_days      INTEGER NOT NULL DEFAULT 365,
  cutoff_date        INTEGER,
  feat_profile_memory      INTEGER NOT NULL DEFAULT 0 CHECK (feat_profile_memory IN (0,1)),
  feat_next_steps          INTEGER NOT NULL DEFAULT 0 CHECK (feat_next_steps IN (0,1)),
  feat_counselling_assist  INTEGER NOT NULL DEFAULT 0 CHECK (feat_counselling_assist IN (0,1)),
  feat_one_to_one          INTEGER NOT NULL DEFAULT 0 CHECK (feat_one_to_one IN (0,1)),
  feat_in_person           INTEGER NOT NULL DEFAULT 0 CHECK (feat_in_person IN (0,1)),
  feat_voice               INTEGER NOT NULL DEFAULT 1 CHECK (feat_voice IN (0,1)),
  daily_chat_limit         INTEGER,
  extra_features_json      TEXT NOT NULL DEFAULT '{}',
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code       TEXT NOT NULL REFERENCES plans(code) ON UPDATE CASCADE,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','expired','cancelled','pending')),
  price_paise_paid INTEGER NOT NULL DEFAULT 0,
  starts_at       INTEGER NOT NULL,
  valid_until     INTEGER NOT NULL,
  cancelled_at    INTEGER,
  payment_id      TEXT REFERENCES payments(id) ON DELETE SET NULL,
  source          TEXT NOT NULL DEFAULT 'razorpay' CHECK (source IN ('razorpay','admin_grant','migration')),
  notes           TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_subs_user        ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS ix_subs_validity    ON subscriptions(status, valid_until);
CREATE UNIQUE INDEX IF NOT EXISTS ux_subs_one_active ON subscriptions(user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS payments (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_code             TEXT NOT NULL REFERENCES plans(code) ON UPDATE CASCADE,
  amount_paise          INTEGER NOT NULL CHECK (amount_paise >= 0),
  currency              TEXT NOT NULL DEFAULT 'INR',
  status                TEXT NOT NULL DEFAULT 'created'
                        CHECK (status IN ('created','attempted','paid','failed','refunded','partially_refunded')),
  razorpay_order_id     TEXT,
  razorpay_payment_id   TEXT,
  razorpay_signature    TEXT,
  method                TEXT,
  refund_amount_paise   INTEGER NOT NULL DEFAULT 0,
  failure_reason        TEXT,
  receipt               TEXT,
  raw_webhook_json      TEXT,
  paid_at               INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pay_order    ON payments(razorpay_order_id)   WHERE razorpay_order_id   IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_pay_payment  ON payments(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_pay_user            ON payments(user_id, status);
CREATE INDEX IF NOT EXISTS ix_pay_status          ON payments(status, created_at);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id            TEXT PRIMARY KEY,
  payment_id    TEXT REFERENCES payments(id) ON DELETE SET NULL,
  event_type    TEXT NOT NULL,
  signature_ok  INTEGER NOT NULL DEFAULT 0 CHECK (signature_ok IN (0,1)),
  payload_json  TEXT NOT NULL,
  processed_at  INTEGER,
  received_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_webhook_payment ON payment_webhook_events(payment_id);

-- ---------------------------------------------------------------------------
-- KNOWLEDGE BASE (RAG): documents, chunks+embeddings, tags
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kb_documents (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  source_type     TEXT NOT NULL CHECK (source_type IN ('pdf','google_sheet','faq','notice','circular','schedule','counselling_note','manual_text','url')),
  file_path       TEXT,
  file_mime       TEXT,
  file_size_bytes INTEGER,
  file_hash       TEXT,
  source_url      TEXT,
  course          TEXT,
  cap_year        INTEGER,
  language        TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','mr','mixed')),
  topic           TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  replaces_doc_id TEXT REFERENCES kb_documents(id) ON DELETE SET NULL,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  index_status    TEXT NOT NULL DEFAULT 'pending'
                  CHECK (index_status IN ('pending','processing','indexed','failed','stale')),
  index_error     TEXT,
  chunk_count     INTEGER NOT NULL DEFAULT 0,
  embedding_model TEXT,
  -- OpenAI document-understanding engine: the uploaded file's id at OpenAI and
  -- its ingest status ('uploaded' once attached to the shared vector store).
  openai_file_id  TEXT,
  openai_file_status TEXT,
  llama_cloud_file_id TEXT,
  extract_type          TEXT,
  structured_record_count INTEGER NOT NULL DEFAULT 0,
  uploaded_by     TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  indexed_at      INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
CREATE INDEX IF NOT EXISTS ix_kbdoc_active    ON kb_documents(is_active, language) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_kbdoc_filter    ON kb_documents(course, cap_year, topic, language);
CREATE INDEX IF NOT EXISTS ix_kbdoc_status    ON kb_documents(index_status);
CREATE INDEX IF NOT EXISTS ix_kbdoc_hash      ON kb_documents(file_hash);

CREATE TABLE IF NOT EXISTS kb_tags (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL CHECK (kind IN ('course','year','language','topic','custom')),
  value     TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_kbtags_kind_value ON kb_tags(kind, value);

CREATE TABLE IF NOT EXISTS kb_document_tags (
  document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  tag_id      TEXT NOT NULL REFERENCES kb_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);
CREATE INDEX IF NOT EXISTS ix_kbdoctags_tag ON kb_document_tags(tag_id);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,
  content         TEXT NOT NULL,
  token_count     INTEGER,
  language        TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','mr','mixed')),
  course          TEXT,
  cap_year        INTEGER,
  topic           TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  embedding       BLOB,
  embedding_dim   INTEGER,
  embedding_model TEXT,
  source_locator  TEXT,
  metadata_json   TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_chunk_doc_idx ON kb_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS ix_chunk_filter ON kb_chunks(is_active, language, course, cap_year)
  WHERE is_active = 1 AND embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_chunk_doc     ON kb_chunks(document_id);

-- Structured extraction cache: raw text + normalized CAP seat-matrix rows.
-- Index time: extract → save here → optional vector chunks. Query time: SQL first.

CREATE TABLE IF NOT EXISTS kb_document_extracts (
  document_id     TEXT PRIMARY KEY REFERENCES kb_documents(id) ON DELETE CASCADE,
  extract_type    TEXT NOT NULL CHECK (extract_type IN ('cap_matrix','prose','empty')),
  raw_text        TEXT,
  parser_version  TEXT NOT NULL DEFAULT '1',
  record_count    INTEGER NOT NULL DEFAULT 0,
  char_count      INTEGER NOT NULL DEFAULT 0,
  extracted_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_cap_matrix_records (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  institute_code  TEXT NOT NULL,
  institute_name  TEXT NOT NULL,
  institute_status TEXT,
  choice_code     TEXT,
  course_name     TEXT,
  si              INTEGER,
  ms_seats        INTEGER,
  minority_seats  INTEGER,
  all_india_seats INTEGER,
  institute_seats INTEGER,
  orphan_seats    INTEGER,
  ews_seats       INTEGER,
  cap_seats       INTEGER,
  tfws_detail     TEXT,
  source_page     INTEGER,
  source_locator  TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_cap_institute   ON kb_cap_matrix_records(institute_code);
CREATE INDEX IF NOT EXISTS ix_cap_doc_inst    ON kb_cap_matrix_records(document_id, institute_code);
CREATE INDEX IF NOT EXISTS ix_cap_choice      ON kb_cap_matrix_records(choice_code);

CREATE TABLE IF NOT EXISTS kb_cap_category_seats (
  id          TEXT PRIMARY KEY,
  record_id   TEXT NOT NULL REFERENCES kb_cap_matrix_records(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  subcategory TEXT,
  seats       INTEGER,
  raw_line    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_cap_cat_record ON kb_cap_category_seats(record_id);

-- Full-text search over chunk content (FTS5; unicode61 folds Devanagari + Latin).
CREATE VIRTUAL TABLE IF NOT EXISTS kb_chunks_fts USING fts5(
  content,
  content='kb_chunks',
  content_rowid='rowid',
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS trg_kbchunks_ai AFTER INSERT ON kb_chunks BEGIN
  INSERT INTO kb_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER IF NOT EXISTS trg_kbchunks_ad AFTER DELETE ON kb_chunks BEGIN
  INSERT INTO kb_chunks_fts(kb_chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
END;
CREATE TRIGGER IF NOT EXISTS trg_kbchunks_au AFTER UPDATE ON kb_chunks BEGIN
  INSERT INTO kb_chunks_fts(kb_chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  INSERT INTO kb_chunks_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- ---------------------------------------------------------------------------
-- CHAT & VOICE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS chat_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT,
  language      TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','mr')),
  channel       TEXT NOT NULL DEFAULT 'chat' CHECK (channel IN ('chat','voice')),
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_chatsess_user ON chat_sessions(user_id, last_message_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  language        TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','mr')),
  input_mode      TEXT NOT NULL DEFAULT 'text' CHECK (input_mode IN ('text','voice')),
  is_grounded     INTEGER NOT NULL DEFAULT 1 CHECK (is_grounded IN (0,1)),
  is_fallback     INTEGER NOT NULL DEFAULT 0 CHECK (is_fallback IN (0,1)),
  citations_json  TEXT NOT NULL DEFAULT '[]',
  retrieval_score REAL,
  stt_audio_path  TEXT,
  tts_audio_path  TEXT,
  stt_confidence  REAL,
  model           TEXT,
  prompt_tokens   INTEGER,
  completion_tokens INTEGER,
  latency_ms      INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_chatmsg_session  ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS ix_chatmsg_user     ON chat_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_chatmsg_fallback ON chat_messages(is_fallback) WHERE is_fallback = 1;

CREATE TABLE IF NOT EXISTS chat_message_sources (
  message_id  TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  chunk_id    TEXT NOT NULL REFERENCES kb_chunks(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  score       REAL NOT NULL,
  rank        INTEGER NOT NULL,
  PRIMARY KEY (message_id, chunk_id)
);
CREATE INDEX IF NOT EXISTS ix_msgsrc_chunk ON chat_message_sources(chunk_id);

CREATE TABLE IF NOT EXISTS chat_usage_daily (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date  TEXT NOT NULL,
  chat_count  INTEGER NOT NULL DEFAULT 0,
  voice_count INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, usage_date)
);

-- ---------------------------------------------------------------------------
-- USER PROFILE MEMORY (paid plans) & NEXT-STEP RECOMMENDATIONS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cap_application_no TEXT,
  cap_year           INTEGER,
  category           TEXT,
  course_interest    TEXT,
  cet_exam           TEXT,
  cet_score          REAL,
  cet_percentile     REAL,
  merit_number       INTEGER,
  home_university     TEXT,
  preferred_districts TEXT,
  preferred_colleges  TEXT,
  documents_status    TEXT NOT NULL DEFAULT '{}',
  current_stage      TEXT CHECK (current_stage IN
                       ('registration','document_verification','merit_list','option_form',
                        'allotment','reporting','admission_confirmed') OR current_stage IS NULL),
  extra_json         TEXT NOT NULL DEFAULT '{}',
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profile_memory (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mem_key     TEXT NOT NULL,
  mem_value   TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'chat' CHECK (source IN ('chat','profile_form','admin','recommendation')),
  confidence  REAL,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_memory_user ON user_profile_memory(user_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS ux_memory_user_key ON user_profile_memory(user_id, mem_key) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS recommendations (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step_type     TEXT NOT NULL CHECK (step_type IN
                  ('registration','document_verification','merit_list','option_form',
                   'allotment','reporting','payment','counselling','other')),
  title         TEXT NOT NULL,
  description   TEXT,
  language      TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','mr')),
  priority      INTEGER NOT NULL DEFAULT 0,
  due_at        INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','done','dismissed','expired')),
  source_document_id TEXT REFERENCES kb_documents(id) ON DELETE SET NULL,
  generated_by  TEXT NOT NULL DEFAULT 'system' CHECK (generated_by IN ('system','admin','counsellor')),
  completed_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_reco_user   ON recommendations(user_id, status, priority);
CREATE INDEX IF NOT EXISTS ix_reco_due    ON recommendations(due_at) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- COUNSELLING WORKFLOW (leads, requests, appointments)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS counselling_requests (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('assist','one_to_one','in_person','general_query')),
  topic           TEXT,
  message         TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en','hi','mr')),
  preferred_mode  TEXT CHECK (preferred_mode IN ('call','video','chat','in_person') OR preferred_mode IS NULL),
  preferred_time_json TEXT NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','contacted','scheduled','in_progress','resolved','closed','cancelled')),
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to     TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  plan_code_at_request TEXT REFERENCES plans(code) ON UPDATE CASCADE,
  resolution_notes TEXT,
  resolved_at     INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_counsreq_user     ON counselling_requests(user_id);
CREATE INDEX IF NOT EXISTS ix_counsreq_status   ON counselling_requests(status, priority);
CREATE INDEX IF NOT EXISTS ix_counsreq_assignee ON counselling_requests(assigned_to, status);

CREATE TABLE IF NOT EXISTS counselling_appointments (
  id              TEXT PRIMARY KEY,
  request_id      TEXT REFERENCES counselling_requests(id) ON DELETE SET NULL,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counsellor_id   TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  mode            TEXT NOT NULL DEFAULT 'call' CHECK (mode IN ('call','video','chat','in_person')),
  scheduled_start INTEGER NOT NULL,
  scheduled_end   INTEGER,
  location        TEXT,
  meeting_link    TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','confirmed','completed','no_show','cancelled','rescheduled')),
  reminder_sent   INTEGER NOT NULL DEFAULT 0 CHECK (reminder_sent IN (0,1)),
  counsellor_notes TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_appt_user         ON counselling_appointments(user_id);
CREATE INDEX IF NOT EXISTS ix_appt_counsellor   ON counselling_appointments(counsellor_id, scheduled_start);
CREATE INDEX IF NOT EXISTS ix_appt_schedule     ON counselling_appointments(scheduled_start, status);

CREATE TABLE IF NOT EXISTS counselling_notes (
  id            TEXT PRIMARY KEY,
  request_id    TEXT REFERENCES counselling_requests(id) ON DELETE CASCADE,
  appointment_id TEXT REFERENCES counselling_appointments(id) ON DELETE CASCADE,
  author_admin_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  note          TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_counsnotes_req ON counselling_notes(request_id, created_at);

-- Bookable counselling slots published by admins/counsellors.
CREATE TABLE IF NOT EXISTS counselling_slots (
  id             TEXT PRIMARY KEY,
  counsellor_id  TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  mode           TEXT NOT NULL DEFAULT 'call' CHECK (mode IN ('call','video','chat','in_person')),
  start_at       INTEGER NOT NULL,
  end_at         INTEGER,
  location       TEXT,
  meeting_link   TEXT,
  capacity       INTEGER NOT NULL DEFAULT 1,
  booked_count   INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_slots_open ON counselling_slots(is_active, start_at) WHERE is_active = 1;

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS & BROADCASTS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broadcast_id  TEXT REFERENCES broadcasts(id) ON DELETE SET NULL,
  type          TEXT NOT NULL CHECK (type IN
                  ('reminder','recommendation','counselling','payment','system','broadcast','deadline')),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  language      TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','mr')),
  channel       TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','email','sms','whatsapp')),
  action_url    TEXT,
  related_entity_type TEXT,
  related_entity_id   TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
                  CHECK (delivery_status IN ('pending','sent','delivered','failed','skipped')),
  provider_message_id TEXT,
  failure_reason  TEXT,
  scheduled_at  INTEGER,
  sent_at       INTEGER,
  read_at       INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_notif_user_feed ON notifications(user_id, created_at) WHERE channel = 'in_app';
CREATE INDEX IF NOT EXISTS ix_notif_unread    ON notifications(user_id) WHERE read_at IS NULL AND channel = 'in_app';
CREATE INDEX IF NOT EXISTS ix_notif_dispatch  ON notifications(delivery_status, scheduled_at) WHERE delivery_status = 'pending';
CREATE INDEX IF NOT EXISTS ix_notif_broadcast ON notifications(broadcast_id);

CREATE TABLE IF NOT EXISTS broadcasts (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  body_en        TEXT,
  body_hi        TEXT,
  body_mr        TEXT,
  default_language TEXT NOT NULL DEFAULT 'en' CHECK (default_language IN ('en','hi','mr')),
  audience_type  TEXT NOT NULL DEFAULT 'all'
                 CHECK (audience_type IN ('all','plan','language','location','custom')),
  audience_filter_json TEXT NOT NULL DEFAULT '{}',
  channels_json  TEXT NOT NULL DEFAULT '["in_app"]',
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','scheduled','sending','sent','cancelled','failed')),
  scheduled_at   INTEGER,
  sent_at        INTEGER,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count     INTEGER NOT NULL DEFAULT 0,
  failed_count   INTEGER NOT NULL DEFAULT 0,
  created_by     TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_broadcast_status ON broadcasts(status, scheduled_at);

-- ---------------------------------------------------------------------------
-- ADVERTISEMENT BANNERS & EVENT TRACKING
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS banners (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  image_path     TEXT NOT NULL,
  image_alt      TEXT,
  target_url     TEXT,
  placement      TEXT NOT NULL CHECK (placement IN
                  ('home_top','home_mid','sidebar','chat_footer','pricing','dashboard','popup')),
  target_language TEXT CHECK (target_language IN ('en','hi','mr','all') OR target_language IS NULL),
  target_plan     TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  starts_at      INTEGER,
  ends_at        INTEGER,
  priority       INTEGER NOT NULL DEFAULT 0,
  impression_count INTEGER NOT NULL DEFAULT 0,
  click_count      INTEGER NOT NULL DEFAULT 0,
  created_by     TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_banner_serve ON banners(placement, is_active, priority);
CREATE INDEX IF NOT EXISTS ix_banner_window ON banners(starts_at, ends_at) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS banner_events (
  id           TEXT PRIMARY KEY,
  banner_id    TEXT NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN ('impression','click')),
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  session_ref  TEXT,
  placement    TEXT,
  page_url     TEXT,
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_bevent_banner ON banner_events(banner_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS ix_bevent_time   ON banner_events(created_at);

CREATE TABLE IF NOT EXISTS banner_stats_daily (
  banner_id        TEXT NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
  stat_date        TEXT NOT NULL,
  impression_count INTEGER NOT NULL DEFAULT 0,
  click_count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (banner_id, stat_date)
);

-- ---------------------------------------------------------------------------
-- APP SETTINGS, AUDIT LOG, JOB QUEUE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  description TEXT,
  updated_by  TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('admin','user','system')),
  actor_id      TEXT,
  action        TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  before_json   TEXT,
  after_json    TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_actor  ON audit_log(actor_type, actor_id, created_at);
CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_log(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS ix_audit_time   ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS job_queue (
  id            TEXT PRIMARY KEY,
  job_type      TEXT NOT NULL CHECK (job_type IN
                  ('kb_index','kb_reindex','embed_chunks','broadcast_send','reminder_dispatch','notification_send')),
  payload_json  TEXT NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','done','failed','dead')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 5,
  run_after     INTEGER NOT NULL,
  locked_at     INTEGER,
  last_error    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_jobs_poll ON job_queue(status, run_after) WHERE status IN ('queued','failed');
