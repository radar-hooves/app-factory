---
paths:
  - 'kits/**/package.json'
  - 'kits/**/pyproject.toml'
  - '**/.github/workflows/publish-kit-*.yaml'
---

# A Kit Release Is a Version Bump, Never a Tag

- Must release a kit package (`kits/*/packages/*` or equivalent) by bumping its version (and CHANGELOG) and merging to main; `publish-kit-*.yaml` publishes any version the registry lacks once it reaches main. Must NOT push a package-specific tag: copier stamps a consuming app's `_commit` from `git describe --tags`, so a package tag is read as the app-factory's own release and corrupts every app's recorded factory version. Only the factory's own `v*` releases are tags.
