---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: inference
---

# A refused redirect names where it pointed and what to type instead

## What

`fetchJson` in `packages/inference/src/backends/http/fetch-json.ts` and `packages/inference/src/backends/v4/fetch.ts` each spell `the endpoint answered N with a redirect, which is never followed (host pin)`. The host pin dials with `redirect: "manual"` and refuses any 3xx, so a server that redirects (a website host to its API host, http to https) fails with a message that names neither the `Location` nor what to do, uses the jargon 'host pin', and has separate copies that can drift. The model picker shows it as "Couldn't list X's models: ...".

## Why

A user who typed the website host of a hosted service sees a failure with no hint that the right Server URL is one paste away.

## Done when

One exported message builder names the redirect's host and says to use that address as the Server URL, both call sites use it, and a Node case through the composed draft dial asserts a refused 3xx names the target host in the Server URL field's failure line.

## Evidence

Filled at landing: what ran and where its output is.
