//! Where a desktop app keeps a secret at rest, and how.
//!
//! [`write_private`] is a file that is owner-only from the moment it exists.
//! [`SecretStore`] keeps keyed secrets: the native keyring (Secret Service,
//! Credential Manager) in a Linux or Windows release build, and a `0600` JSON
//! file in the app's data directory on macOS and in every debug build.
//! macOS never uses the Keychain: without an Apple-issued certificate a
//! self-signed identity cannot satisfy its partition list, and a cdhash
//! changes every build, so each rebuild would prompt. A debug build uses the
//! file too, so a developer's rebuild is signed in like the installed app.
//! (`rules-library/stacks/tauri.md` §macOS signing and the keychain.)
//!
//! No function here logs a value or puts one in an error.

use std::collections::HashMap;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

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

/// A keyed secret store for one service (the app's identifier by default).
/// [`with_service`](Self::with_service) hands out the app's other services over
/// the same file under the same lock.
pub struct SecretStore {
    shared: Arc<Shared>,
    service: String,
}

struct Shared {
    path: PathBuf,
    lock: Mutex<()>,
}

/// Service, then key, then value: the file's shape.
type Entries = HashMap<String, HashMap<String, String>>;

impl SecretStore {
    /// A store for `service`, whose file backend is the file at `path`, created
    /// on the first `set`.
    pub fn new(service: impl Into<String>, path: impl Into<PathBuf>) -> Self {
        Self {
            shared: Arc::new(Shared {
                path: path.into(),
                lock: Mutex::new(()),
            }),
            service: service.into(),
        }
    }

    /// A store for another service in the same file, sharing this one's lock,
    /// so concurrent writes to different services cannot lose one. Entries an
    /// earlier release wrote under that service name are read as they are.
    pub fn with_service(&self, service: impl Into<String>) -> Self {
        Self {
            shared: Arc::clone(&self.shared),
            service: service.into(),
        }
    }

    /// The app's store: its identifier as the service, and `credentials.json` in
    /// its data directory (`~/Library/Application Support/<identifier>` on
    /// macOS) as the file.
    pub fn for_app<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Self> {
        Ok(Self::new(
            app.config().identifier.clone(),
            app.path().app_data_dir()?.join("credentials.json"),
        ))
    }

    pub fn get(&self, key: &str) -> io::Result<Option<String>> {
        let _held = self.shared.lock.lock().unwrap_or_else(|e| e.into_inner());
        #[cfg(all(not(debug_assertions), any(target_os = "linux", target_os = "windows")))]
        return keyring_get(&self.service, key);
        #[cfg(not(all(not(debug_assertions), any(target_os = "linux", target_os = "windows"))))]
        Ok(self
            .read()?
            .get(&self.service)
            .and_then(|m| m.get(key))
            .cloned())
    }

    pub fn set(&self, key: &str, value: &str) -> io::Result<()> {
        let _held = self.shared.lock.lock().unwrap_or_else(|e| e.into_inner());
        #[cfg(all(not(debug_assertions), any(target_os = "linux", target_os = "windows")))]
        return keyring_set(&self.service, key, value);
        #[cfg(not(all(not(debug_assertions), any(target_os = "linux", target_os = "windows"))))]
        {
            let mut entries = self.read()?;
            entries
                .entry(self.service.clone())
                .or_default()
                .insert(key.to_string(), value.to_string());
            self.write(&entries)
        }
    }

    /// Idempotent: deleting a key that is not there succeeds.
    pub fn delete(&self, key: &str) -> io::Result<()> {
        let _held = self.shared.lock.lock().unwrap_or_else(|e| e.into_inner());
        #[cfg(all(not(debug_assertions), any(target_os = "linux", target_os = "windows")))]
        return keyring_delete(&self.service, key);
        #[cfg(not(all(not(debug_assertions), any(target_os = "linux", target_os = "windows"))))]
        {
            let mut entries = self.read()?;
            let Some(keys) = entries.get_mut(&self.service) else {
                return Ok(());
            };
            if keys.remove(key).is_none() {
                return Ok(());
            }
            if keys.is_empty() {
                entries.remove(&self.service);
            }
            self.write(&entries)
        }
    }

