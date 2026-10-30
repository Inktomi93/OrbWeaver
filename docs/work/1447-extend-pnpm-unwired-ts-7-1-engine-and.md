---
kind: tooling
status: blocked
updated: 2026-10-30
priority: P2
area: architecture
blocked: on 1439
---

# Extend pnpm unwired: TS 7.1 engine and dead-inside-live scans (fields, params, unions, shapes)

## What

Knip finds unused files, dependencies and exports, but one live import keeps everything inside an export alive. Extend `pnpm unwired` (`tooling/src/unwired/`) to find what is dead inside live code.

1. **Engine swap.** The primary engine becomes the TS 7.1 API: `@typescript/native/sync`, one snapshot that opens one file per compiling tsconfig. `LanguageService.getSignatureUsage(propertySignature)` returns each usage with its `call` node, so "is it ever called" needs no hand classifier. A probe on `packages/server/src/domain/chat/contract/service.ts` returned exact call counts for `createInvite`, `listParticipants`, `editReasoning` and `duplicateMessage` in under a second. TS6 stays as the independent second engine. The LSP JSON-RPC path leaves the scanner; the `ts7-lsp` proxy stays for the LSP tool.
2. **`pnpm unwired fields`:** object-type properties written but never read (dead data), and read but never written (always the default, so the branches that test it are dead). This covers DTO and wire fields, settings keys, zod schema keys and store fields.
3. **`pnpm unwired params`:** optional parameters and props that no call or JSX site supplies, and parameters every call passes the same literal.
4. **`pnpm unwired unions`:** members of string-union tuples that no production code constructs. Report their dead `switch` arms and `Record` keys.
5. **`pnpm unwired shapes`:** types in different homes that are mutually assignable with the same members, which breaks one home per concept. Also synonym aliases and re-export chains, followed with `getAliasedSymbol`; this feeds the synonym-alias deletion item.

Each subcommand writes a report under `reports/unwired/`, applies both engines (a finding needs both), keeps the deliberate list, and ships fixtures for a found case and a false-positive control. It is a scan, not a CI gate. Start after item 1439's legs D and E merge.

## Why

The owner removed wildcard exports because they kept dead code alive. Export-level liveness has the same blind spot one level down: a type with unread fields, an option nobody passes or a union member nothing produces all count as used. AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect.

## Done when

`pnpm unwired`, `fields`, `params`, `unions` and `shapes` run on the TS 7.1 engine with TS6 cross-checking. Each finding needs both engines. Each subcommand's fixtures prove a found case and a control. The first full run's findings are boarded, bundled by domain, each classified as wire, delete, deliberate with a cited reason, or unknown.

## Evidence

Filled at landing: what ran and where its output is.
