---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: import
plan: import-robustness
---

# A library or SillyTavern export past the zip size limit writes ZIP64 instead of failing

## What

The zip writer in packages/server/src/infra/storage/zip.ts refuses an archive past the classic zip size and entry limits, so an export of a very large library fails whole partway through the download. The owner's export lock now releases on that failure.

## Why

A user with a large image library cannot take their data out in one archive.

## Done when

The writer emits ZIP64 records when an archive passes the classic limits, SillyTavern and this app's import both read the result, and a test writes and reads back an archive past the classic entry limit.

## Evidence

Filled at landing: what ran and where its output is.
