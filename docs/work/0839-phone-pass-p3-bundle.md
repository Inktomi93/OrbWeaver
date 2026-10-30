---
kind: work
status: open
updated: 2026-10-10
priority: P3
area: client
---

# Phone pass P3 bundle

## What

P3 findings from the phone pass: alternate greeting stamps edited (edit.ts:606), nine-item message actions menu, context chip inconsistency, gutters 8 vs 24px, greeting/opening and every-chat naming splits, desktop-only dropzone copy, suggested tags push card fields, triple Connections heading, oversized switch with tiny label, empty role picker has no next step, double empty state on Home, avatar gutter width. Source: ~/Archives/orbweaver-reviews/phone-pass-oct10.md P3 items. Also: side-eye the phone topbar with Report a bug.

## Why

Phone pass findings below P2.

## Done when

Each P3 in the report is fixed or ruled, with the ruling recorded here.

## Evidence

Not changed; triage only.

- Still present: the file dropzone's default copy is desktop-only (`packages/ui/src/primitives/file-dropzone/file-dropzone.tsx`), and so are the overrides in the character, chat and preset import dialogs. The empty-state texts on Home still name chats and rooms separately.
- Present, deliberate in code: the seeded-greeting step stamps `editedAt` (`packages/server/src/domain/chat/verbs/edit.ts`, `createSetSeededGreeting`); changing it changes what an edit stamp means, so it needs a ruling.
- Not checked: the nine-item actions menu, context chips, gutters (shell CSS belongs to the shell lane), the greeting and opening naming split, suggested tags (board 0613), the triple Connections heading, the oversized switch, and the empty role picker.
- Not done: the phone topbar side-eye needs the side-eye role.

Each P3 still needs a fix or a ruling recorded here.
