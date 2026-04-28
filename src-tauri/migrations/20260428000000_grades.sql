CREATE TABLE IF NOT EXISTS grade_assignments (
    id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    weight REAL NOT NULL DEFAULT 10,
    earned REAL,
    max_score REAL NOT NULL DEFAULT 100,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id, course_id)
);
