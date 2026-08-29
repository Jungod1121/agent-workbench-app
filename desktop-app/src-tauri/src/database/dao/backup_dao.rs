//! 备份 DAO：backups 表元数据 SQL + 备份文件落盘（checkpoint + copy + 保留清理）

use crate::database::BackupInfo;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};

pub const RETAIN_META: usize = 30;
pub const RETAIN_FILES: usize = 90;

pub fn backups_dir(db_path: &Path) -> PathBuf {
    db_path.parent().unwrap().join("backups")
}

/// checkpoint WAL → 拷贝 db/-wal/-shm → 写 meta → 保留清理（行为与旧版完全一致）
pub fn snapshot_files(db_path: &Path, conn: &Connection, id: &str, note: &str) -> Result<String, String> {
    let file_name = format!("{id}.db");
    let backups_dir = backups_dir(db_path);
    std::fs::create_dir_all(&backups_dir).map_err(|e| format!("mkdir backups failed: {e}"))?;
    let dst = backups_dir.join(&file_name);
    {
        // checkpoint WAL to ensure consistency
        let _ = conn.execute("PRAGMA wal_checkpoint(TRUNCATE);", []);
    }
    std::fs::copy(db_path, &dst).map_err(|e| format!("copy failed: {e}"))?;
    let wal = db_path.with_extension("db-wal");
    if wal.exists() {
        let _ = std::fs::copy(&wal, backups_dir.join(format!("{id}.wal")));
    }
    let shm = db_path.with_extension("db-shm");
    if shm.exists() {
        let _ = std::fs::copy(&shm, backups_dir.join(format!("{id}.shm")));
    }
    let size = std::fs::metadata(&dst).map(|m| m.len() as i64).unwrap_or(0);
    let now = chrono::Utc::now().to_rfc3339();
    insert_meta(conn, id, &now, &file_name, size, note)?;
    prune_meta(conn, RETAIN_META);
    prune_files(&backups_dir, RETAIN_FILES);
    log::info!("Backup created {id} {file_name}");
    Ok(id.to_string())
}

pub fn insert_meta(conn: &Connection, id: &str, created_at: &str, file_name: &str, size_bytes: i64, note: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO backups (id, created_at, file_name, size_bytes, note) VALUES (?1,?2,?3,?4,?5)",
        params![id, created_at, file_name, size_bytes, note],
    )
    .map_err(|e| format!("insert backup meta failed: {e}"))?;
    Ok(())
}

pub fn list(conn: &Connection, limit: i64) -> Result<Vec<BackupInfo>, String> {
    let mut stmt = conn
        .prepare("SELECT id, created_at, file_name, size_bytes, note FROM backups ORDER BY created_at DESC LIMIT ?1")
        .map_err(|e| format!("prepare failed: {e}"))?;
    let rows = stmt
        .query_map([limit], |row| {
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

pub fn get_file_name(conn: &Connection, id: &str) -> Result<String, String> {
    conn.query_row("SELECT file_name FROM backups WHERE id=?1", params![id], |r| r.get(0))
        .map_err(|e| format!("not found: {e}"))
}

pub fn delete_meta(conn: &Connection, id: &str) -> Result<(), String> {
    conn.execute("DELETE FROM backups WHERE id=?1", params![id])
        .map_err(|e| format!("delete failed: {e}"))?;
    Ok(())
}

pub fn prune_meta(conn: &Connection, keep: usize) {
    let _ = conn.execute(
        &format!(
            "DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY created_at DESC LIMIT {keep})"
        ),
        [],
    );
}

pub fn prune_files(backups_dir: &Path, keep: usize) {
    if let Ok(entries) = std::fs::read_dir(backups_dir) {
        let mut files: Vec<_> = entries.flatten().map(|e| e.path()).collect();
        files.sort();
        if files.len() > keep {
            for f in files.iter().take(files.len() - keep) {
                let _ = std::fs::remove_file(f);
            }
        }
    }
}
