//! 备份业务逻辑：快照/列表/恢复/删除（SQL 走 backup_dao，文件操作在此层编排）

use crate::database::dao::backup_dao;
use crate::database::{BackupInfo, Database};

pub fn snapshot(db: &Database, note: &str) -> Result<String, String> {
    // 同毫秒连拍会撞 backups.id 主键，追加纳秒保证唯一
    let nano = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let id = format!(
        "backup_{}_{:09}",
        chrono::Utc::now().format("%Y%m%d_%H%M%S_%3f"),
        nano
    );
    let conn = db.lock_conn()?;
    backup_dao::snapshot_files(db.db_path(), &conn, &id, note)?;
    Ok(id)
}

pub fn list(db: &Database) -> Result<Vec<BackupInfo>, String> {
    let conn = db.lock_conn()?;
    backup_dao::list(&conn, 50)
}

pub fn restore(db: &Database, id: &str) -> Result<(), String> {
    let file_name = {
        let conn = db.lock_conn()?;
        backup_dao::get_file_name(&conn, id)?
    };
    let src = backup_dao::backups_dir(db.db_path()).join(&file_name);
    if !src.exists() {
        return Err(format!("backup file missing: {:?}", src));
    }
    // safety backup current before restore
    let _ = snapshot(db, "pre-restore");
    {
        let conn = db.lock_conn()?;
        let _ = conn.execute("PRAGMA wal_checkpoint(TRUNCATE);", []);
    }
    std::fs::copy(&src, db.db_path()).map_err(|e| format!("restore copy failed: {e}"))?;
    // remove wal/shm to force clean reopen
    let _ = std::fs::remove_file(db.db_path().with_extension("db-wal"));
    let _ = std::fs::remove_file(db.db_path().with_extension("db-shm"));
    {
        let conn = db.lock_conn()?;
        let _ = conn.execute("PRAGMA journal_mode = WAL;", []);
    }
    log::info!("Restored backup {id}");
    Ok(())
}

pub fn delete(db: &Database, id: &str) -> Result<(), String> {
    let file_name = {
        let conn = db.lock_conn()?;
        backup_dao::get_file_name(&conn, id)?
    };
    let _ = std::fs::remove_file(backup_dao::backups_dir(db.db_path()).join(&file_name));
    let conn = db.lock_conn()?;
    backup_dao::delete_meta(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::project_service;

    fn test_db() -> Database {
        let dir = std::env::temp_dir().join(format!(
            "aw-bk-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        Database::init(dir).expect("init db")
    }

    #[test]
    fn snapshot_list_restore_delete() {
        let db = test_db();
        let id1 = snapshot(&db, "one").expect("snapshot 1 ok");
        let id2 = snapshot(&db, "two").expect("snapshot 2 ok");
        let backups = list(&db).expect("list ok");
        assert!(backups.len() >= 2);
        assert!(backups.iter().any(|b| b.id == id1));
        assert!(backups.iter().any(|b| b.id == id2));

        // restore 最早的一份不报错（内部会先做 pre-restore 安全备份）
        restore(&db, &id1).expect("restore ok");

        delete(&db, &id1).expect("delete ok");
        let backups = list(&db).expect("list ok");
        assert!(!backups.iter().any(|b| b.id == id1));
    }

    #[test]
    fn retention_prunes_oldest() {
        let db = test_db();
        // 连拍 35 份：RETAIN_META=30，应只剩最新 30 份 meta 与文件
        for i in 0..35 {
            snapshot(&db, &format!("n{i}")).expect("snapshot ok");
        }
        let backups = list(&db).expect("list ok");
        assert!(backups.len() <= backup_dao::RETAIN_META, "meta retained: {}", backups.len());
        // 文件也应被 prune（<= RETAIN_FILES）
        let dir = backup_dao::backups_dir(db.db_path());
        let files = std::fs::read_dir(&dir).map(|rd| rd.count()).unwrap_or(0);
        assert!(files <= backup_dao::RETAIN_FILES + 3, "files retained: {files}");
    }

    #[test]
    fn restore_missing_errors() {
        let db = test_db();
        assert!(restore(&db, "nope_missing").is_err());
    }
}
