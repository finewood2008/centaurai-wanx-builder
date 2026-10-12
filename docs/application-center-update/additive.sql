-- Application-center definitions, immutable versions, trial/build records and private instances.
CREATE TABLE IF NOT EXISTS application_drafts (
  application_id TEXT PRIMARY KEY REFERENCES applications(application_id) ON DELETE CASCADE,
  project_agent_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  definition_hash TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS application_versions (
  application_id TEXT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  definition_hash TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  published_at INTEGER,
  PRIMARY KEY (application_id, version)
);
CREATE TABLE IF NOT EXISTS application_runs (
  application_id TEXT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  version TEXT NOT NULL,
  definition_hash TEXT NOT NULL,
  kind TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT,
  status TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (application_id, run_id),
  FOREIGN KEY (application_id, version) REFERENCES application_versions(application_id, version)
);
CREATE TABLE IF NOT EXISTS application_instances (
  application_id TEXT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (application_id, user_id)
);
-- Backport only: schema watermark remains unchanged; future migration 026 is idempotent.
