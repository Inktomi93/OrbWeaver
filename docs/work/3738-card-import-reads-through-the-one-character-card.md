---
kind: work
status: open
updated: 2026-11-21
priority: P2
area: import
plan: unwired-code
---

# Card import reads through the one character card schema

## What

packages/server/src/primitives/serde/card/index.ts reads cards through a hand-written RawCard interface of optional unknown fields and checks each field by hand, while characterCardV3Schema in packages/contracts/src/character/index.ts is used only to validate the export. The fields scan reports every schema field unreferenced because the import never reads through it. RawCard also carries the V2 root and Pygmalion variants.

## Why

Two shapes for one card format drift apart; one home per concept is house law.

## Done when

Import normalizes V2 and Pygmalion cards into the card schema's shape and reads every field through the schema, tolerant per field so one bad field never refuses a card; RawCard is gone; the import and export round-trip tests pass unchanged; the schema's fields leave the fields report.

## Evidence

Filled at landing: what ran and where its output is.
