---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# Hosted readers fail closed on a malformed kind field

## What

LiteRouter should keep a row only when `type === "chat"`, not when `type` is missing or malformed. NanoGPT should drop a row whose `output_modalities` is present but not an array.

## Why

An image model can otherwise list as chat. This is functional, not security. Owner call: whether a missing `type` means chat on LiteRouter's real list; the live list carried `type` on every row.

## Done when

Catalog cases in the literouter catalog suite on the providers branch and the nanogpt catalog suite on the providers branch pin a LiteRouter row with no or a malformed `type`, and a NanoGPT row with a string `output_modalities`, as absent from the chat list.

## Evidence

Filled at landing: what ran and where its output is.
