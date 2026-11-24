---
kind: bug
status: open
updated: 2026-11-24
priority: P3
area: import
plan: import-robustness
---

# Regex scripts get the import preview counts every other kind gets

## What

importPreviewItemSchema.regexScripts (packages/contracts/src/import/preview\.ts) carries each script's reuse and refused verdict, filled by the dry run from the regex domain's planUploadLift, but the preview shows no per-state counts for regex scripts while every other kind shows them.

## Why

The preview cannot say how many regex scripts are already in the library or refused.

## Done when

The dry run fills the three counts for regex scripts by the write's own equality rule, the preview shows them, and the import preview suite covers them.

## Evidence

Filled at landing: what ran and where its output is.
