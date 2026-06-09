use serde::Serialize;
use std::{
    env, fs,
    io::Write,
    net::{TcpListener, TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant, UNIX_EPOCH},
};
use tauri_plugin_dialog::DialogExt;

const DEFAULT_TARGET_DEV_HOST: &str = "127.0.0.1";
const DEFAULT_TARGET_DEV_PORT: u16 = 5174;
const DEFAULT_TARGET_DEV_PORT_SEARCH_LIMIT: u16 = 25;
const DEFAULT_TARGET_DEV_TASK: &str = "dev";
const DEFAULT_TARGET_DEV_WAIT_TIMEOUT_MS: u64 = 60_000;
const DEFAULT_PREVIEW_ROUTE_BASE: &str = "/notes";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultMetadata {
    name: String,
    preview_origin: String,
    preview_route_base: String,
    root: String,
    target_project_root: Option<String>,
}

struct TargetPreviewMetadata {
    origin: String,
    project_root: Option<String>,
    route_base: String,
}

struct TargetPreviewServer {
    child: Child,
    host: String,
    origin: String,
    port: u16,
    project_root: String,
    root: String,
}

#[derive(Default)]
struct TargetPreviewServerState {
    server: Mutex<Option<TargetPreviewServer>>,
}

impl Drop for TargetPreviewServer {
    fn drop(&mut self) {
        stop_child(&mut self.child);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultFileSnapshot {
    path: String,
    size: u64,
    updated_at: f64,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TargetPreviewServerState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            datahoarder_default_vault_root,
            datahoarder_pick_vault_root,
            datahoarder_validate_vault_root,
            datahoarder_ensure_vault_preview_origin,
            datahoarder_list_vault_files,
            datahoarder_read_vault_file,
            datahoarder_write_vault_file,
            datahoarder_create_vault_file,
            datahoarder_delete_vault_file,
            datahoarder_move_vault_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn datahoarder_default_vault_root() -> Result<Option<VaultMetadata>, String> {
    let Some(root) = get_default_vault_root() else {
        return Ok(None);
    };

    validate_vault_root(root).map(Some)
}

#[tauri::command]
fn datahoarder_pick_vault_root(
    app: tauri::AppHandle,
) -> Result<Option<VaultMetadata>, String> {
    let Some(path) = app
        .dialog()
        .file()
        .set_title("Open Datahoarder Folder")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|error| {
        format!("Selected folder could not be converted to a local path: {error}")
    })?;

    validate_vault_root(path.to_string_lossy().to_string()).map(Some)
}

#[tauri::command]
fn datahoarder_validate_vault_root(root: String) -> Result<VaultMetadata, String> {
    validate_vault_root(root)
}

#[tauri::command]
fn datahoarder_ensure_vault_preview_origin(
    root: String,
    preview_server: tauri::State<'_, TargetPreviewServerState>,
) -> Result<VaultMetadata, String> {
    validate_vault_root_with_preview(root, &preview_server)
}

#[tauri::command]
fn datahoarder_list_vault_files(root: String) -> Result<Vec<VaultFileSnapshot>, String> {
    let root = validate_vault_root(root)?;
    let root_path = PathBuf::from(&root.root);
    let mut files = Vec::new();

    collect_vault_files(&root_path, "", &mut files)?;
    files.sort_by(|left, right| left.path.to_lowercase().cmp(&right.path.to_lowercase()));

    Ok(files)
}

#[tauri::command]
fn datahoarder_read_vault_file(root: String, path: String) -> Result<String, String> {
    let root = validate_vault_root(root)?;
    let path = resolve_vault_file_path(&root.root, &path)?;

    fs::read_to_string(path).map_err(format_io_error)
}

#[tauri::command]
fn datahoarder_write_vault_file(root: String, path: String, content: String) -> Result<(), String> {
    let root = validate_vault_root(root)?;
    let path = resolve_vault_file_path(&root.root, &path)?;

    fs::write(path, content).map_err(format_io_error)
}

#[tauri::command]
fn datahoarder_create_vault_file(
    root: String,
    path: String,
    content: String,
) -> Result<String, String> {
    let root = validate_vault_root(root)?;
    let path = normalize_vault_path(&path)?;
    let file_path =
        PathBuf::from(&root.root).join(path.replace('/', std::path::MAIN_SEPARATOR_STR));

    if file_path.exists() {
        return Err(format!("A file already exists at {path}."));
    }

    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(format_io_error)?;
    }

    fs::write(file_path, content).map_err(format_io_error)?;

    Ok(path)
}

#[tauri::command]
fn datahoarder_delete_vault_file(root: String, path: String) -> Result<(), String> {
    let root = validate_vault_root(root)?;
    let path = resolve_vault_file_path(&root.root, &path)?;

    fs::remove_file(path).map_err(format_io_error)
}

#[tauri::command]
fn datahoarder_move_vault_file(
    root: String,
    current_path: String,
    next_path: String,
    content: String,
) -> Result<String, String> {
    let root = validate_vault_root(root)?;
    let current_path = normalize_vault_path(&current_path)?;
    let next_path = normalize_vault_path(&next_path)?;
    let current_file_path =
        PathBuf::from(&root.root).join(current_path.replace('/', std::path::MAIN_SEPARATOR_STR));
    let next_file_path =
        PathBuf::from(&root.root).join(next_path.replace('/', std::path::MAIN_SEPARATOR_STR));

    if !current_file_path.is_file() {
        return Err(format!("{current_path} is not a file."));
    }

    if next_file_path.exists() {
        return Err(format!("A file already exists at {next_path}."));
    }

    fs::write(&current_file_path, content).map_err(format_io_error)?;

    if let Some(parent) = next_file_path.parent() {
        fs::create_dir_all(parent).map_err(format_io_error)?;
    }

    fs::rename(current_file_path, next_file_path).map_err(format_io_error)?;

    Ok(next_path)
}

fn get_default_vault_root() -> Option<String> {
    [
        "DATAHOARDER_OPEN_FOLDER",
        "DATAHOARDER_VAULT_ROOT",
        "DATAHOARDER_WORKSPACE_ROOT",
    ]
    .iter()
    .find_map(|name| {
        let value = env::var(name).ok()?;
        let trimmed = value.trim();

        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn validate_vault_root(root: String) -> Result<VaultMetadata, String> {
    let root = normalize_root_path(root)?;
    let metadata = fs::metadata(&root).map_err(format_io_error)?;

    if !metadata.is_dir() {
        return Err(format!("Vault root is not a directory: {}", root.display()));
    }

    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .map(String::from)
        .unwrap_or_else(|| root.to_string_lossy().to_string());

    Ok(VaultMetadata {
        name,
        preview_origin: String::new(),
        preview_route_base: get_configured_preview_route_base(),
        root: root.to_string_lossy().to_string(),
        target_project_root: None,
    })
}

fn validate_vault_root_with_preview(
    root: String,
    preview_server: &TargetPreviewServerState,
) -> Result<VaultMetadata, String> {
    let mut metadata = validate_vault_root(root)?;
    let preview_metadata = start_target_preview_server(&metadata.root, preview_server)?;

    if let Some(preview_metadata) = preview_metadata {
        metadata.preview_origin = preview_metadata.origin;
        metadata.preview_route_base = preview_metadata.route_base;
        metadata.target_project_root = preview_metadata.project_root;
    }

    Ok(metadata)
}

fn start_target_preview_server(
    root: &str,
    preview_server: &TargetPreviewServerState,
) -> Result<Option<TargetPreviewMetadata>, String> {
    if is_target_dev_server_disabled() {
        return Ok(None);
    }

    if let Some(metadata) = get_running_target_preview_metadata(root, preview_server)? {
        return Ok(Some(metadata));
    }

    stop_managed_target_preview_server(preview_server)?;

    let root_path = PathBuf::from(root);
    let Some(project_root) = resolve_target_project_root(&root_path)? else {
        return Ok(None);
    };
    let host = normalize_host(
        get_trimmed_env("DATAHOARDER_TARGET_DEV_HOST")
            .unwrap_or_else(|| DEFAULT_TARGET_DEV_HOST.to_string()),
    )?;
    let preferred_port = normalize_port(
        get_trimmed_env("DATAHOARDER_TARGET_DEV_PORT")
            .unwrap_or_else(|| DEFAULT_TARGET_DEV_PORT.to_string()),
        "preferred target dev port",
    )?;
    let search_limit = normalize_search_limit(
        get_trimmed_env("DATAHOARDER_TARGET_DEV_PORT_SEARCH_LIMIT")
            .unwrap_or_else(|| DEFAULT_TARGET_DEV_PORT_SEARCH_LIMIT.to_string()),
    )?;
    let task = normalize_task_name(
        get_trimmed_env("DATAHOARDER_TARGET_DEV_TASK")
            .unwrap_or_else(|| DEFAULT_TARGET_DEV_TASK.to_string()),
    )?;
    let port = find_available_port(&host, preferred_port, search_limit)?;
    let origin = get_dev_url(&host, port);
    let mut child = create_target_preview_command(&project_root, &task, &host, port, &origin)
        .spawn()
        .map_err(format_io_error)?;

    if let Err(error) = wait_for_tcp_response(&host, port, &mut child) {
        stop_child(&mut child);
        return Err(error);
    }

    let project_root_text = project_root.to_string_lossy().to_string();
    let metadata = TargetPreviewMetadata {
        origin: origin.clone(),
        project_root: Some(project_root_text.clone()),
        route_base: get_configured_preview_route_base(),
    };
    let mut server = preview_server.server.lock().map_err(format_poison_error)?;

    *server = Some(TargetPreviewServer {
        child,
        host,
        origin: origin.clone(),
        port,
        project_root: project_root_text,
        root: root.to_string(),
    });

    Ok(Some(metadata))
}

fn get_running_target_preview_metadata(
    root: &str,
    preview_server: &TargetPreviewServerState,
) -> Result<Option<TargetPreviewMetadata>, String> {
    let mut server = preview_server.server.lock().map_err(format_poison_error)?;
    let Some(target) = server.as_mut() else {
        return Ok(None);
    };

    if target.root != root {
        return Ok(None);
    }

    if target.child.try_wait().map_err(format_io_error)?.is_none()
        && try_connect_target_preview_server(&target.host, target.port).is_ok()
    {
        return Ok(Some(TargetPreviewMetadata {
            origin: target.origin.clone(),
            project_root: Some(target.project_root.clone()),
            route_base: get_configured_preview_route_base(),
        }));
    }

    *server = None;

    Ok(None)
}

fn stop_managed_target_preview_server(
    preview_server: &TargetPreviewServerState,
) -> Result<(), String> {
    let mut server = preview_server.server.lock().map_err(format_poison_error)?;

    *server = None;

    Ok(())
}

fn create_target_preview_command(
    project_root: &Path,
    task: &str,
    host: &str,
    port: u16,
    origin: &str,
) -> Command {
    let mut command = Command::new(get_trimmed_env("DENO").unwrap_or_else(|| "deno".to_string()));

    command
        .args([
            "task",
            task,
            "--host",
            host,
            "--port",
            &port.to_string(),
            "--strictPort",
        ])
        .current_dir(project_root)
        .env("DATAHOARDER_TARGET_DEV_ORIGIN", origin)
        .env("DATAHOARDER_TARGET_DEV_ROOT", project_root)
        .env("HOST", host)
        .env("PORT", port.to_string())
        .env("VITE_HOST", host)
        .env("VITE_PORT", port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    command
}

fn resolve_target_project_root(root: &Path) -> Result<Option<PathBuf>, String> {
    if let Some(configured_root) = get_trimmed_env("DATAHOARDER_TARGET_DEV_ROOT") {
        let project_root = normalize_root_path(configured_root)?;
        let metadata = fs::metadata(&project_root).map_err(format_io_error)?;

        if !metadata.is_dir() {
            return Err(format!(
                "Target Deno project root is not a directory: {}",
                project_root.display(),
            ));
        }

        if has_deno_config(&project_root) {
            return Ok(Some(project_root));
        }

        return Err(format!(
            "Target Deno project root must contain deno.json or deno.jsonc: {}",
            project_root.display(),
        ));
    }

    find_nearest_deno_project_root(root)
}

fn find_nearest_deno_project_root(root: &Path) -> Result<Option<PathBuf>, String> {
    let mut current = root.to_path_buf();

    loop {
        if has_deno_config(&current) {
            return Ok(Some(current));
        }

        let Some(parent) = current.parent() else {
            return Ok(None);
        };

        if parent == current {
            return Ok(None);
        }

        current = parent.to_path_buf();
    }
}

fn has_deno_config(root: &Path) -> bool {
    ["deno.json", "deno.jsonc"]
        .iter()
        .any(|name| root.join(name).is_file())
}

fn find_available_port(host: &str, preferred_port: u16, search_limit: u16) -> Result<u16, String> {
    let max_port = preferred_port.saturating_add(search_limit);

    for port in preferred_port..=max_port {
        if can_bind_port(host, port) {
            return Ok(port);
        }
    }

    Err(format!(
        "Could not find an available target dev port from {preferred_port} through {max_port}.",
    ))
}

fn can_bind_port(host: &str, port: u16) -> bool {
    TcpListener::bind((host, port)).is_ok()
}

fn wait_for_tcp_response(host: &str, port: u16, child: &mut Child) -> Result<(), String> {
    let timeout = Duration::from_millis(get_target_dev_wait_timeout_ms()?);
    let deadline = Instant::now() + timeout;
    let mut last_error = String::new();

    while Instant::now() < deadline {
        if let Some(status) = child.try_wait().map_err(format_io_error)? {
            return Err(format!(
                "Target Deno server exited before responding at {}: {status}.",
                get_dev_url(host, port),
            ));
        }

        match try_connect_target_preview_server(host, port) {
            Ok(()) => return Ok(()),
            Err(error) => last_error = error,
        }

        thread::sleep(Duration::from_millis(200));
    }

    Err(format!(
        "Timed out waiting for target Deno server at {}: {last_error}",
        get_dev_url(host, port),
    ))
}

fn try_connect_target_preview_server(host: &str, port: u16) -> Result<(), String> {
    let address = (host, port)
        .to_socket_addrs()
        .map_err(format_io_error)?
        .next()
        .ok_or_else(|| format!("Could not resolve target host: {host}"))?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(500))
        .map_err(format_io_error)?;

    stream
        .set_write_timeout(Some(Duration::from_millis(500)))
        .map_err(format_io_error)?;
    let request = format!("GET / HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n");

    stream
        .write_all(request.as_bytes())
        .map_err(format_io_error)
}

fn stop_child(child: &mut Child) {
    if child.try_wait().ok().flatten().is_some() {
        return;
    }

    if child.kill().is_err() {
        return;
    }

    let _ = child.wait();
}

fn is_target_dev_server_disabled() -> bool {
    let value = get_trimmed_env("DATAHOARDER_TARGET_DEV_DISABLED")
        .unwrap_or_default()
        .to_lowercase();

    value == "1" || value == "true"
}

fn get_dev_url(host: &str, port: u16) -> String {
    let normalized_host = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };

    format!("http://{normalized_host}:{port}")
}

fn get_configured_preview_route_base() -> String {
    normalize_route_base(
        &get_trimmed_env("DATAHOARDER_PREVIEW_ROUTE_BASE")
            .unwrap_or_else(|| DEFAULT_PREVIEW_ROUTE_BASE.to_string()),
    )
}

fn normalize_route_base(route_base: &str) -> String {
    let route_base = route_base.trim();

    if route_base.is_empty() || route_base == "/" {
        return String::new();
    }

    format!("/{}", route_base.trim_matches('/'))
}

fn get_target_dev_wait_timeout_ms() -> Result<u64, String> {
    match get_trimmed_env("DATAHOARDER_TARGET_DEV_WAIT_TIMEOUT_MS") {
        Some(value) => value
            .parse::<u64>()
            .map_err(|_| format!("Invalid target dev wait timeout: {value}")),
        None => Ok(DEFAULT_TARGET_DEV_WAIT_TIMEOUT_MS),
    }
}

fn normalize_host(value: String) -> Result<String, String> {
    let host = value.trim();

    if host.is_empty() {
        return Err("A target dev host is required.".to_string());
    }

    if !host
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || ".:-".contains(character))
    {
        return Err(format!("Invalid target dev host: {host}"));
    }

    Ok(host.to_string())
}

fn normalize_port(value: String, label: &str) -> Result<u16, String> {
    let port = value
        .parse::<u16>()
        .map_err(|_| format!("Invalid {label}: {value}"))?;

    if port == 0 {
        return Err(format!("Invalid {label}: {value}"));
    }

    Ok(port)
}

fn normalize_search_limit(value: String) -> Result<u16, String> {
    let limit = value
        .parse::<u16>()
        .map_err(|_| format!("Invalid target dev port search limit: {value}"))?;

    if limit > 200 {
        return Err(format!("Invalid target dev port search limit: {value}"));
    }

    Ok(limit)
}

fn normalize_task_name(value: String) -> Result<String, String> {
    let task = value.trim();

    if task.is_empty()
        || task.chars().any(char::is_whitespace)
        || task
            .chars()
            .any(|character| matches!(character, '"' | '\'' | '`'))
    {
        return Err(format!("Invalid target Deno task name: {value}"));
    }

    Ok(task.to_string())
}

fn get_trimmed_env(name: &str) -> Option<String> {
    env::var(name).ok().and_then(|value| {
        let trimmed = value.trim();

        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_root_path(root: String) -> Result<PathBuf, String> {
    let trimmed = root.trim();

    if trimmed.is_empty() {
        return Err("Vault root is required.".to_string());
    }

    let path = PathBuf::from(expand_home_path(trimmed)?);

    if path.is_absolute() {
        Ok(path)
    } else {
        env::current_dir()
            .map(|cwd| cwd.join(path))
            .map_err(format_io_error)
    }
}

fn expand_home_path(path: &str) -> Result<PathBuf, String> {
    if path == "~" {
        return get_home_directory().ok_or_else(|| {
            "Could not resolve ~ because no home directory is available.".to_string()
        });
    }

    if let Some(rest) = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        let home = get_home_directory().ok_or_else(|| {
            "Could not resolve ~ because no home directory is available.".to_string()
        })?;

        return Ok(home.join(rest.replace('/', std::path::MAIN_SEPARATOR_STR)));
    }

    Ok(PathBuf::from(path))
}

fn get_home_directory() -> Option<PathBuf> {
    env::var_os("HOME")
        .filter(|value| !value.is_empty())
        .or_else(|| env::var_os("USERPROFILE").filter(|value| !value.is_empty()))
        .or_else(|| {
            let drive = env::var_os("HOMEDRIVE")?;
            let path = env::var_os("HOMEPATH")?;

            if drive.is_empty() || path.is_empty() {
                None
            } else {
                let mut home = drive;
                home.push(path);
                Some(home)
            }
        })
        .map(PathBuf::from)
}

fn resolve_vault_file_path(root: &str, path: &str) -> Result<PathBuf, String> {
    let path = normalize_vault_path(path)?;
    let file_path = PathBuf::from(root).join(path.replace('/', std::path::MAIN_SEPARATOR_STR));

    if !file_path.is_file() {
        return Err(format!("{path} is not a file."));
    }

    Ok(file_path)
}

fn normalize_vault_path(path: &str) -> Result<String, String> {
    let trimmed = path.trim().replace('\\', "/");

    if trimmed.is_empty() {
        return Err("File path is required.".to_string());
    }

    if Path::new(&trimmed).is_absolute() || trimmed.contains(':') {
        return Err("Use a path relative to the opened vault.".to_string());
    }

    let segments = trimmed
        .trim_start_matches("./")
        .split('/')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();

    if segments.is_empty() {
        return Err("File path is required.".to_string());
    }

    if segments
        .iter()
        .any(|segment| *segment == "." || *segment == "..")
    {
        return Err("File paths cannot contain . or .. segments.".to_string());
    }

    Ok(segments.join("/"))
}

fn collect_vault_files(
    root: &Path,
    parent_path: &str,
    files: &mut Vec<VaultFileSnapshot>,
) -> Result<(), String> {
    let directory = if parent_path.is_empty() {
        root.to_path_buf()
    } else {
        root.join(parent_path.replace('/', std::path::MAIN_SEPARATOR_STR))
    };

    for entry in fs::read_dir(directory).map_err(format_io_error)? {
        let entry = entry.map_err(format_io_error)?;
        let name = entry.file_name().to_string_lossy().to_string();
        let path = if parent_path.is_empty() {
            name.clone()
        } else {
            format!("{parent_path}/{name}")
        };
        let metadata = entry.metadata().map_err(format_io_error)?;

        if metadata.is_dir() {
            if !is_ignored_directory(&name) {
                collect_vault_files(root, &path, files)?;
            }

            continue;
        }

        if !metadata.is_file() || !is_editable_text_file(&path) {
            continue;
        }

        files.push(VaultFileSnapshot {
            path,
            size: metadata.len(),
            updated_at: metadata
                .modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis() as f64)
                .unwrap_or(0.0),
        });
    }

    Ok(())
}

fn is_ignored_directory(name: &str) -> bool {
    matches!(
        name,
        ".git" | ".svelte-kit" | "build" | "dist" | "node_modules"
    )
}

fn is_editable_text_file(path: &str) -> bool {
    let path = Path::new(path);
    let Some(file_name) = path.file_name().and_then(|file_name| file_name.to_str()) else {
        return false;
    };

    if file_name.is_empty() || file_name.starts_with('.') {
        return false;
    }

    let Some(extension) = path.extension().and_then(|extension| extension.to_str()) else {
        return true;
    };

    matches!(
        extension.to_lowercase().as_str(),
        "base"
            | "css"
            | "csv"
            | "html"
            | "js"
            | "json"
            | "md"
            | "scss"
            | "svelte"
            | "svx"
            | "ts"
            | "txt"
            | "yaml"
            | "yml"
    )
}

fn format_io_error(error: std::io::Error) -> String {
    error.to_string()
}

fn format_poison_error<T>(error: std::sync::PoisonError<T>) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        env,
        ffi::OsString,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Mutex, OnceLock,
        },
    };

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();

        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn expands_current_user_home_paths() {
        let _guard = env_lock().lock().expect("env lock was poisoned");
        let saved_home = EnvBackup::capture(["HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"]);
        let home = env::temp_dir().join("datahoarder-home");

        env::set_var("HOME", &home);
        env::remove_var("USERPROFILE");
        env::remove_var("HOMEDRIVE");
        env::remove_var("HOMEPATH");

        let expanded = expand_home_path("~/_/obsidian/obsidian").expect("home path should expand");

        assert_eq!(expanded, home.join("_").join("obsidian").join("obsidian"),);

        saved_home.restore();
    }

