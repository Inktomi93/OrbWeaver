---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: inference
---

# Chat messages can carry audio and file attachments to providers that accept them

## What

The inference input modalities include audio and file, as the providers law lists, and embed, rerank and Google usage details read them, but no chat message part sends either, so a provider that accepts audio or files never receives one from chat.

## Why

The modality vocabulary is live law; wiring chat attachments is the product feature that would use it.

## Done when

The composer attaches audio and files where the bound model accepts them, the turn sends them as typed parts, and an int test drives one of each through a provider responder; or the item records why chat attachments are not planned.

## Evidence

Filled at landing: what ran and where its output is.
