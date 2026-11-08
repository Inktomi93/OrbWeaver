---
kind: bug
status: open
updated: 2026-11-07
priority: P3
area: server
plan: test-foundation
---

# Staging writes follow a swapped parent

## What

A timed local actor with write rights inside an owner staging folder can swap a parent directory between `mkdir` and the `O_EXCL | O_NOFOLLOW` open in `stagePart` (`packages/server/src/entry/http/import-tree.ts`) or the zip extractor `writeStaged` (`packages/server/src/infra/storage/zip.ts`), and between the `lstat` and the `rm` in `rmContained` (`packages/server/src/domain/import/workload-contributions.ts`). The write then lands, and the delete acts, under the link target.

Decision: accepted, not bounded. The actor is a process that runs as the server user, or root. The upload routes create the owner folder with mode 0700, and the extraction directory comes from `mkdtemp`, which is also 0700, so no other OS user can enter either one to swap a parent. A process with the server uid can already create and delete every file the redirected write or delete could reach, so the swap gives it nothing new. On the shipped deployment that process is the owner container. Node has no `openat` or `RESOLVE_BENEATH`, so a second realpath check would only narrow the window. The read side stays closed by digest (D340).

Residual: an operator who points `IMPORT_STAGING_DIR` at a directory where another OS user can rename entries (world-writable without the sticky bit) lets that user replace an owner folder with a link before an upload is staged. Severity: low on the shipped deployment.

## Why

The read side is closed by digest, and the write side has no such anchor.

## Done when

A recorded decision with its actor, and a fix or a stated acceptance.

## Evidence

Filled at landing: what ran and where its output is.