    #[test]
    fn validates_home_relative_vault_roots() {
        let _guard = env_lock().lock().expect("env lock was poisoned");
        let saved_home = EnvBackup::capture(["HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"]);
        let home = unique_temp_path("datahoarder-home");
        let vault = home.join("_").join("obsidian").join("obsidian");

        fs::create_dir_all(&vault).expect("test vault should be created");
        env::set_var("HOME", &home);
        env::remove_var("USERPROFILE");
        env::remove_var("HOMEDRIVE");
        env::remove_var("HOMEPATH");

        let metadata = validate_vault_root("~/_/obsidian/obsidian".to_string())
            .expect("home-relative vault root should validate");

        assert_eq!(metadata.name, "obsidian");
        assert_eq!(metadata.root, vault.to_string_lossy());

        saved_home.restore();
        fs::remove_dir_all(home).expect("test home should be removed");
    }

    #[test]
    fn finds_nearest_ancestor_deno_project_root() {
        let project_root = unique_temp_path("datahoarder-project-root");
        let nested_root = project_root.join("src").join("routes").join("notes");

        fs::create_dir_all(&nested_root).expect("nested project root should be created");
        fs::write(project_root.join("deno.json"), "{}").expect("deno config should be created");

        let resolved_root = find_nearest_deno_project_root(&nested_root)
            .expect("project root lookup should not fail");

        assert_eq!(resolved_root, Some(project_root.clone()));

        fs::remove_dir_all(project_root).expect("project root should be removed");
    }

