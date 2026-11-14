---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: client
---

# The name grammar law states that a row's description text is outside its name

## What

The accessibility scan judges a control apart when every word it shows is in its name once the text its description points at is removed. A list row keeps its subtitle out of its name by an owner ruling that lives only in the header of `packages/ui/src/primitives/list-row/list-row.tsx`. The name grammar section of `docs/law/UI-Primitives-and-Reuse.md` covers a transient status word only, so the scan now excuses rows the law's text does not name.

## Why

A check that excuses more than the law states is a waiver nobody ruled on, and the next reader of the law cannot tell the subtitle rule exists.

## Done when

The law states the subtitle rule beside the status rule and cites the list row as its owner, or the scan's excusal is narrowed to the status case, and the scan's test covers the chosen form.

## Evidence

Filled at landing: what ran and where its output is.
