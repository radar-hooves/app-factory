const COMMANDS: &[&str] = &[
    "telemetry_get",
    "telemetry_set",
    "telemetry_probe",
    "report_update_check",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}
