---
kind: plan
status: active
updated: 2026-11-16
rank: 17
---

# Imported presets and HTML in chat draw as their authors meant, safely

## Goal

A SillyTavern preset or card that styles its replies works after import with no setup: display scripts, model-written panels, styled greetings and cards draw in the row's sandboxed frame in every chat style, and every row a setting holds plain says why. The first outside user's Sola preset is the reference case; her reports opened this plan.

## Shape

One reader in the kit decides what is markup. One sandboxed frame per row draws it under the character's trust step, with the server rechecking each grant at mint and at serve. One shared notice names the setting that holds content back and opens it for whoever may change it. Work lands in this order: correctness of what draws, then what explains itself, then streaming and history cost, then the trust settings model.

## Rejected

Rendering model HTML in the app page as SillyTavern does: no isolation and no scripts. Translating a card's stylesheet into theme tokens: the matching would be fragile. Drawing half-written markup while a reply streams.

## Coupled sites

packages/kit/src/content/, packages/kit/src/card-frame/, packages/ui/src/markdown/frame/, packages/ui/src/content/sandbox-frame/, packages/client/src/features/chat/, packages/contracts/src/chat/roster.ts, packages/server/src/entry/http/card-frame.ts

## Test plan

Component tests mount the real row through the test data providers; kit readers have seeded differential rows; the preset probe in tests/server/domain/import/persistence/ runs any preset file by path; a rendered review covers every chat style in light and dark on desktop and phone.
