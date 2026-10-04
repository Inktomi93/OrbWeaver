---
kind: work
status: open
updated: 2026-10-03
priority: P2
area: chat
---

# History fit counts real tokens on a hard window

## What

safeTokenWindow (QuadChars x 0.7) still overflows digit-dense text: a ledger row measured 88 estimated vs 208 real tokens on the Qwen3.8-27B tokenizer (ratio 2.36; every digit is its own token). Add a passage token count through the connection's tokenize endpoint where one exists and fit history against it; keep the estimate where none exists (Ollama has no tokenize endpoint). Needs a passage-tokenize seam in packages/inference (today only the logit-bias word tokenize exists) and an async fit. Found by the 0505 lane.

## Why

Hard local windows still overflow on number-heavy chats.

## Done when

The ledger-row case stays inside a 4096 window by its real count on a server with a tokenize endpoint; the estimate path is unchanged elsewhere.

## Evidence

Filled at landing: what ran and where its output is.
