use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

const SCHEMA_VERSION: i32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub id: String,
    pub title: String,
    pub content: String,
    pub version: i64,
    pub notes: Option<String>,
    #[serde(default)]
    pub is_current: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub stage: String,
    #[serde(default)]
    pub paused: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub prompts: Vec<Prompt>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub sort_index: i64,
}

pub struct Database {
    conn: Mutex<Connection>,
    db_path: PathBuf,
}

impl Database {
    pub fn init(app_config_dir: PathBuf) -> Result<Self, String> {
        let db_path = app_config_dir.join("agent-workbench.db");
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("create dir failed: {e}"))?;
        }
        let conn = Connection::open(&db_path).map_err(|e| format!("open db failed: {e}"))?;
        conn.execute("PRAGMA foreign_keys = ON;", [])
            .map_err(|e| format!("pragma failed: {e}"))?;
        // journal mode WAL for crash safety
        let _ = conn.execute("PRAGMA journal_mode = WAL;", []);
        let db = Self {
            conn: Mutex::new(conn),
            db_path,
        };
        db.create_tables()?;
        db.apply_migrations()?;
        if let Err(e) = db.seed_if_empty() {
            log::warn!("Seed failed: {e}");
        }
        log::info!("Database initialized at {:?}", db.db_path);
        Ok(db)
    }

    fn create_tables(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("lock failed: {e}"))?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                stage TEXT NOT NULL DEFAULT 'idea',
                paused INTEGER NOT NULL DEFAULT 0,
                tags TEXT NOT NULL DEFAULT '[]',
                sort_index INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS prompts (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                notes TEXT,
                is_current INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS settings_kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS backups (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                file_name TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                note TEXT
            );
            "#,
        )
        .map_err(|e| format!("create tables failed: {e}"))?;
        // meta version
        conn.execute(
            "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)",
            [],
        )
        .map_err(|e| format!("meta failed: {e}"))?;
        let v: Option<String> = conn
            .query_row("SELECT value FROM meta WHERE key='schema_version'", [], |r| r.get(0))
            .optional()
            .map_err(|e| format!("query version failed: {e}"))?;
        if v.is_none() {
            conn.execute(
                "INSERT INTO meta (key, value) VALUES ('schema_version', ?1)",
                params![SCHEMA_VERSION.to_string()],
            )
            .map_err(|e| format!("insert version failed: {e}"))?;
        }
        Ok(())
    }

    fn apply_migrations(&self) -> Result<(), String> {
        // W1 only version 1, future migrations go here
        Ok(())
    }

    pub fn seed_if_empty(&self) -> Result<bool, String> {
        let count: i64 = {
            let conn = self.conn.lock().map_err(|e| format!("lock failed: {e}"))?;
            conn.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
                .map_err(|e| format!("count failed: {e}"))?
        };
        if count > 0 {
            return Ok(false);
        }
        // Try embedded projects.json (compile-time) for first-run seeding
        let embedded = include_str!("../../web/projects.json");
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(embedded) {
            if let Some(arr) = val.get("projects").and_then(|v| v.as_array()) {
                if !arr.is_empty() {
                    let projects: Vec<Project> = serde_json::from_value(serde_json::Value::Array(arr.clone()))
                        .unwrap_or_default();
                    if !projects.is_empty() {
                        self.save_all_projects(projects)?;
                        let _ = self.backup_now("seed-from-embedded");
                        log::info!("Seeded DB from embedded projects.json");
                        return Ok(true);
                    }
                }
            }
        }
        // Fallback: try dev absolute path
        let dev_path = std::path::PathBuf::from("/Users/jungod/Projects/agent-workbench-app/desktop-app/web/projects.json");
        if dev_path.exists() {
            if let Ok(s) = std::fs::read_to_string(&dev_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&s) {
                    if let Some(arr) = val.get("projects").and_then(|v| v.as_array()) {
                        let projects: Vec<Project> = serde_json::from_value(serde_json::Value::Array(arr.clone()))
                            .unwrap_or_default();
                        if !projects.is_empty() {
                            self.save_all_projects(projects)?;
                            let _ = self.backup_now("seed-from-dev-path");
                            log::info!("Seeded DB from dev path");
                            return Ok(true);
                        }
                    }
                }
            }
        }
        Ok(false)
    }

    pub fn get_all_projects(&self) -> Result<Vec<Project>, String> {
        let conn = self.conn.lock().map_err(|e| format!("lock failed: {e}"))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, description, stage, paused, tags, sort_index, created_at, updated_at FROM projects ORDER BY sort_index ASC, updated_at DESC",
            )
            .map_err(|e| format!("prepare failed: {e}"))?;
        let project_rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                ))
            })
            .map_err(|e| format!("query failed: {e}"))?;

        let mut projects: Vec<Project> = Vec::new();
        for r in project_rows {
            let (id, name, description, stage, paused, tags_json, sort_index, created_at, updated_at) =
                r.map_err(|e| format!("row failed: {e}"))?;
            let tags: Vec<String> =
                serde_json::from_str(&tags_json).unwrap_or_default();
            // load prompts for this project
            let mut p_stmt = conn
                .prepare(
                    "SELECT id, title, content, version, notes, is_current, created_at FROM prompts WHERE project_id=?1 ORDER BY version DESC",
                )
                .map_err(|e| format!("prepare prompts failed: {e}"))?;
            let prompt_rows = p_stmt
                .query_map(params![id], |row| {
                    Ok(Prompt {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        content: row.get(2)?,
                        version: row.get(3)?,
                        notes: row.get(4)?,
                        is_current: row.get::<_, i64>(5)? != 0,
                        created_at: row.get(6)?,
                    })
                })
                .map_err(|e| format!("query prompts failed: {e}"))?;
            let mut prompts = Vec::new();
            for pr in prompt_rows {
                prompts.push(pr.map_err(|e| format!("prompt row: {e}"))?);
            }
            projects.push(Project {
                id,
                name,
                description,
                stage,
                paused: paused != 0,
                tags,
                prompts,
                created_at,
                updated_at,
                sort_index,
            });
        }
        Ok(projects)
    }

    pub fn save_all_projects(&self, projects: Vec<Project>) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| format!("lock failed: {e}"))?;
        let tx = conn
            .transaction()
            .map_err(|e| format!("tx failed: {e}"))?;
        // clear existing (keep order: delete prompts first due to FK, then projects)
        tx.execute("DELETE FROM prompts", [])
            .map_err(|e| format!("delete prompts failed: {e}"))?;
        tx.execute("DELETE FROM projects", [])
            .map_err(|e| format!("delete projects failed: {e}"))?;
        for p in projects {
            let tags_json = serde_json::to_string(&p.tags).unwrap_or_else(|_| "[]".to_string());
            tx.execute(
                "INSERT INTO projects (id, name, description, stage, paused, tags, sort_index, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![p.id, p.name, p.description, p.stage, if p.paused {1} else {0}, tags_json, p.sort_index, p.created_at, p.updated_at],
            )
            .map_err(|e| format!("insert project {} failed: {e}", p.id))?;
            for pr in p.prompts {
                tx.execute(
                    "INSERT INTO prompts (id, project_id, title, content, version, notes, is_current, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                    params![pr.id, p.id, pr.title, pr.content, pr.version, pr.notes, if pr.is_current {1} else {0}, pr.created_at],
                )
                .map_err(|e| format!("insert prompt {} failed: {e}", pr.id))?;
            }
        }
        tx.commit().map_err(|e| format!("commit failed: {e}"))?;
        Ok(())
    }

    pub fn backup_now(&self, note: &str) -> Result<String, String> {
        let id = format!("backup_{}", chrono::Utc::now().format("%Y%m%d_%H%M%S_%3f"));
        let file_name = format!("{}.db", id);
        let backups_dir = self.db_path.parent().unwrap().join("backups");
        std::fs::create_dir_all(&backups_dir).map_err(|e| format!("mkdir backups failed: {e}"))?;
        let dst = backups_dir.join(&file_name);
        // use connection backup API or file copy when not busy
        // simple: copy db file after checkpoint
        {
            let conn = self.conn.lock().map_err(|e| format!("lock failed: {e}"))?;
            // checkpoint WAL to ensure consistency
            let _ = conn.execute("PRAGMA wal_checkpoint(TRUNCATE);", []);
        }
        std::fs::copy(&self.db_path, &dst).map_err(|e| format!("copy failed: {e}"))?;
        let wal = self.db_path.with_extension("db-wal");
        if wal.exists() {
            let _ = std::fs::copy(&wal, backups_dir.join(format!("{}.wal", id)));
        }
        let shm = self.db_path.with_extension("db-shm");
        if shm.exists() {
            let _ = std::fs::copy(&shm, backups_dir.join(format!("{}.shm", id)));
        }
        let size = std::fs::metadata(&dst).map(|m| m.len() as i64).unwrap_or(0);
        let now = chrono::Utc::now().to_rfc3339();
        let conn = self.conn.lock().map_err(|e| format!("lock failed: {e}"))?;
        conn.execute(
            "INSERT INTO backups (id, created_at, file_name, size_bytes, note) VALUES (?1,?2,?3,?4,?5)",
            params![id, now, file_name, size, note],
        )
        .map_err(|e| format!("insert backup meta failed: {e}"))?;
        // retain 30
        conn.execute(
            "DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY created_at DESC LIMIT 30)",
            [],
        )
        .ok();
        // also prune files older than 30
        if let Ok(entries) = std::fs::read_dir(&backups_dir) {
            let mut files: Vec<_> = entries.flatten().map(|e| e.path()).collect();
            files.sort();
            if files.len() > 90 {
                for f in files.iter().take(files.len() - 90) {
                    let _ = std::fs::remove_file(f);
                }
            }
        }
        log::info!("Backup created {} {}", id, file_name);
        Ok(id)
    }

    pub fn list_backups(&self) -> Result<Vec<BackupInfo>, String> {
        let conn = self.conn.lock().map_err(|e| format!("lock failed: {e}"))?;
        let mut stmt = conn
            .prepare("SELECT id, created_at, file_name, size_bytes, note FROM backups ORDER BY created_at DESC LIMIT 50")
            .map_err(|e| format!("prepare failed: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok(BackupInfo {
                    id: row.get(0)?,
                    created_at: row.get(1)?,
                    file_name: row.get(2)?,
                    size_bytes: row.get(3)?,
                    note: row.get(4)?,
                })
            })
            .map_err(|e| format!("query failed: {e}"))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| format!("row: {e}"))?);
        }
        Ok(out)
    }

    pub fn restore_backup(&self, id: &str) -> Result<(), String> {
        let file_name = {
            let conn = self.conn.lock().map_err(|e| format!("lock failed: {e}"))?;
            let mut stmt = conn
                .prepare("SELECT file_name FROM backups WHERE id=?1")
                .map_err(|e| format!("prepare failed: {e}"))?;
            let name: String = stmt
                .query_row(params![id], |r| r.get(0))
                .map_err(|e| format!("not found: {e}"))?;
            name
        };
        let backups_dir = self.db_path.parent().unwrap().join("backups");
        let src = backups_dir.join(file_name);
        if !src.exists() {
            return Err(format!("backup file missing: {:?}", src));
        }
        // safety backup current before restore
        let _ = self.backup_now("pre-restore");
        {
            let conn = self.conn.lock().map_err(|e| format!("lock failed: {e}"))?;
            let _ = conn.execute("PRAGMA wal_checkpoint(TRUNCATE);", []);
        }
        std::fs::copy(&src, &self.db_path).map_err(|e| format!("restore copy failed: {e}"))?;
        // remove wal/shm to force clean reopen
        let _ = std::fs::remove_file(self.db_path.with_extension("db-wal"));
        let _ = std::fs::remove_file(self.db_path.with_extension("db-shm"));
        // reopen connection? we keep same connection but need to reopen
        // Simplest: reopen by dropping and recreating connection file is not trivial with Mutex
        // We will just vacuum to clear
        let conn = self.conn.lock().map_err(|e| format!("lock failed: {e}"))?;
        let _ = conn.execute("PRAGMA journal_mode = WAL;", []);
        log::info!("Restored backup {}", id);
        Ok(())
    }

    pub fn delete_backup(&self, id: &str) -> Result<(), String> {
        let (file_name, ) = {
            let conn = self.conn.lock().map_err(|e| format!("lock failed: {e}"))?;
            let name: String = conn
                .query_row("SELECT file_name FROM backups WHERE id=?1", params![id], |r| r.get(0))
                .map_err(|e| format!("not found: {e}"))?;
            (name,)
        };
        let backups_dir = self.db_path.parent().unwrap().join("backups");
        let _ = std::fs::remove_file(backups_dir.join(&file_name));
        let conn = self.conn.lock().map_err(|e| format!("lock failed: {e}"))?;
        conn.execute("DELETE FROM backups WHERE id=?1", params![id])
            .map_err(|e| format!("delete failed: {e}"))?;
        Ok(())
    }

    pub fn get_db_path(&self) -> PathBuf {
        self.db_path.clone()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub id: String,
    pub created_at: String,
    pub file_name: String,
    pub size_bytes: i64,
    pub note: Option<String>,
}
