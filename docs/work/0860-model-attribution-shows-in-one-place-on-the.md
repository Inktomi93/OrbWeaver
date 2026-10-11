---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: chat
lane: wt/agent-a753be51eef96b9c6
---

# Model attribution shows in one place on the chat page

## What

Owner: model attribution appears in about four places on one chat page (candidates: the composer Next reply line, the per-message header or footer stamp, the context panel's connection section, the chat header or options). It crowds the center page.

## Why

Owner wants a cleaner, modern center page; repeating the same model name is noise.

## Done when

Every place the chat page names or switches the model or preset is listed with its file. The only kept home on the chat page is the per-message stamp saying what produced each reply; no model or preset quick-swap control remains on the chat page (both stay settable in room settings). CTs assert the model name renders only in that stamp and no swap control mounts in the room.

## Evidence

Already satisfied by the merged chat-page work, so this item changes no code: it adds the room-level test and lists each place. Re-derived on this tree with codegraph over the chat feature, `ast-grep` for `$X.model` and `trpc.connection.$M` across the client in both `ts` and `tsx`, and `pnpm ast`.

Every place the chat page names or switches the model or preset:

- `packages/client/src/features/chat/components/generation-credit.tsx`: the per-message stamp. Kept. A glyph in the reply's action cluster; the sentence is on `title` and in screen-reader text, behind the Show model appearance toggle.
- `packages/client/src/features/chat/components/composer-next-turn-line.tsx`: the composer's next-reply line. It prints a sentence only for a refusal (no chat connection, or a failed check) and never names a model.
- The context pane and the chat header: no connection section, preset chip or model read remains. The pane's tabs live in its header row (`docs/adr/0313-the-context-panes-tabs-live-in-its-header-row.md`).
- `packages/client/src/features/chat/lib/warning-notice.ts`: turn notices say "this model" and do not name it.
- No swap control: the chat feature reads connections only in `use-credit-connections.ts`, `message-cost-readout.tsx` and the next-reply line, and no mutation of a connection or preset is reachable from the room.

Correction to the Done line: a room has no model or preset of its own. The model is set in Settings, Model roles, and the preset is the active preset in Presets, so both stay settable outside the chat page.

Test: `tests/client/features/chat/surfaces/chat-room-surface.ct.tsx`, "the room names the model only in the per-message stamp and mounts no model or preset swap". It plants a model name outside the stamp first, to prove its probe sees one, then asserts the room has none and no model, connection or preset control. It passes on the unchanged source by design.

Owner ruling: no model or preset swaps from the chat room.
