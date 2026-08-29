//! 版本化迁移框架：PRAGMA user_version + SAVEPOINT 包裹 + 迁移前自动备份
//! （对标 CC Switch database/migration.rs，保留我们的 WAL 优势）

pub mod v1_init;
pub mod v2_add_category_icon;
pub mod v3_add_sync_changes;

use rusqlite::{Connection, OptionalExtension};
use std::path::Path;

pub struct Migration {
    pub version: i32,
    pub up: fn(&rusqlite::Transaction) -> rusqlite::Result<()>,
}

#[derive(Debug)]
pub enum MigrateError {
    TooNew { db_version: i32, app_max: i32 },
    Failed(String),
}

impl std::fmt::Display for MigrateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MigrateError::TooNew { db_version, app_max } => write!(
                f,
                "DB_TOO_NEW db_version={db_version} app_max={app_max}"
            ),
            MigrateError::Failed(e) => write!(f, "{e}"),
        }
    }
}

pub fn all() -> Vec<Migration> {
    vec![
        Migration { version: 1, up: v1_init::up },
        Migration { version: 2, up: v2_add_category_icon::up },
        Migration { version: 3, up: v3_add_sync_changes::up },
    ]
}

pub fn app_max_version() -> i32 {
    all().iter().map(|m| m.version).max().unwrap_or(0)
}

/// 读取当前版本：优先 PRAGMA user_version，兼容旧库 meta 表 schema_version
pub fn current_version(conn: &Connection) -> rusqlite::Result<i32> {
    let uv: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    let meta: Option<i32> = conn
        .query_row(
            "SELECT value FROM meta WHERE key='schema_version'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()?
        .and_then(|s| s.parse().ok());
    Ok(uv.max(meta.unwrap_or(0)))
}

/// 读取当前版本（含 TooNew 判断）
pub fn check_version(conn: &Connection) -> Result<i32, MigrateError> {
    let current = current_version(conn).map_err(|e| MigrateError::Failed(e.to_string()))?;
    let target = app_max_version();
    if current > target {
        return Err(MigrateError::TooNew { db_version: current, app_max: target });
    }
    Ok(current)
}

/// 执行迁移到最新版本。
/// 每个版本：迁移前自动备份（backups 表存在时）→ BEGIN 事务内 up() → commit + user_version。
/// up() 失败 → 事务自动回滚，user_version 保持旧值，不留脏数据。
pub fn run_migrations(
    conn: &mut Connection,
    db_path: &Path,
    migrations: &[Migration],
) -> Result<(), MigrateError> {
    let current = check_version(conn)?;
    let target = migrations.iter().map(|m| m.version).max().unwrap_or(0);
    if current >= target {
        return Ok(());
    }
    for m in migrations.iter().filter(|m| m.version > current) {
        // 迁移前自动备份（先备份再动 schema，出问题可还原）。
        // backups 表是 v1 建的：首次初始化时不存在则跳过（新库无需备份）。
        let backups_exist: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='backups'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .map(|n| n > 0)
            .unwrap_or(false);
        if backups_exist {
            crate::database::dao::backup_dao::snapshot_files(
                db_path,
                conn,
                &format!("pre-migrate-v{}", m.version),
                "pre-migrate",
            )
            .map_err(|e| MigrateError::Failed(e.to_string()))?;
        }
        let migrate = (|| -> rusqlite::Result<()> {
            let tx = conn.transaction()?;
            (m.up)(&tx)?;
            tx.commit()?;
            Ok(())
        })();
        match migrate {
            Ok(()) => {
                conn.pragma_update(None, "user_version", m.version)
                    .map_err(|e| MigrateError::Failed(e.to_string()))?;
                let _ = conn.execute(
                    "UPDATE meta SET value=?1 WHERE key='schema_version'",
                    [m.version.to_string()],
                );
                log::info!("Migrated DB to v{}", m.version);
            }
            Err(e) => {
                log::error!("Migration to v{} failed, rolled back: {}", m.version, e);
                return Err(MigrateError::Failed(format!(
                    "migration v{} failed (rolled back): {e}",
                    m.version
                )));
            }
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_conn() -> (Connection, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "aw-mig-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("t.db");
        let c = Connection::open(&db_path).unwrap();
        c.execute_batch(crate::database::schema::META_TABLE_DDL).unwrap();
        (c, db_path)
    }

    #[test]
    fn fresh_db_migrates_to_latest() {
        let (mut c, db_path) = test_conn();
        run_migrations(&mut c, &db_path, &all()).expect("migrate ok");
        let v: i32 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, app_max_version());
        // v3 预留表存在
        let n: i64 = c.query_row("SELECT COUNT(*) FROM sqlite_master WHERE name='sync_changes'", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        // 幂等：再跑一次不报错
        run_migrations(&mut c, &db_path, &all()).expect("idempotent ok");
    }

    #[test]
    fn failed_migration_rolls_back() {
        let (mut c, db_path) = test_conn();
        let boom = Migration {
            version: 99,
            up: |_tx| Err(rusqlite::Error::InvalidQuery),
        };
        let mut list = all();
        list.push(boom);
        let err = run_migrations(&mut c, &db_path, &list).unwrap_err();
        assert!(matches!(err, MigrateError::Failed(_)));
        // user_version 停在最新已成功版本（99 未提交）
        let v: i32 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, app_max_version());
    }

    #[test]
    fn too_new_detected() {
        let (mut c, db_path) = test_conn();
        c.pragma_update(None, "user_version", 999).unwrap();
        match check_version(&c) {
            Err(MigrateError::TooNew { db_version, .. }) => assert_eq!(db_version, 999),
            other => panic!("expected TooNew, got {other:?}"),
        }
    }
}
