---
paths:
  - .claude/hooks/**
---

# Claude hooks

A `PreToolUse` hook that returns `permissionDecision: "allow"` skips the whole permission
system for that call, including the auto-mode classifier. It becomes the only gate left for
whatever it covers.

Give a blanket-allow hook its own deny or ask floor for dangerous shapes. Cover `sudo`, a
network-pipe-to-shell, `rm -rf` outside a safe target, and a bare `sqlite3` on the live db.
A blanket allow with no floor is less safe than no hook.

Before shipping a change to `tool-guard.mjs`, probe the dangerous shapes it should still catch.
Do not add a rule for a shape the user's own global settings already allow. A hook `ask` or
`deny` overrides that allow.

A hook binds at session launch. A running session does not pick up an edit to this directory.
