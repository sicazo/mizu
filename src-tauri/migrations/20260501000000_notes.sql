CREATE TABLE IF NOT EXISTS lecture_notes (
    id           TEXT PRIMARY KEY,
    course_id    TEXT NOT NULL,
    title        TEXT NOT NULL DEFAULT '',
    content      TEXT NOT NULL DEFAULT '',
    lecture_num  INTEGER,
    lecture_date TEXT,
    location     TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    modified_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lecture_notes_course
    ON lecture_notes (course_id, modified_at DESC);
