const COMMANDS: &[&str] = &["telemetry_get", "telemetry_set", "telemetry_probe"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
