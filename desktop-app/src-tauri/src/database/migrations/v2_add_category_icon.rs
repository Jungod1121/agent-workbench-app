//! v2：projects 增加 category/icon/icon_color/meta（列已存在时忽略，兼容老库）

use rusqlite::Transaction;

pub fn up(tx: &Transaction) -> rusqlite::Result<()> {
    let _ = tx.execute("ALTER TABLE projects ADD COLUMN category TEXT NOT NULL DEFAULT 'general'", []);
    let _ = tx.execute("ALTER TABLE projects ADD COLUMN icon TEXT", []);
    let _ = tx.execute("ALTER TABLE projects ADD COLUMN icon_color TEXT", []);
    let _ = tx.execute("ALTER TABLE projects ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'", []);
    Ok(())
}