---
paths:
  - "packages/server/src/**"
  - "tests/server/**"
---

# Server domains and infra

## Lists, auth, events

- A paged or virtualized list pushes every view (search, sort, filter, favorites) to a
  server query param. Never resolve an entity from a paged list with `.find()` or
  `.some()`; call its own `get()`.
- Brand a process-wide map's key type when it gains a scoping dimension, so a bare
  lookup fails to compile.
- A heal or detach verb for a vanished entity gates on the parent-FK membership
  directly, not the entity's own (now-gone) auth gate. A multi-scope junction read
  needs a per-case owner check, not one caller-wide filter.
- A fire-and-forget emit must never throw when its durable write rejects; classify a
  failed append by probing whether the aggregate still exists, and emit before
  deleting it, never after. A derived index rebuilt after a durable write must not
  reject the write; latch it stale and let the bus retry.
- `domain/*/substrate/**` and `domain/*/engine/**` are not type homes; export through
  the domain's `contract/` or `@orb/contracts`.

## automation (`domain/automation/**`)

- Rule dispatch runs in mint position order over one shared CEL env
  (`substrate/cel-env.ts`); a preset that stamps then reads a var mints a private key.
- `update-rule`'s PUT clears `rule_preset` provenance on purpose; a new per-rule
  preference gets its own verb, never the PUT.

## settings (`domain/settings/**`)

- `substrate/merge.ts`'s `deepMergePlain` recurses on plain objects, so `{}` is a
  no-op; `null` is the only merge-expressible clear. Test a clear-via-patch end to end.
- Stamp `USER_SETTINGS_SCHEMA_VERSION` (`@orb/contracts/settings`) on a versioned
  fixture, never a version literal, or the v1→v2 lift drops the override.
- A settings latch can revert to defaults silently; gate a latch-only seeder with a
  data-derived second check that heals it.

## tool-use (`domain/tool-use/**`)

- A model-facing tool argument schema holds only JSON-Schema-representable fields: no
  branded-id or `.transform()` field, and no id a model cannot author.

## import, character, filesystem

- Never dedupe an imported character by name; a byte-new card is always a new
  character. Only its per-owner handle gets a numeric suffix on collision. A pack
  migration writes a field only where it can prove the live value is still the prior
  pack's.
- Realpath both ends before comparing staged-path containment, open reads with
  `O_NOFOLLOW`, and `lstat`-refuse symlinks before `rm`.

## refinery (`domain/refinery/**`)

- An output-budget window reserve scales with input size; a fixed constant
  undercounts as input grows. A batch fetch over an all-or-nothing surface needs a
  per-item isolation wrapper, or one bad item fails the whole batch.

## workloads (`domain/workloads/engine/**`)

- `reaper.ts` gates a reap on positive liveness (a port health check, a heartbeat),
  never on cwd or parent-pid alone; a sibling process can share both while it is
  still healthy.

## infra

- fflate's `zipSync` derives its DOS date from local time and throws on mtime 0 or
  1980-01-01Z; use a mid-year UTC stamp for deterministic archives.
