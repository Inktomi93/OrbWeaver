---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: server
---

# An API request never receives the app page as its answer

## What

Owner, v0.2.0: a tRPC batch (notifications.list, plugin.listCommands, refinery.listSessions, settings.getUserSettings, chat.getChat) failed after about 13.4s with 'Unexpected token <, \<!doctype ... is not valid JSON'; the server logged no request for that attempt (its event loop was blocked by 13-18s character.list calls), and the client's retry a second later succeeded in 30ms. The lowercase \<!doctype points to the app's own index.html being served for an /api POST, not Caddy or Cloudflare (Caddy proxies orbweaver:8788 with 1800s timeouts and no auth layer).

## Why

An API route answering with the SPA page turns a slow server into a confusing JSON parse failure.

## Done when

The source of the HTML answer is reproduced (blocked event loop plus an /api POST) and fixed so /api paths never fall through to the SPA page; a slow or failed API call surfaces as a timeout or HTTP error the client reports clearly; a test sends an /api request that misses every route and asserts a JSON error, not HTML.

## Evidence

Filled at landing: what ran and where its output is.
