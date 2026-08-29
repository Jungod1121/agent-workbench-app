//! 项目业务逻辑：读写、JSON 导入导出（SQL 一律走 project_dao）

use crate::database::dao::project_dao;
use crate::database::{Database, Project};
use std::path::Path;

pub fn list_all(db: &Database) -> Result<Vec<Project>, String> {
    if let Some((dbv, appv)) = db.too_new() {
        return Err(format!(
            "DB_TOO_NEW db_version={dbv} app_max={appv}（数据库版本过新，请用匹配版本的应用或恢复备份）"
        ));
    }
    let conn = db.lock_conn()?;
    project_dao::get_all(&conn)
}

pub fn save_all(db: &Database, projects: Vec<Project>) -> Result<(), String> {
    if db.too_new().is_some() {
        return Err("DB_TOO_NEW（数据库版本过新，禁止写入）".to_string());
    }
    let mut conn = db.lock_conn()?;
    project_dao::save_all(&mut conn, projects)
}

pub fn export_to_file(path: &Path, projects: &[Project]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&serde_json::json!({ "projects": projects }))
        .map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn import_from_file(path: &Path) -> Result<Vec<Project>, String> {
    let s = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let v: serde_json::Value = serde_json::from_str(&s).map_err(|e| e.to_string())?;
    let projects: Vec<Project> = v
        .get("projects")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    Ok(projects)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Prompt;

    fn test_db() -> Database {
        let dir = std::env::temp_dir().join(format!(
            "aw-p3-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        Database::init(dir).expect("init db")
    }

    fn sample(id: &str, name: &str, sort: i64, with_prompt: bool) -> Project {
        let now = "2026-08-29T00:00:00Z".to_string();
        Project {
            id: id.to_string(),
            name: name.to_string(),
            description: "desc".to_string(),
            stage: "idea".to_string(),
            paused: false,
            tags: vec!["t1".to_string()],
            prompts: if with_prompt {
                vec![Prompt {
                    id: format!("{id}-pr1"),
                    title: "v1".to_string(),
                    content: "hello".to_string(),
                    version: 1,
                    notes: None,
                    is_current: true,
                    created_at: now.clone(),
                }]
            } else {
                vec![]
            },
            created_at: now.clone(),
            updated_at: now,
            sort_index: sort,
            category: "work".to_string(),
            icon: None,
            icon_color: None,
            meta: None,
        }
    }

    #[test]
    fn save_and_list_roundtrip() {
        let db = test_db();
        let projects = vec![sample("p1", "Alpha", 0, true), sample("p2", "Beta", 1, false)];
        save_all(&db, projects.clone()).expect("save ok");
        let loaded = list_all(&db).expect("list ok");
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "p1");
        assert_eq!(loaded[0].name, "Alpha");
        assert_eq!(loaded[0].prompts.len(), 1);
        assert_eq!(loaded[0].prompts[0].content, "hello");
        assert_eq!(loaded[1].id, "p2");
    }

    #[test]
    fn save_empty_clears_all() {
        let db = test_db();
        save_all(&db, vec![sample("p1", "Alpha", 0, false)]).expect("save ok");
        save_all(&db, vec![]).expect("save empty ok");
        let loaded = list_all(&db).expect("list ok");
        assert!(loaded.is_empty());
    }

    #[test]
    fn import_export_roundtrip() {
        let projects = vec![sample("p1", "Alpha", 0, false)];
        let dir = std::env::temp_dir().join(format!("aw-p3-export-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("export.json");
        export_to_file(&file, &projects).expect("export ok");
        let imported = import_from_file(&file).expect("import ok");
        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0].name, "Alpha");
        let _ = std::fs::remove_file(&file);
    }
}