    /// A file that does not parse is an error, never an empty store: the next
    /// `set` would overwrite whatever secrets it held.
    #[cfg_attr(
        all(not(debug_assertions), any(target_os = "linux", target_os = "windows")),
        allow(dead_code)
    )]
    fn read(&self) -> io::Result<Entries> {
        match std::fs::read(&self.shared.path) {
            Ok(bytes) if bytes.iter().all(u8::is_ascii_whitespace) => Ok(HashMap::new()),
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!(
                        "secret store {} is not a JSON object of objects of strings",
                        self.shared.path.display()
                    ),
                )
            }),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(HashMap::new()),
            Err(e) => Err(e),
        }
    }

    #[cfg_attr(
        all(not(debug_assertions), any(target_os = "linux", target_os = "windows")),
        allow(dead_code)
    )]
    fn write(&self, entries: &Entries) -> io::Result<()> {
        let json = serde_json::to_vec_pretty(entries).map_err(io::Error::other)?;
        write_private(&self.shared.path, &json)
    }
}

/// A keyring failure's message names the operation, never the value.
#[cfg(all(not(debug_assertions), any(target_os = "linux", target_os = "windows")))]
fn keyring_entry(service: &str, key: &str) -> io::Result<keyring::Entry> {
    keyring::Entry::new(service, key)
        .map_err(|e| io::Error::other(format!("failed to access the keyring: {e}")))
}

#[cfg(all(not(debug_assertions), any(target_os = "linux", target_os = "windows")))]
fn keyring_get(service: &str, key: &str) -> io::Result<Option<String>> {
    match keyring_entry(service, key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(io::Error::other(format!(
            "failed to load keyring entry '{key}': {e}"
        ))),
    }
}

#[cfg(all(not(debug_assertions), any(target_os = "linux", target_os = "windows")))]
fn keyring_set(service: &str, key: &str, value: &str) -> io::Result<()> {
    keyring_entry(service, key)?
        .set_password(value)
        .map_err(|e| io::Error::other(format!("failed to store keyring entry '{key}': {e}")))
}

#[cfg(all(not(debug_assertions), any(target_os = "linux", target_os = "windows")))]
fn keyring_delete(service: &str, key: &str) -> io::Result<()> {
    match keyring_entry(service, key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(io::Error::other(format!(
            "failed to delete keyring entry '{key}': {e}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(any(debug_assertions, not(any(target_os = "linux", target_os = "windows"))))]
    #[test]
    fn a_secret_round_trips_and_deletes() {
        let dir = tempfile::tempdir().unwrap();
        let store = SecretStore::new(
            "com.example.app",
            dir.path().join("data").join("credentials.json"),
        );
        assert_eq!(store.get("token").unwrap(), None);
        store.set("token", "s3cret").unwrap();
        store.set("other", "x").unwrap();
        assert_eq!(store.get("token").unwrap().as_deref(), Some("s3cret"));
        store.delete("token").unwrap();
        store.delete("token").unwrap();
        assert_eq!(store.get("token").unwrap(), None);
        assert_eq!(store.get("other").unwrap().as_deref(), Some("x"));
    }

    #[cfg(any(debug_assertions, not(any(target_os = "linux", target_os = "windows"))))]
    #[test]
    fn services_share_one_file_and_one_lock_and_read_earlier_entries() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("credentials.json");
        std::fs::write(&path, r#"{"bragi-llm":{"api_key":"old"}}"#).unwrap();
        let base = SecretStore::new("bragi-jellyfin", &path);
        let llm = base.with_service("bragi-llm");
        assert_eq!(llm.get("api_key").unwrap().as_deref(), Some("old"));
        let sub = base.with_service("bragi-subsonic");
        let stores = [base, llm, sub];
        std::thread::scope(|s| {
            for (i, store) in stores.iter().enumerate() {
                s.spawn(move || {
                    for n in 0..25 {
                        store.set(&format!("k{i}-{n}"), "v").unwrap();
                    }
                });
            }
        });
        for (i, store) in stores.iter().enumerate() {
            for n in 0..25 {
                assert!(
                    store.get(&format!("k{i}-{n}")).unwrap().is_some(),
                    "{i} {n}"
                );
            }
        }
    }

    #[cfg(any(debug_assertions, not(any(target_os = "linux", target_os = "windows"))))]
    #[test]
    fn a_corrupt_store_is_refused_and_its_error_carries_no_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("credentials.json");
        std::fs::write(&path, "hunter2 not json").unwrap();
        let err = SecretStore::new("com.example.app", &path)
            .set("k", "v")
            .unwrap_err();
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
