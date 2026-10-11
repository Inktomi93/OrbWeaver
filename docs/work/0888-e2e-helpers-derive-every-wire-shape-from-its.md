---
kind: bug
status: open
updated: 2026-10-11
priority: P1
area: tests
---

# e2e helpers derive every wire shape from its contract home

## What

tests/e2e/support/trpc.ts hand-declares 43 wire shapes; 14 have no parity pin (MessagesPage, ThemeRow, StartedChat, CharacterListPage, WireCapture, PresetRow, ChatDetail, StartedGroupChat, VariantSummary, AssemblyPreview, CreatedGame, CheckpointRow, ChatDbInspection, RpgTraceRecord) and the comment claiming they have no contracts home is false for ten. Specs redeclare MessagesPage, PersonaRow, ContextFitPreview, ConfigView, RevealView and ImportResult. Derive each from @orb/contracts or the AppRouter output type; give the four server-homed shapes (WireCapture in foundation/observability/debug/wire-capture.ts, RpgTraceRecord in domain/rpg/contract/trace.ts, the debug ChatDbInspection, and PresetRow whose config is typed as a bare record) a contracts home first.

## Why

Live drift today: the mirror's WireCapture has a backend field the server never sends (it is providerId), so the live rpg-lite-loop and capstone specs look up c.backend and can never match. Hand mirrors let wire changes pass silently.

## Done when

No hand-declared wire shape remains in tests/e2e; each derives from a contract or AppRouter output; the two live specs read providerId; mirror-parity covers what remains or is deleted; the tests-dom program typechecks with the server router type; the audit report the e2e test-mirror audit report section B rows are closed.

## Evidence

Filled at landing: what ran and where its output is.
