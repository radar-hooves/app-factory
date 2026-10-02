---
paths:
  - 'kits/**/package.json'
  - 'kits/**/pyproject.toml'
  - '**/.github/workflows/publish-kit-*.yaml'
---

# A Kit Release Is Never a Package Tag

- Must NOT push a package-specific tag; only the factory's own `v*` releases are tags (`publish-kit-*.yaml` headers).
