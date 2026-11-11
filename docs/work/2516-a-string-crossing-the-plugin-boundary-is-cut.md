---
kind: bug
status: doing
updated: 2026-11-11
priority: P2
area: plugins
lane: wt/agent-a84eabc3e8d8f0a49
---

# A string crossing the plugin boundary is cut at its first NUL in both directions

## What

The plugin host reads a guest's string argument and its string return value only up to the first NUL, and writes host strings to the guest the same way, nested values and object keys included (packages/server/src/infra/plugin-host, the marshal and sandbox modules). Nothing on the write paths strips a NUL, so chat text, card fields, lore, variables, storage values and fetched bodies can hold one. Measured with a real guest: a stored value of three characters with a NUL in the middle reads back as its first character, and a key with a NUL lists as its prefix, so two guest keys can alias to one. The security review found no authorization or validation bypass, because every host check and its use read the same prefix. Separately, the storage and variables functions in the membrane coerce an argument with String where the contract says it is a string; an array-wrapped argument passes through that coercion whole, which is how a NUL reached the storage check before the host-side size check landed. compareAndSet relies on a documented mapping of a non-string to a create. Source: the security lane report and its review under reports/lanes and reports/review.

## Why

Silent truncation is data loss a plugin author cannot see, and key aliasing lets one write overwrite another's key. A boundary that treats the same string differently depending on how it is wrapped is where the next bypass comes from.

## Done when

A string of any content crosses the boundary whole in both directions, travelling inside the engine's own JSON encoding, with a real-guest round-trip test for an argument, a return value, a nested value and an object key each holding a NUL. The storage and variables functions refuse a non-string where the contract says string, with the plain membrane refusal the handle, URL and id checks use; compareAndSet keeps its documented mapping of null or an omitted precondition to a create. The storage size tests deliver a NUL to the size check through the plain string path.

## Evidence

Filled at landing: what ran and where its output is.
