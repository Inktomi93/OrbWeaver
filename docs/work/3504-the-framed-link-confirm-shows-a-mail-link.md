---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
---

# The framed link confirm shows a mail link's path address only, and does not refuse headers smuggled in a header value

## What

For a mail link the framed link confirm's recipient line shows the address in the path. A `to` or `bcc` header adds recipients that appear only in the full address box. An allowed header's value can also carry text shaped like a further header, such as an attachment header after a question mark, a semicolon or an encoded ampersand. No mail client was tested.

## Why

The reader confirms a recipient line that does not name everyone the draft would go to.

## Done when

The recipient line names every recipient the address sets, a header value that carries a further header is refused, and a component test under `tests/client/features/chat/components/` covers each.

## Evidence

Filled at landing: what ran and where its output is.
