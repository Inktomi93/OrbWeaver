---
kind: work
status: doing
updated: 2026-11-27
priority: P2
area: import
lane: wt/agent-a85695280a474486b
plan: unwired-code
---

# Card import reads through the one character card schema

## What

packages/server/src/primitives/serde/card/index.ts reads cards through a hand-written RawCard interface of optional unknown fields and checks each field by hand, while characterCardV3Schema in packages/contracts/src/character/index.ts is used only to validate the export. The fields scan reports every schema field unreferenced because the import never reads through it. RawCard also carries the V2 root and Pygmalion variants.

## Why

Two shapes for one card format drift apart; one home per concept is house law.

## Done when

Import normalizes V2 and Pygmalion cards into the card schema's shape and reads every field through the schema, tolerant per field so one bad field never refuses a card; the card's book entries and SillyTavern regex script fields (StRegexScriptFields) are read on import through the same shapes export writes; RawCard and every import-side copy are gone; the import and export round-trip tests pass unchanged; these schemas' fields leave the fields report.

## Evidence

Filled at landing: what ran and where its output is.
