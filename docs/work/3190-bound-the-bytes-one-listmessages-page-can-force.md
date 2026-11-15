---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: server
---

# Bound the bytes one listMessages page can force onto a member

## What

Needs a human security read before design. `listMessages` (`createListMessages` in `packages/server/src/domain/chat/verbs/read.ts`) returns at most `CHAT_MESSAGE_LIST_MAX_LIMIT` messages (`packages/contracts/src/chat/inputs.ts`), each with its selected variant's content and reasoning. With the per-column cap at `MESSAGE_TEXT_MAX_CHARS`, one page can still carry about 100 x (4,000,000 + 4,000,000) UTF-16 units, roughly 1.6 GB of strings, plus the unbounded tool calls. The cap bounds a row, not a page.

## Why

A host (or a host's regex script) can make every member's room open allocate gigabytes on the server and send it over the wire. The owner's largest real row is 264,216 characters, so a page budget would never bind on real data.

## Done when

A ruling on a per-page byte budget (stop the page early with an honest cursor, or a smaller page limit for large rows), then the budget in `listMessages` with a composed-root case over at-cap rows that asserts the page stops under the budget and the cursor reaches the next row.

## Evidence

Filled at landing: what ran and where its output is.
