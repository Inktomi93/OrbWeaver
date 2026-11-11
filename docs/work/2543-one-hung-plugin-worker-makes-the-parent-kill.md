---
kind: bug
status: doing
updated: 2026-11-11
priority: P1
area: security
lane: wt/agent-a84eabc3e8d8f0a49
---

# One hung plugin worker makes the parent kill the broker that serves every owner

## What

All plugin workers run under one broker process. When a command does not answer within the parent's timeout, the parent kills the whole broker (packages/server/src/infra/plugin-host/process-runtime.ts), and every owner's resident plugins fail until it restarts. Each failed call then counts as a strike against the bystander plugin, and after its strikes it is disabled as errored; the strike classifier exempts only a conflict error (packages/server/src/domain/plugin, the activate verb). Measured twice with production timers, on main and on the CPU window branch: a member's snippet that makes one long native string call, or one long loop between interrupt polls, holds its worker past the timeout, the broker is killed, and a second owner's resident plugin ends disabled. The engine polls its interrupt by step count and not by time, so no CPU window can bound one native call. A worker stuck inside a native call ends at once when the host terminates that worker. Source: the leg-six security review of the security lane under reports/review, which holds the probes.

## Why

Any member who can run a snippet can take down and disable every owner's plugins with one expression, on main today. The CPU window cannot close it; only ending the stuck worker alone can.

## Done when

A worker that does not answer by its deadline is terminated alone, its own invocation fails with the coded refusal, and the other workers keep serving; the broker is killed only when the broker itself does not answer. A teardown a plugin did not cause never counts as a strike against it, by a recorded decision. Real-guest tests with production timers: the long native call and the long poll-gap snippets each end at the deadline, a second owner's resident plugin answers during and after, and it holds no strike. The decision record for the CPU window states what the window cannot bound and that worker termination is the bound.

## Evidence

Filled at landing: what ran and where its output is.
