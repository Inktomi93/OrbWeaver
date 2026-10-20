---
kind: bug
status: doing
updated: 2026-10-20
priority: P2
area: security
lane: wt/agent-a7d2c991bb03fc691
---

# sole-env-reader misses const-key and laundered process reads

## What

The env rule passes processDoor\[K] with const K = "env" on its imported-value path (the 1145 const-key family on the authz path), and process passed through a conditional, a logical, a call argument or a parameter default escapes it. The old and new gates both miss these.

## Why

An env read the rule does not see can change authorization, as the declare-var process plant gave a late user admin.

## Done when

Const-key access and each laundering form are judged as a process.env read or refused, with red-first planted rows; existing flag and pass rows hold.

## Evidence

Filled at landing: what ran and where its output is.
