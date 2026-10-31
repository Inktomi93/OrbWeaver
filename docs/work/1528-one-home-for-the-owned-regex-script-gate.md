---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: regex
plan: unwired-code
---

# One home for the owned regex script gate

## What

About a dozen regex verbs repeat loadOwnedScript followed by a RegexNotFoundError throw.

## Why

One home per concept.

## Done when

One substrate helper, used by every verb; regex suites pass.

## Evidence

`requireOwnedScript` in `packages/server/src/domain/regex/persistence/ownership.ts` is the one script gate. Eleven verbs call it: update, remove, duplicate, listScriptUsage, attachGlobal, detachGlobal, attachToPreset, detachFromPreset, attachToCharacter, detachFromCharacter, attachToChat. The home is `persistence/ownership.ts` and not `substrate/`, because `Core-0-Architecture-and-Structure.md` §4 makes substrate pure with zero I/O, and that file already holds the sibling `ensure*Owned` gates that throw `RegexNotFoundError`. The paired verbs now check the target first and the script second, so the error kind no longer depends on which read settles first. `createExportRegexScript` keeps `loadOwnedScript` because it answers `null`, not a throw. Checks: typecheck passes; the `room-reach`, `membership-room-fan` and `library-planes` suites pass.
