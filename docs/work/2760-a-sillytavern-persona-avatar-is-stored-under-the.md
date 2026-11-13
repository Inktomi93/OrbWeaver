---
kind: bug
status: open
updated: 2026-11-13
priority: P2
area: import
plan: import-robustness
---

# A SillyTavern persona avatar is stored under the type its bytes are

## What

The SillyTavern profile import stored every persona avatar as `image/png` with the signature check off, so a JPEG or WebP avatar was stored under the wrong type and a later bundle restore could refuse it.

## Why

A stored type that disagrees with the bytes breaks restore of the owner's own backup and weakens the store's type guarantee.

## Done when

The SillyTavern import stores a persona avatar under its sniffed image type with the signature check on, proved by a test through the production import.

## Evidence

Filled at landing: what ran and where its output is.
