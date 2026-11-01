---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: tooling
plan: unwired-code
---

# Unwired scans link structurally equivalent twin types and whole-object handoffs so they stop reporting them as unwired

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Restated twins and whole-object hand-offs are the same shape as the spread link, and find-references cannot see them for the same reason. Treat them as new `Link` sources in engine one, not as engine two work (engine rules: item 1715). The forms to cover, each with a production site:

- A conditional spread into a literal: `packages/client/src/features/chat/hooks/use-guided-actions.ts`.
- A helper's returned object spread into a literal: `packages/client/src/features/credentials/components/draft-models-check.tsx`.
- A client `…Vars` twin of a router input: `packages/client/src/features/chat/hooks/use-membership-mutations.ts`.
- A whole object passed to a narrower parameter: `packages/ui/src/art/web-weave/web-weave-render.ts` hands the frame to `SpiderScene`.
- An uncontextual local literal: `packages/server/src/domain/imagery/persistence/portability-read.ts`.

The class B1 rows are real `never-written` findings and belong to their judgement items.

Landing evidence: filled at landing.
