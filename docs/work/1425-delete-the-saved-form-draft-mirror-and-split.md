---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: client
---

# Delete the saved-form draft mirror and split client lib

## What

createSavedEntityForm in packages/client/src/forms/editor/create-saved-entity-form.ts takes an optional draft crash mirror that writes unsaved input to browser storage. No form passes it: every entity editor autosaves, and the remaining saved forms create things or take credentials, which must never persist half-typed. Delete that option and its tests only. The crash-survival drafts the autosave editors pass to createAutosaveEntityForm (character, preset, world-info entry, automation rule), their DEVICE_LOCAL_REGISTRY names, and the composer draft and guided-action recovery ring stay. Separately, packages/client/src/lib mixes shared product logic with dev-only instruments (agent bridge, motion flaggers, render profiler, tRPC and bus devlogs, perf marks, probe mode) and one single-feature module (leaderboard-row-attr, used only by stats). Move the dev instruments and the top-level agent-\* folders under one packages/client/src/dev/ home behind the existing import.meta.env.DEV gate, and move leaderboard-row-attr into the stats feature.

## Why

Unused options and mixed homes hide what ships and invite a credential to land in storage.

## Done when

The saved-form draft option is gone with no caller left, and the autosave editor drafts and composer recovery still restore input after a reload; dev-only code lives under packages/client/src/dev/ and stays out of the production bundle (checked against a production build); leaderboard-row-attr lives in stats; typecheck, depcruise, knip and the affected tests pass.

## Evidence

Filled at landing: what ran and where its output is.
