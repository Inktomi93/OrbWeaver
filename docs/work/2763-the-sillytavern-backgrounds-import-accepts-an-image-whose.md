---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: import
plan: import-robustness
---

# The SillyTavern backgrounds import accepts an image whose extension names another image type

## What

The backgrounds import takes the type from the file extension with the signature check on, so a JPEG named `.png` is refused. Bundle restore accepts the same bytes under their sniffed type.

## Why

A mislabeled but valid picture is dropped from an import for no safety gain.

## Done when

A background whose bytes are a served image type is stored under that type whatever its extension says, and bytes that are no image are still refused, with a test through the production import.

## Evidence

Filled at landing: what ran and where its output is.
