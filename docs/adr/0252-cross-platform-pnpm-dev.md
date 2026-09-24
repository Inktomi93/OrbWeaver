---
kind: adr
status: active
updated: 2026-09-24
---

# A cross-platform pnpm dev is the self-hoster's front door

## Context

The dev stack had one front door, pnpm stack, a bash tool tied to this dev box's vLLM fleet. There was no pnpm dev alias. A self-hoster on another platform had no plain way to run the app from source.

## Decision

Ship a cross-platform pnpm dev that runs the server and the client from source on any platform, without bash and without the vLLM engine fleet. pnpm stack stays the dev box's fleet-aware front door and keeps ENGINES_POSTURE. This overrides the earlier ruling that pnpm stack is the only front door (tooling/src/stack/dev.sh header, Core-Tooling-Law).

## Consequences

The dev.sh header and the tooling law change with the pnpm dev lane. Model backends reach pnpm dev only through connections (openai-compat for a local vLLM, agent-sdk for a Claude subscription).

## Alternatives rejected

Keep pnpm stack as the only front door: it needs bash and assumes this box's fleet.
