---
kind: work
status: open
updated: 2026-10-23
priority: P3
area: client
---

# Three persisted client ids are minted ambiently with randomUUID

## What

`packages/client/src/features/app-shell/components/background-upload-field.tsx:79` (appearance entry id, schema `z.string()` at `contracts/settings/appearance.ts:102`), `features/preset/lib/assembly-model.ts:173` (section id, documented as a config-local plain string) and `features/preset/components/prompt-assembly/section-drill-in.tsx:430` mint ids that persist with ambient `randomUUID`, so a component test cannot seed them. `ClientRuntime` (`packages/client/src/data/client-runtime-contract.ts`) carries no id source today; `state/rule-creation-store.ts:63` and `features/config/components/appearance-looks-section.tsx:68` call `mintTypeId` directly as well. The seven other `randomUUID` sites are UI-local form-array row keys, which the `rowIds` rule in `.claude/rules/ui-and-client.md` leaves ambient on purpose.

## Why

A persisted id minted outside the runtime is the client twin of the server's optional seams; the design question (an `ids` field on `ClientRuntime` plus a hook, and whether these three keep the UUID shape or move to TypeID) is the owner's.

## Done when

Ruling recorded here; if adopted, `ClientRuntime` gains an id source wired in `compose/client-runtime.ts` and the CT runtime, the three persisted mints read it, their shape decision is written on this item, and the preset and automation CT suites stay green.

## Evidence

Filled at landing: what ran and where its output is.
