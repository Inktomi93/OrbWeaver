---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A framed reply's dice paragraph shows unknown directives as text in the main document

## What

`replyParts` in `packages/client/src/features/chat/lib/reply-parts.ts` projects with `keepUnknownDirectives: true`. A dice-stamped paragraph becomes a native markdown block, and `FramedReply` in `packages/client/src/features/chat/components/message-content.tsx` renders it through `renderBlock`, which does not re-tokenize. So an unregistered `:::name` block or an attributed self-closing tag in that paragraph renders as text under the row's trusted policy. The inert fallback already projects again through `MessageSegment`.

## Why

Unknown directives are hidden on the reading surface everywhere else (`CONTENT_CLASS_POLICY` reading `hide`). The flag is meant for frame documents only.

## Done when

A native markdown part of a framed reply renders through `MessageSegment`. A dom or CT case shows a dice paragraph holding an unknown directive renders without the directive text.

## Evidence

Filled at landing: what ran and where its output is.
