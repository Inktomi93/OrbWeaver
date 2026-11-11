---
kind: bug
status: doing
updated: 2026-11-11
priority: P2
area: security
lane: wt/agent-a84eabc3e8d8f0a49
---

# A promise handed to the plugin host makes it dispose a handle it still uses

## What

When guest code passes a promise to a host function, throws one, or rejects into the host with one, the engine binding's dump of that value disposes a handle the host goes on to use (packages/server/src/infra/plugin-host, the sandbox and marshal modules). Measured on main with a real guest: a member's snippet ends in an engine abort or a dead-handle error; a resident plugin that does it poisons its own engine, and disabling that plugin then aborts the engine and shutdown reports a failed retirement. Read from the code and not measured: a failed retirement also rejects every queued call from other plugins. Source: the leg-three security review of the security lane under reports/review, which holds the probes.

## Why

Any member who can run a snippet, and any installed plugin, can take the plugin engine down for everyone with one line. The sandbox is the trust boundary and a guest value should never be able to corrupt the host's handle accounting.

## Done when

A promise, a thenable and a rejected promise arriving as an argument, a thrown value or a rejection are each refused or settled without disposing a live handle, with a real-guest test for each that also shows the engine serves the next call and retires cleanly. A failed retirement of one plugin's engine does not reject another plugin's queued calls, shown by a test or by the code path being closed.

## Evidence

Filled at landing: what ran and where its output is.
