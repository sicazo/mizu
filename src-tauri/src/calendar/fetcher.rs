use anyhow::{Context, Result};
use chrono::{DateTime, NaiveDate, Utc};
use icalendar::{Calendar, CalendarDateTime, Component, DatePerhapsTime, EventLike};
use uuid::Uuid;
use reqwest::header::{ETAG, IF_NONE_MATCH};
use sqlx::SqlitePool;
use std::collections::HashSet;

#[derive(Debug, Clone, serde::Serialize)]
pub struct CalEvent {
    pub uid: String,
    pub summary: String,
    pub start: Option<DateTime<Utc>>,
    pub end: Option<DateTime<Utc>>,
    pub location: Option<String>,
    pub description: Option<String>,
    pub sequence: i64,
}

#[derive(Debug, Default)]
pub struct SyncDiff {
    pub added: Vec<CalEvent>,
    pub updated: Vec<CalEvent>,
    pub removed: Vec<String>,
}

impl SyncDiff {
    pub fn is_empty(&self) -> bool {
        self.added.is_empty() && self.updated.is_empty() && self.removed.is_empty()
    }
}

pub struct CalendarSync {
    pool: SqlitePool,
    url: String,
    http: reqwest::Client,
}

impl CalendarSync {
    pub async fn new(pool: SqlitePool, url: impl Into<String>) -> Result<Self> {
        let this = Self {
            pool,
            url: url.into(),
            http: reqwest::Client::builder().use_rustls_tls().build()?,
        };
        this.migrate().await?;
        Ok(this)
    }

    pub async fn sync(&self) -> Result<SyncDiff> {
        match self.fetch().await? {
            Some(body) => self.apply(parse_ical(&body)?).await,
            None => Ok(SyncDiff::default()),
        }
    }

    pub async fn events(&self) -> Result<Vec<CalEvent>> {
        let rows = sqlx::query!(
            "SELECT uid, summary, start_time, end_time, location, description, sequence from calendar_events"
        ).fetch_all(&self.pool).await?;

        Ok(rows
            .into_iter()
            .map(|r| CalEvent {
                uid: r.uid.unwrap_or_default(),
                summary: r.summary,
                start: r.start_time.and_then(|s: String| s.parse().ok()),
                end: r.end_time.and_then(|s: String| s.parse().ok()),
                location: r.location,
                description: r.description,
                sequence: r.sequence,
            })
            .collect())
    }

    async fn migrate(&self) -> Result<()> {
        sqlx::query(
            "CREATE TABLE IF NOT EXISTS calendar_events (
                uid TEXT PRIMARY KEY,
                summary TEXT NOT NULL,
                start_time TEXT,
                end_time TEXT,
                location TEXT,
                description TEXT,
                sequence INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )",
        )
        .execute(&self.pool)
        .await
        .context("failed to create calendar_events table")?;

        sqlx::query(
            "CREATE TABLE IF NOT EXISTS calendar_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
        )
        .execute(&self.pool)
        .await
        .context("failed to create calendar_meta table")?;

        Ok(())
    }

    async fn fetch(&self) -> Result<Option<String>> {
        let etag = sqlx::query!("SELECT value FROM calendar_meta WHERE key = 'etag'")
            .fetch_optional(&self.pool)
            .await?
            .map(|r| r.value);

        let mut req = self.http.get(&self.url);
        if let Some(e) = etag {
            req = req.header(IF_NONE_MATCH, e);
        }

        let resp = req.send().await?.error_for_status()?;

        if resp.status() == 304 {
            return Ok(None);
        }

        if let Some(etag) = resp.headers().get(ETAG) {
            let etag_str = etag.to_str()?;
            sqlx::query!(
                "INSERT INTO calendar_meta (key, value) VALUES ('etag', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", etag_str
            ).execute(&self.pool).await?;
        }

        Ok(Some(resp.text().await?))
    }

    async fn apply(&self, incoming: Vec<CalEvent>) -> Result<SyncDiff> {
        let mut diff = SyncDiff::default();
        let incoming_uids: HashSet<String> = incoming.iter().map(|e| e.uid.clone()).collect();

        for event in incoming {
            let existing = sqlx::query!(
                "SELECT sequence FROM calendar_events WHERE uid = ?",
                event.uid
            )
            .fetch_optional(&self.pool)
            .await?;

            match existing {
                None => {
                    self.insert(&event).await?;
                    diff.added.push(event);
                }
                Some(row) if row.sequence < event.sequence => {
                    self.update(&event).await?;
                    diff.updated.push(event);
                }
                _ => {}
            }
        }

        let db_uids = sqlx::query!("SELECT uid FROM calendar_events")
            .fetch_all(&self.pool)
            .await?;

        for row in db_uids {
            if let Some(uid) = row.uid {
                if !incoming_uids.contains(&uid) {
                    sqlx::query!("DELETE FROM calendar_events WHERE uid = ?", uid)
                        .execute(&self.pool)
                        .await?;
                    diff.removed.push(uid);
                }
            }
        }

        Ok(diff)
    }

    async fn insert(&self, e: &CalEvent) -> Result<()> {
        let start = e.start.map(|d| d.to_rfc3339());
        let end = e.end.map(|d| d.to_rfc3339());

        sqlx::query!(
            "INSERT INTO calendar_events
            (uid, summary, start_time, end_time, location, description, sequence)
            VALUES (?, ?,?, ? ,? ,?, ? )",
            e.uid,
            e.summary,
            start,
            end,
            e.location,
            e.description,
            e.sequence,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn update(&self, e: &CalEvent) -> Result<()> {
        let start = e.start.map(|d| d.to_rfc3339());
        let end = e.end.map(|d| d.to_rfc3339());
        sqlx::query!(
            "UPDATE calendar_events
             SET summary = ?, start_time = ?, end_time = ?,
                 location = ?, description = ?, sequence = ?,
                 updated_at = datetime('now')
             WHERE uid = ?",
            e.summary,
            start,
            end,
            e.location,
            e.description,
            e.sequence,
            e.uid,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

fn date_perhaps_time_to_utc(d: DatePerhapsTime) -> Option<DateTime<Utc>> {
    match d {
        DatePerhapsTime::DateTime(CalendarDateTime::Utc(dt)) => Some(dt),
        DatePerhapsTime::DateTime(CalendarDateTime::Floating(dt)) => Some(dt.and_utc()),
        DatePerhapsTime::DateTime(CalendarDateTime::WithTimezone { date_time, .. }) => {
            Some(date_time.and_utc())
        }
        DatePerhapsTime::Date(d) => NaiveDate::from(d).and_hms_opt(0, 0, 0).map(|dt| dt.and_utc()),
    }
}

fn parse_ical(raw: &str) -> Result<Vec<CalEvent>> {
    let cal: Calendar = raw
        .parse()
        .map_err(|e: String| anyhow::anyhow!("{e}"))
        .context("invalid iCal data")?;

    Ok(cal
        .iter()
        .filter_map(|c| c.as_event())
        .filter_map(|e| {
            e.get_uid()?;
            Some(CalEvent {
                uid: Uuid::new_v4().to_string(),
                summary: e.get_summary().unwrap_or("(no title)").to_owned(),
                start: e.get_start().and_then(date_perhaps_time_to_utc),
                end: e.get_end().and_then(date_perhaps_time_to_utc),
                location: e.get_location().map(str::to_owned),
                description: e.get_description().map(str::to_owned),
                sequence: e
                    .property_value("SEQUENCE")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0),
            })
        })
        .collect())
}
