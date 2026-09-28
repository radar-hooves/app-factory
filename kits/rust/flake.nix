{
  description = "kits/rust devShell: Rust plus the GTK/WebKit headers tauri-plugin-telemetry needs to even compile on Linux";

  # On Linux, tauri's own Cargo.toml declares `gtk` as an UNCONDITIONAL
  # target dependency (not gated behind any Cargo feature), so anything that
  # depends on `tauri` — even a backend-only plugin crate with
  # `default-features = false` and no window of its own — needs GTK3 and
  # WebKitGTK development headers on the machine building it. `dtolnay/
  # rust-toolchain` alone (telemetry's own former CI, which needs no GTK at
  # all) cannot supply those; this is the household's own Rust-on-atlas
  # pattern instead — a flake devShell CI enters with `nix develop`, mirrored
  # from Bragi's and Thoth's own `flake.nix`.

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
    rust-overlay.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
          config.allowBroken = true; # webkitgtk for Tauri on Linux
        };

        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [ "rust-src" "rust-analyzer" "rustfmt" "clippy" ];
        };
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs;
            [
              rustToolchain
              pkg-config
              openssl
              cmake
            ]
            ++ lib.optionals stdenv.isLinux [
              webkitgtk_4_1
              libappindicator-gtk3
              librsvg
              glib
              libsecret
            ]
            ++ lib.optionals stdenv.isDarwin [
              libiconv
            ];
        };
      });
}
