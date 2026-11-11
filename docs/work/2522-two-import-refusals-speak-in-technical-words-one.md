---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: client
plan: cross-surface-consistency
---

# Two import refusals speak in technical words, one of them twice

## What

A plain picture given to the Backup and Restore import as a character card is refused in the server's technical wording, naming the missing card chunk by its internal spelling (packages/client/src/features/workloads, the portability model's refusal mapping). The Characters import dialog already says the same refusal in plain words from its copy module, and the SillyTavern folder refusal is fixed. Source: finding F1 in the rendered review of the client branch under reports/review.

## Why

A person who picked the wrong file needs to know what to pick, in their words, said once.

## Done when

The Backup and Restore import shows the same plain sentence the Characters import dialog shows for a picture with no character card, read from one copy home, with a component test through the production section that asserts the sentence and no toast.

## Evidence

Filled at landing: what ran and where its output is.
