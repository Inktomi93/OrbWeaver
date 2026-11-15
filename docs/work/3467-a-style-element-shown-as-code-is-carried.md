---
kind: bug
status: doing
updated: 2026-11-15
priority: P2
area: chat
lane: wt/agent-ad2e7ecc51f3d5bc1
---

# A style element shown as code is carried into the reply's other frames as live CSS

## What

`frameStyleElements` in `packages/kit/src/content/index.ts` reads a `<style>` inside inline code, a tilde code block or an indented code block as a real element. `replyParts` in `packages/client/src/features/chat/lib/reply-parts.ts` then carries it into every other run of a split reply as live CSS.

## Why

A CSS sample a character shows as code can restyle or hide the rest of that reply.

## Done when

A style element inside any Markdown code construct is never carried, read by the same reader the frame lift uses, and a test with a sample in inline code beside a split shows the other runs unstyled by it.

## Evidence

Filled at landing: what ran and where its output is.
