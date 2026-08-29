//! 项目表 DAO：只有 SQL，输入输出均为强类型

use crate::database::{Project, Prompt};
use rusqlite::{params, Connection};

pub fn get_all(conn: &Connection) -> Result<Vec<Project>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, stage, paused, tags, sort_index, category, icon, icon_color, meta, created_at, updated_at FROM projects ORDER BY sort_index ASC, updated_at DESC",
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
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, String>(12)?,
            ))
        })
        .map_err(|e| format!("query failed: {e}"))?;

    let mut projects: Vec<Project> = Vec::new();
    for r in project_rows {
        let (id, name, description, stage, paused, tags_json, sort_index, category, icon, icon_color, meta_json, created_at, updated_at) =
            r.map_err(|e| format!("row failed: {e}"))?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
        let meta: Option<serde_json::Value> = if meta_json.trim().is_empty() || meta_json == "{}" {
            None
        } else {
            serde_json::from_str(&meta_json).ok()
        };
        // load prompts for this project
        let mut p_stmt = conn
            .prepare(
                "SELECT id, title, content, version, notes, is_current, created_at FROM prompts WHERE project_id=?1 ORDER BY version DESC",
            )
            .map_err(|e| format!("prepare prompts failed: {e}"))?;
        let prompt_rows = p_stmt
            .query_map(params![id.clone()], |row| {
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
            category: if category.is_empty() { "general".to_string() } else { category },
            icon,
            icon_color,
            meta,
        });
    }
    Ok(projects)
}

pub fn save_all(conn: &mut Connection, projects: Vec<Project>) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| format!("tx failed: {e}"))?;
    // clear existing (keep order: delete prompts first due to FK, then projects)
    tx.execute("DELETE FROM prompts", [])
        .map_err(|e| format!("delete prompts failed: {e}"))?;
    tx.execute("DELETE FROM projects", [])
        .map_err(|e| format!("delete projects failed: {e}"))?;
    for p in projects {
        let tags_json = serde_json::to_string(&p.tags).unwrap_or_else(|_| "[]".to_string());
        let meta_json = p
            .meta
            .as_ref()
            .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "{}".to_string()))
            .unwrap_or_else(|| "{}".to_string());
        tx.execute(
            "INSERT INTO projects (id, name, description, stage, paused, tags, sort_index, category, icon, icon_color, meta, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
            params![
                p.id,
                p.name,
                p.description,
                p.stage,
                if p.paused { 1 } else { 0 },
                tags_json,
                p.sort_index,
                p.category,
                p.icon,
                p.icon_color,
                meta_json,
                p.created_at,
                p.updated_at
            ],
        )
        .map_err(|e| format!("insert project {} failed: {e}", p.id))?;
        for pr in p.prompts {
            tx.execute(
                "INSERT INTO prompts (id, project_id, title, content, version, notes, is_current, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![pr.id, p.id, pr.title, pr.content, pr.version, pr.notes, if pr.is_current { 1 } else { 0 }, pr.created_at],
            )
            .map_err(|e| format!("insert prompt {} failed: {e}", pr.id))?;
        }
    }
    tx.commit().map_err(|e| format!("commit failed: {e}"))?;
    Ok(())
}
