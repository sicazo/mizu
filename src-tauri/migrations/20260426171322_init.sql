CREATE TABLE IF NOT EXISTS calendar_events (
    uid TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    location TEXT,
    description TEXT,
    sequence INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
