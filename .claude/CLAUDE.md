# App Factory

The copier source for every household full-stack app (FastAPI, SvelteKit SPA, embedded MCP surface), plus the shared kits and the desktop skeleton. The law it executes is `rules-library/platform/canonical-app-shape.md`; read `docs/development/working-on-the-template.md` before editing `template/`.

## Pitfalls (differ from the household default)

- **Copier resolves the latest git tag, never `main`.** An untagged `template/` change reaches nothing and nothing errors. Releasing is a `v*` tag by whoever merges; a lane on a branch never tags (a tag on any branch publishes unmerged work).
- **A stamped-file change owes every app a regenerated `.template-parity.json`.** An app with an old manifest measures itself against an old factory and stays green. A release that adds a start-time refusal names the new setting in its CHANGELOG notes to stamped apps.
- **A kit release is never a package tag.** Kits (`kits/python`, `kits/rust`, npm) publish through `publish-kit-*.yaml`; only the factory's own `v*` are tags (`.claude/rules/kit-release.md`).
- **This repo's own config is not the stamp.** The template's ignores, hooks and CI live under `template/`; the root `.gitignore`, `.pre-commit-config.yaml` and workflows are the factory's own. A gate added for apps is added to both.
- **A fix lands once here, never per app.** An app that must differ argues it in its `.canonical-exceptions`; open a need against this repo, with the consumer named in the commit.
- **`CHANGELOG.md` is updated in the same change**, one entry per release with the need and consumer, and a "Consumer must change" list where an app has to act.
