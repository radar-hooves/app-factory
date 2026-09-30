---
name: design-system-console
description: >-
  The design system looking at itself. Neutral by construction — the console is
  where every app's accent is previewed, so it claims none of its own and
  renders the package's own default. Light-first, dark equal.

version: 2026.9.1
mode: equal

# ---------------------------------------------------------------------------
# Brand primary.
#
# This app is the ONE case that does not pick a hue, and the absence is
# normative rather than an omission. The console's job is showing what every
# other app's accent does to the same chrome; pinning one here would make it
# lie about the rest. It renders --ds-color-primary exactly as
# @poodle64/design-tokens ships it, and the shell lab overrides the hue at
# runtime, per profile, in a style attribute scoped to the preview frame.
#
# Consequence for anyone editing src/app.css: there is deliberately no
# `:root { --ds-color-primary: ... }` block. Adding one is a defect, not a
# missing step.
# ---------------------------------------------------------------------------
primary:
  light: inherit-from-package
  dark: inherit-from-package
---

# Design system console — North Star

## What this app is

The console for `@poodle64/design-tokens` and `@poodle64/ui`, built from them.
Its whole value is that it is a real consumer: it installs the packages the way
an app does, composes `AppShell`, `PageHeader` and the primitives the way an app
does, and therefore fails the way an app would. A defect in the shell shows up
here, on the maintainer's own screen, before it reaches nine apps.

Governed under `platform/canonical-app-shape.md` §Applicability — a repo whose
product is something else and that also ships a console is governed **on the
console only**. The repo root stays library-shaped: two published packages, no
backend, no database, no `/mcp`.

## The three surfaces

**Shell lab** (`/lab`) is the exception to everything else here, and the
exception is the point. It renders chrome the package cannot produce yet — a
shape with no page header, a rail contextual zone — so it deliberately does
**not** compose `AppShell`. Importing the shipped component would make it unable
to do the one thing it exists for. It sits upstream of the component; every
other route sits downstream.

What the lab does share is everything below the component line: the token layer,
the `ds-*` layer, and the Tailwind utility layer, because it lives inside a real
consumer build. A shape judged there is judged in the same CSS an app will
render it in. That was the reason it stopped being a standalone HTML file.

**Palette** and **Components** are ordinary consumers and carry no exception.

## The graduation path

A shape wins in the lab → it is built into `@poodle64/ui` for real →
`packages/ui/harness/` verifies the shipped component in a real browser, in CI.
Three stages, three different jobs, and the reason there are three rather than
one: the lab can render anything and proves nothing; the harness proves things
and can only render what exists.

Do not collapse them. Do not add a fourth thing that renders UI.

## Prose direction

Plain, measured, and specific. This console explains a design system to the
person maintaining it, so it names real values — 15.5rem, 120rem, 4.5:1 — rather
than adjectives. No exclamation marks, no "beautiful", no "modern". A caption
that could sit under any component is a caption that has not been written.

## What deliberately has no accent

The lab's control deck is styled in raw hexadecimal greys, outside the token
system, and that is not drift. It is the harness around the specimen: dressing
the instrument in the tokens under test makes the two impossible to tell apart
at a glance, and the whole job is telling them apart. Every other pixel in this
app is token-driven.
