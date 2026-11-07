import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  employee_code TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS technician_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type TEXT NOT NULL,
  home_barangay TEXT NOT NULL,
  phone TEXT NOT NULL,
  session_active INTEGER NOT NULL DEFAULT 0,
  last_lat REAL,
  last_lng REAL,
  last_gps_at TEXT,
  last_speed_kmh REAL
);

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  account_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  municipality TEXT NOT NULL,
  barangay TEXT NOT NULL,
  street_address TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  lat REAL,
  lng REAL,
  coords_verified INTEGER NOT NULL DEFAULT 0,
  active_nap_box_id TEXT,
  active_port_number INTEGER,
  onu_serial TEXT,
  fiber_tag TEXT,
  last_optical_dbm REAL
);

CREATE TABLE IF NOT EXISTS nap_boxes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  municipality TEXT NOT NULL,
  barangay TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  total_ports INTEGER NOT NULL,
  olt_code TEXT NOT NULL,
  coords_verified INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS nap_ports (
  nap_box_id TEXT NOT NULL REFERENCES nap_boxes(id) ON DELETE CASCADE,
  port_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'FREE',
  subscriber_id TEXT,
  fiber_tag TEXT,
  locked_by_wo_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (nap_box_id, port_number)
);

CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  workflow_type TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  assigned_tech_id TEXT REFERENCES users(id),
  source_channel TEXT NOT NULL,
  summary_title TEXT NOT NULL,
  issue_description TEXT NOT NULL,
  target_lat REAL NOT NULL,
  target_lng REAL NOT NULL,
  target_municipality TEXT NOT NULL,
  target_barangay TEXT NOT NULL,
  target_address TEXT NOT NULL,
  old_address TEXT,
  old_lat REAL,
  old_lng REAL,
  old_nap_box_id TEXT,
  old_port_number INTEGER,
  assigned_nap_box_id TEXT,
  assigned_port_number INTEGER,
  fiber_tag TEXT,
  onu_serial TEXT,
  optical_rx_dbm REAL,
  optical_signal_band TEXT,
  supervisor_review_required INTEGER NOT NULL DEFAULT 0,
  supervisor_reviewed_at TEXT,
  supervisor_reviewed_by TEXT,
  exception_reason_code TEXT,
  exception_notes TEXT,
  resolution_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS location_discrepancies (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  captured_by_id TEXT NOT NULL REFERENCES users(id),
  recorded_lat REAL NOT NULL,
  recorded_lng REAL NOT NULL,
  captured_lat REAL NOT NULL,
  captured_lng REAL NOT NULL,
  distance_meters REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  reviewed_by_id TEXT,
  review_notes TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS field_evidence (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  capture_mode TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  captured_lat REAL,
  captured_lng REAL,
  watermark TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_receipts (
  idempotency_key TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  work_order_id TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration_outbox (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  target_system TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  gate_status TEXT NOT NULL DEFAULT 'GATED_DRY_RUN',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_orders_tech_status ON work_orders(assigned_tech_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_subscriber ON work_orders(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_nap_ports_status ON nap_ports(status);
CREATE INDEX IF NOT EXISTS idx_field_evidence_wo ON field_evidence(work_order_id);
CREATE INDEX IF NOT EXISTS idx_discrepancies_status ON location_discrepancies(status);
CREATE INDEX IF NOT EXISTS idx_sync_receipts_lookup ON sync_receipts(actor_user_id, endpoint, work_order_id);
CREATE INDEX IF NOT EXISTS idx_integration_outbox_wo ON integration_outbox(work_order_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
`;

export function openSqliteDatabase(dbPath: string): DatabaseSync {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA_SQL);
  const cols = db.prepare("PRAGMA table_info('users')").all() as Array<{
    name: string;
  }>;
  if (cols.length > 0 && !cols.some((c) => c.name === 'session_version')) {
    db.exec(
      'ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;',
    );
  }
  return db;
}

export function runInTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Ignore secondary rollback errors
    }
    throw err;
  }
}
