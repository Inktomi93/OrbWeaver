---
kind: bug
status: doing
updated: 2026-11-15
priority: P1
area: client
lane: wt/agent-ae0fdd0e39a57d5b8
---

# A request the server refuses as too large shows a message about content type instead of size

## What

When the server answers a tRPC call with status 413, the client shows that the server answered with no content type instead of JSON. The reader is not told the file is too large or what the limit is. Other non-JSON refusals at the HTTP edge may read the same way.

## Why

The first outside user could not tell that her preset file was over the size limit, and the owner could not either.

## Done when

A 413 from any call shows that the file or request is too large and states the limit. An import surface checks the file size against the limit before it sends and says so at once. Each other status the HTTP edge answers without a JSON body maps to a plain message, listed in the report. A test drives a 413 through the client's error path and asserts the error kind.

## Evidence

Filled at landing: what ran and where its output is.
