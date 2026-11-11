---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: server
---

# A corrupt uploaded document is refused with a client error, not a server error

## What

`ExtractionFailedError` and `UnsupportedDocTypeError` in `packages/contracts/src/extraction/index.ts` extend plain `Error`. `classifyDomainError` in `packages/server/src/transport/trpc/error-mapping.ts` returns nothing for either, so a corrupt docx or epub that passes the upload signature check reaches `documentUploadRefusal` in `packages/server/src/entry/http/upload.ts`, which rethrows it, and the user gets a server error. The extraction headers promise a client-error answer. Found while testing the loaders under item 2466.

## Why

A user who uploads a damaged file is told the server broke, and the failure is logged as a server fault.

## Done when

A corrupt docx posted to the databank upload route answers a modeled client error that names the reason, nothing is stored, and a test over the real HTTP route proves it, beside a valid upload that lands.

## Evidence

Filled at landing: what ran and where its output is.
