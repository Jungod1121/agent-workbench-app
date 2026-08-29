//! v1：初始表结构（与旧 schema 完全一致）

use rusqlite::Transaction;

pub fn up(tx: &Transaction) -> rusqlite::Result<()> {
    tx.execute_batch(crate::database::schema::TABLES_DDL)
}