    #[test]
    fn returns_no_target_project_root_without_deno_config() {
        let project_root = unique_temp_path("datahoarder-project-root");

        fs::create_dir_all(&project_root).expect("project root should be created");

        let resolved_root = find_nearest_deno_project_root(&project_root)
            .expect("project root lookup should not fail");

        assert_eq!(resolved_root, None);

        fs::remove_dir_all(project_root).expect("project root should be removed");
    }

    #[test]
    fn treats_extensionless_vault_files_as_editable_text() {
        assert!(is_editable_text_file("Notes/Capture"));
        assert!(is_editable_text_file("README"));
        assert!(is_editable_text_file("Notes/Capture.md"));
        assert!(!is_editable_text_file(".env"));
        assert!(!is_editable_text_file("image.png"));
    }

    struct EnvBackup {
        values: Vec<(&'static str, Option<OsString>)>,
    }

    impl EnvBackup {
        fn capture(names: impl IntoIterator<Item = &'static str>) -> Self {
            Self {
                values: names
                    .into_iter()
                    .map(|name| (name, env::var_os(name)))
                    .collect(),
            }
        }

        fn restore(self) {
            for (name, value) in self.values {
                if let Some(value) = value {
                    env::set_var(name, value);
                } else {
                    env::remove_var(name);
                }
            }
        }
    }

    fn unique_temp_path(prefix: &str) -> PathBuf {
        static NEXT_ID: AtomicUsize = AtomicUsize::new(0);

        env::temp_dir().join(format!(
            "{prefix}-{}-{}",
            std::process::id(),
            NEXT_ID.fetch_add(1, Ordering::Relaxed),
        ))
    }
}
