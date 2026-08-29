//! v3：同步变更追踪表（为阶段 6 变更级同步预留，本阶段仅建结构）

use rusqlite::Transaction;

pub fn up(tx: &Transaction) -> rusqlite::Result<()> {
    tx.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS sync_changes (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            op TEXT NOT NULL,
            payload TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );
        "#,
    )
}