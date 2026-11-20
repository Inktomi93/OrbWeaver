---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: server
---

# A large chunked upload is held at its own size while its handler starts

## What

On the upgraded HTTP library a large chunked request body is held in memory at about four times its size when the handler starts. A security review measured it on the upload and folder-import routes, whose cap is the largest in the app. Only a signed-in user reaches those routes, and a browser upload sends a content length and skips that path. The edge applies the limit in `packages/server/src/entry/http/`.

## Why

A signed-in member on a small box can exhaust memory with one large chunked upload, and the product is sized to run on modest hardware.

## Done when

A server case sends a large chunked body to the upload route through the composed HTTP app and measures held memory near the body's own size, or the routes stream to their stage before buffering; the case is red before and green after.

## Evidence

Filled at landing: what ran and where its output is.
