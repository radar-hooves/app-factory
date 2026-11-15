//! Where a desktop app keeps a secret at rest, and how: a file that is
//! owner-only from the moment it exists, in the app's own data directory, on
//! every platform.
//!
//! One file backend, not a keyring on some platforms: macOS's Keychain cannot
//! be used without an Apple-issued certificate (a self-signed identity cannot
//! satisfy the partition list, and a cdhash changes every build), and a second
//! backend elsewhere is a second code path for the same protection class as
//! `~/.aws/credentials`. No function here logs a value or puts one in an error.

use std::collections::HashMap;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::{AppHandle, Manager, Runtime};

/// Writes `contents` to `path`, readable by the owner alone from the moment it
/// exists: a temporary file beside it is created `0600` (never a wider mode
/// tightened afterwards), synced, then renamed over `path`, so neither a
/// half-written file nor a readable one is ever on disk. A missing parent is
/// created `0700`.
pub fn write_private(path: &Path, contents: &[u8]) -> io::Result<()> {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        create_private_dir(parent)?;
    }
    let tmp = path.with_extension(format!(
        "tmp.{}.{}",
        std::process::id(),
        SEQ.fetch_add(1, Ordering::Relaxed)
    ));
    let written = (|| {
        let mut file = private_options().open(&tmp)?;
        file.write_all(contents)?;
        file.sync_all()
    })();
    let result = written.and_then(|()| std::fs::rename(&tmp, path));
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

fn private_options() -> std::fs::OpenOptions {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    options
}

fn create_private_dir(dir: &Path) -> io::Result<()> {
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    std::os::unix::fs::DirBuilderExt::mode(&mut builder, 0o700);
    builder.create(dir)
}

/// A keyed secret store: one owner-only JSON file of name to value.
pub struct SecretStore {
    path: PathBuf,
    lock: Mutex<()>,
}

impl SecretStore {
    /// A store in the file at `path`; the file is created on the first `set`.
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            lock: Mutex::new(()),
        }
    }

    /// The app's store: `credentials.json` in its data directory
    /// (`~/Library/Application Support/<identifier>` on macOS).
    pub fn for_app<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        Ok(Self::new(
            app.path().app_data_dir()?.join("credentials.json"),
        ))
    }

    pub fn get(&self, key: &str) -> io::Result<Option<String>> {
        let _held = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        Ok(self.read()?.remove(key))
    }

    pub fn set(&self, key: &str, value: &str) -> io::Result<()> {
        let _held = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut map = self.read()?;
        map.insert(key.to_string(), value.to_string());
        self.write(&map)
    }

    /// Idempotent: deleting a key that is not there succeeds.
    pub fn delete(&self, key: &str) -> io::Result<()> {
        let _held = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut map = self.read()?;
        if map.remove(key).is_none() {
            return Ok(());
        }
        self.write(&map)
    }

    /// A file that does not parse is an error, never an empty store: the next
    /// `set` would overwrite whatever secrets it held.
    fn read(&self) -> io::Result<HashMap<String, String>> {
        match std::fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!(
                        "secret store {} is not a JSON object of strings",
                        self.path.display()
                    ),
                )
            }),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(HashMap::new()),
            Err(e) => Err(e),
        }
    }

    fn write(&self, map: &HashMap<String, String>) -> io::Result<()> {
        let json = serde_json::to_vec_pretty(map).map_err(io::Error::other)?;
        write_private(&self.path, &json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_secret_round_trips_and_deletes() {
        let dir = tempfile::tempdir().unwrap();
        let store = SecretStore::new(dir.path().join("data").join("credentials.json"));
        assert_eq!(store.get("token").unwrap(), None);
        store.set("token", "s3cret").unwrap();
        store.set("other", "x").unwrap();
        assert_eq!(store.get("token").unwrap().as_deref(), Some("s3cret"));
        store.delete("token").unwrap();
        store.delete("token").unwrap();
        assert_eq!(store.get("token").unwrap(), None);
        assert_eq!(store.get("other").unwrap().as_deref(), Some("x"));
    }

    #[test]
    fn a_corrupt_store_is_refused_and_its_error_carries_no_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("credentials.json");
        std::fs::write(&path, "hunter2 not json").unwrap();
        let err = SecretStore::new(&path).set("k", "v").unwrap_err();
        assert!(!err.to_string().contains("hunter2"), "{err}");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "hunter2 not json");
    }

    #[test]
    fn a_write_leaves_no_temporary_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("token");
        write_private(&path, b"one").unwrap();
        write_private(&path, b"two").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"two");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn the_file_and_a_new_directory_are_owner_only_even_over_a_wider_file() {
        use std::os::unix::fs::PermissionsExt;
        let mode = |p: &Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sub").join("token");
        write_private(&path, b"one").unwrap();
        assert_eq!(mode(&path), 0o600);
        assert_eq!(mode(path.parent().unwrap()), 0o700);
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o644)).unwrap();
        write_private(&path, b"two").unwrap();
        assert_eq!(mode(&path), 0o600);
    }
}
