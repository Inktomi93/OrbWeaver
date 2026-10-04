---
kind: bug
status: open
updated: 2026-10-04
priority: P1
area: chat
---

# The Databank upload accepts exactly what the upload route stores

## What

DOC_UPLOAD_ACCEPT (packages/contracts/src/extraction/index.ts) is built from the extractor's mime table, but the upload route also runs the asset store's byte check. An .html or .htm file is accepted by the dropzone and then always refused (text/html is in ACTIVE_MIMES, packages/server/src/domain/assets/substrate/mime.ts:37-45). A file the browser gives no type (.epub, .docx, .md) is accepted by suffix, sent as application/octet-stream (packages/server/src/entry/http/upload.ts:190) and refused for unverifiable magic. databank-model.test.ts asserts the typeless .epub is accepted. tests/ui/primitives/file-dropzone/accept.test.ts:13 still hard-codes the old Databank list. Found by the S6 recheck.

## Why

A user picks a file the picker allows and gets Upload failed with no reason.

## Done when

The dropzone accepts only files the upload route stores: either the route infers the mime from the suffix when the browser sends none, or the suffix entries it cannot honour leave the list; HTML is either dropped from the list or stored through a safe mime as scrape does; a test drives each case through the real accept check and the route; the stale test list reads the shared constant.

## Evidence

Filled at landing: what ran and where its output is.
