# Android skeleton

Rootstock's suite apps stamp from `skeletons/android/`, a third skeleton beside web and desktop (the operator's ruling, 14/11/2026: every app "cut from the same cloth"). Need and design: rootstock's `docs/research/app-stamp-2026-11-14.md`.

```text
app-factory  skeletons/android/            14 thin files, one copier.yaml
     │  copier copy --data skeleton=android gh:radar-hooves/app-factory apps/<name>
     ▼
rootstock    apps/<name>/                  a Gradle module, with its own .copier-answers.yml
               build.gradle.kts            plugins { id("rootstock.app") }
                                           └─ the Android knowledge: rootstock's convention
                                              plugin and core modules, never factory kits
```

## Stamp and update

From a rootstock checkout's root:

```sh
copier copy --data skeleton=android gh:radar-hooves/app-factory apps/<name>   # asks project_name (= <name>) and project_title
copier update apps/<name>                                                     # one app; its siblings are untouched
```

Each app is its own copier destination, so it keeps its own answers file and `copier update` needs no flag. Neither needs `--trust`. `project_name` must equal the module's directory, because `rootstock.app` derives the namespace from that directory and the sources' package from the answer. `android_package` (hyphens stripped) and `class_prefix` (each word capitalised) are derived from it. The validator holds the name to lowercase letters and hyphens, starting with a letter, at most 35 characters.

A stamp writes only inside the module. rootstock's `rs-01-new-app` makes the shared-tree edits: the `settings.gradle.kts` include, the module intent and sweep config, the `suite.json` entry, the launcher glyph and the Settings roster row.

## What lives where

| | rootstock (one copy) | Skeleton-owned (converged) | App-owned (first stamp, then the app's) |
| --- | --- | --- | --- |
| Build | `rootstock.app` and the plugins it applies | | `build.gradle.kts` |
| Shell | core/design-system, core/preferences (`SuiteTheme`), core/appsettings, core/observability | | `AndroidManifest.xml`, `src/main/kotlin/` |
| Resources | | `values/colors.xml` (the launcher background), `mipmap-anydpi-v26/ic_launcher.xml` | `drawable/` (the glyph rootstock's generator writes), `values/strings.xml`, `values/themes.xml` |
| Tests | the test stack, via `rootstock.app` | | `src/test/kotlin/` |

The owned set is the render minus `_skip_if_exists`. It is two files because what every app shares already lives once, in rootstock: across its twenty apps on 14/11/2026, `colors.xml` and the adaptive-icon frame were the only skeleton files identical in all apps that had them. `themes.xml` stays the app's, because Saul's overlay window is translucent.

## Proof

The skeleton's templates use `{{answer}}` alone, so rootstock's `:stamp` renderer and copier cannot disagree (`tests/template/test_android.py`). Copier's render for `tuner` matched rootstock's renderer on all 14 files. rootstock's `:stamp` leg builds the skeleton and runs its gates, pinned to a factory tag, so this repo's CI needs no Android SDK. Factory CI only renders it (`factory-selftest.yaml`).

## Drift

Master's template-parity gate lists the owed files from `template/` alone, so it measures neither a desktop app nor an Android app yet. The factory half is in place: the owned set is the factory's `_skip_if_exists`, and each app's answers sit at its module's root, where the gate looks for an app.
