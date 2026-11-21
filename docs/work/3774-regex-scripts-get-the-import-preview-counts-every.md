---
kind: bug
status: open
updated: 2026-11-21
priority: P3
area: import
plan: import-robustness
---

# Regex scripts get the import preview counts every other kind gets

## What

importPreviewItemSchema.regexScripts (packages/contracts/src/import/preview\.ts) has inLibrary, repeat and refused, and the dry run never fills them, while every other kind's are filled.

## Why

The preview cannot say how many regex scripts are already in the library or refused.

## Done when

The dry run fills the three counts for regex scripts by the write's own equality rule, the preview shows them, and the import preview suite covers them.

## Evidence

Filled at landing: what ran and where its output is.
