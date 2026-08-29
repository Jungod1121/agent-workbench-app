//! 数据库层：连接/初始化/迁移 + 类型定义 + DAO
//! 分层边界：dao 只有 SQL；services 有业务逻辑；commands 只做参数解析

pub mod dao;
pub mod schema;

use rusqlite::Connection;
use std::path::PathBuf;
use rusqlite::OptionalExtension;
use std::sync::{Mutex, MutexGuard};



use crate::services::backup_service;

// 保留历史位置别名：旧代码从 db.rs 引用这些类型
// （serde 字段与旧版完全一致，前端契约不变）

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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
    #[serde(default = "default_category")]
    pub category: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub icon_color: Option<String>,
    #[serde(default)]
    pub meta: Option<serde_json::Value>,
}

fn default_category() -> String {
    "general".to_string()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BackupInfo {
    pub id: String,
    pub created_at: String,
    pub file_name: String,
    pub size_bytes: i64,
    pub note: Option<String>,
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
        // journal mode WAL for crash safety（A 相对 B 的优势，保留）
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

    /// 供 services/dao 层使用：短暂持锁执行 SQL
    pub(crate) fn lock_conn(&self) -> Result<MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|e| format!("lock failed: {e}"))
    }

    pub(crate) fn db_path(&self) -> &PathBuf {
        &self.db_path
    }

    fn create_tables(&self) -> Result<(), String> {
        let conn = self.lock_conn()?;
        conn.execute_batch(schema::TABLES_DDL)
            .map_err(|e| format!("create tables failed: {e}"))?;
        conn.execute(schema::META_TABLE_DDL, [])
            .map_err(|e| format!("meta failed: {e}"))?;
        let v: Option<String> = conn
            .query_row(
                "SELECT value FROM meta WHERE key='schema_version'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| format!("query version failed: {e}"))?;
        if v.is_none() {
            conn.execute(
                "INSERT INTO meta (key, value) VALUES ('schema_version', ?1)",
                [schema::SCHEMA_VERSION.to_string()],
            )
            .map_err(|e| format!("insert version failed: {e}"))?;
        }
        Ok(())
    }

    fn apply_migrations(&self) -> Result<(), String> {
        let conn = self.lock_conn()?;
        let current: i32 = conn
            .query_row(
                "SELECT value FROM meta WHERE key='schema_version'",
                [],
                |r| r.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| format!("read version failed: {e}"))?
            .and_then(|s| s.parse().ok())
            .unwrap_or(1);
        if current < 2 {
            // v1→v2: add category/icon/icon_color/meta
            let _ = conn.execute("ALTER TABLE projects ADD COLUMN category TEXT NOT NULL DEFAULT 'general'", []);
            let _ = conn.execute("ALTER TABLE projects ADD COLUMN icon TEXT", []);
            let _ = conn.execute("ALTER TABLE projects ADD COLUMN icon_color TEXT", []);
            let _ = conn.execute("ALTER TABLE projects ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'", []);
            conn.execute(
                "UPDATE meta SET value=?1 WHERE key='schema_version'",
                ["2"],
            )
            .map_err(|e| format!("update version failed: {e}"))?;
            log::info!("Migrated DB v1→v2 (category/icon/meta)");
        }
        Ok(())
    }

    fn seed_if_empty(&self) -> Result<bool, String> {
        let count: i64 = {
            let conn = self.lock_conn()?;
            conn.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
                .map_err(|e| format!("count failed: {e}"))?
        };
        if count > 0 {
            return Ok(false);
        }
        // Try embedded projects.json (compile-time) for first-run seeding
        let embedded = include_str!("../../../web/projects.json");
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(embedded) {
            if let Some(arr) = val.get("projects").and_then(|v| v.as_array()) {
                if !arr.is_empty() {
                    let projects: Vec<Project> =
                        serde_json::from_value(serde_json::Value::Array(arr.clone())).unwrap_or_default();
                    if !projects.is_empty() {
                        {
                            let mut conn = self.lock_conn()?;
                            dao::project_dao::save_all(&mut conn, projects)?;
                        }
                        let _ = backup_service::snapshot(self, "seed-from-embedded");
                        log::info!("Seeded DB from embedded projects.json");
                        return Ok(true);
                    }
                }
            }
        }
        Ok(false)
    }

    #[allow(dead_code)]
    pub fn get_db_path(&self) -> PathBuf {
        self.db_path.clone()
    }
}

