---
kind: adr
status: active
updated: 2026-10-05
supersedes: docs/adr/0203-admin-tier-system-tuning-knobs.md
---

# The admin tier wires four AppSettings system-tuning knobs

## Context

Split off ADR 0107, whose Phase B admin-tier record pushed it over the 8 KiB ADR cap. Of the knobs first wired here, agent-sdk summarize concurrency moved onto the connection, where every other wire states its concurrency, and the member budget window and the vLLM presence-penalty default left the admin tier.

## Decision

The admin tier wires four AppSettings knobs through the admin-anchored system-tuning section, each an env or born-in-DB floor with a nullable override, a section Reset, bounds from the schema home in packages/contracts/src/settings/index.ts, and a clamp on write: promptTransformDeadlineMs (born-in-DB floor 250, read per apply by the prompt transform registry); maxDatabankBytes (tighten-only: the schema max is the @orb/contracts/uploads route control, resolveUploadCaps takes the min, and the databank route rejects an over-cap file per request); catalogRefreshIntervalMs (the model-catalog refresh cadence, a live getter in the scheduler); imageVariantQuality (the lossy encoder quality, folded into the variant cache filename so a change regenerates). Agent-sdk summarize concurrency is features.concurrency.summarize on the connection, default 4 on the claude-sub row and bounded at SUMMARIZE_CONCURRENCY_MAX in packages/contracts/src/inference/features.ts.

## Consequences

A stored AppSettings blob that carries a knob no longer in the schema, agentSdkConcurrency among them, loses it at parse. The AGENT_SDK_SUMMARIZE_CONCURRENCY env floor is gone. The connection editor's utility calls row sets agent-sdk concurrency like every other wire's.

## Alternatives rejected

Leave the knobs hardcoded or env-only (rejected: an owner cannot tune them without a redeploy). Keep agent-sdk concurrency as an admin knob (rejected: the owner moved it onto the connection, where every other wire states it).
