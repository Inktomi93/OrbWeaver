---
kind: work
status: doing
updated: 2026-10-20
priority: P1
lane: codex/legacy-config-registry-1196
plan: test-foundation
---

# Rebuild legacy config section stories through the registry door

## What

Section bodies need a registry-minted anchorId (private formatter, b34b6910b8); two shell fixtures pass planned content where a live section needs a render function. Rows (file:line story): app-shell/\_ct-stories.tsx:1010 fakeHeaderSection, 1405 regionSection (content), 1487,1498,1509,1520 Appearance sizing/reading/effects/background; chat/\_attachment-quality-stories.tsx:9 AttachmentQuality; chat/\_ct-stories.tsx:3839,3851,3863,3875,3935,3948,3959,3970,3987,3998 memory, databank, imagery templates, prose, message style (+narrow), avatars, message details, message handling, streaming; config/\_ct-stories.tsx:405,420,441 Looks (+narrow, reopen); credentials/\_ct-stories.tsx:468 ConnectionsListRead; persona/\_ct-stories.tsx:283 PersonaNotificationsReopen; user-admin/\_ct-stories.tsx:35,49,64,77,78,99,113,126,139,153,167,180,192,204,269 admin users, approvals, link SSO, ops, rate limits, memory tuning (+narrow), media trust, governance, about (+updates), operations (+socket), system tuning; workloads/\_ct-stories.tsx:39,53,77 jobs, schedules, tuning; world-info/\_ct-stories.tsx:28 settings. Paths under tests/legacy/client/features/.

## Why

Exporting the anchor formatter only for legacy stories is the retracted pattern; the real anchor comes from the config registry, and these keep the legacy DOM typecheck red.

## Done when

The stories render through the config registry door, tsconfig.tests-legacy-dom.json is clean, and the dependent CTs run.

## Evidence

Filled at landing: what ran and where its output is.
