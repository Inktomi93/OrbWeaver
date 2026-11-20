---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: import
plan: import-robustness
---

# Everything imported from SillyTavern exports back to SillyTavern's own format

## What

For every kind the SillyTavern import takes, add an export that writes SillyTavern's format rather than this app's: character cards as V2 or V3 PNG or JSON, chats as JSONL, world info, presets, personas, regex scripts and the rest the inventory lists, plus a whole-profile export laid out as a SillyTavern data folder. Data with no SillyTavern equivalent is reported as left behind, never silently dropped.

## Why

A user who leaves must not be stuck: their data has to go back to the tool they came from.

## Done when

Each kind exports in the shape and layout that one of SillyTavern's own import doors accepts (a per-item import button, a drop target, or a data folder laid out for a user directory), and the export says which door takes each file. A round trip per kind (SillyTavern sample, import here, export, then import through that door in the SillyTavern checkout, or through the server route or parser the door calls) keeps the content, proven by a test. The whole-profile export loads when placed as a SillyTavern user data folder. The export names what it could not carry.

## Evidence

Filled at landing: what ran and where its output is.
