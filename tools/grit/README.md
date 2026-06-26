# GritQL lint plugins

Custom AST gates Biome runs via the `linter.plugins` array in `biome.json`. They express
single-file pattern rules that `tsc` and dependency-cruiser can't ergonomically — branded-ID
discipline, the N+1 db shape, the time seam, the group-vs-solo invariant.

## Active (registered in `biome.json`)

| Rule | Catches | Maps to |
|---|---|---|
| `no-raw-id` | a Zod `*Id` field as raw `z.string()` | branded `typeid` (`@orb/kit/ids`) |
| `no-loose-id-cast` | `as never` / `as unknown as <XId>` | branded-ID laundering |
| `no-mint-via-cast` | `castId(<generator>)` | mint via `mintTypeId`/`newId`, not re-brand |
| `no-await-db-in-loop` | `await db.<query>` in a loop | N+1 → batch (`inArray`/`db.batch`/`.values`) |
| `no-raw-intl-time` | `Intl.DateTimeFormat`/`RelativeTimeFormat` | the one time seam (`@orb/kit/time`) |
| `no-if-is-group` | `isGroup`-style identity boolean | unified group chat (solo = degenerate group) |

These are ported + adapted from neo-tavern to orbweaver paths/conventions and map to **decided**
conventions, so they're live.

## Staged — `_staged-client/` (NOT registered)

Eight rules brought over verbatim from neo-tavern that encode **client architecture decisions
orbweaver has deliberately deferred to the client scaffold** (ledger §3 — UI engine = Base UI, TBD):

- `no-color-literals`, `no-raw-z-index`, `no-raw-spacing-in-features`, `no-raw-typography-in-features`
  — assume a Tailwind **intent-token** system (`bg-card`, `gap-row`, `text-body`, `z-modal`) +
  layout primitives (`<Stack>`/`<Row>`) that orbweaver hasn't designed.
- `no-chat-trpc-in-surface`, `no-inline-optimistic-in-surface` — assume the `surfaces/`-vs-`hooks/`
  split + a TanStack-Query optimistic helper.
- `no-direct-useform`, `no-form-state-in-useeffect` — assume TanStack Form + a `_shared/form` toolkit.

**To activate (at the client scaffold):** once the client's token system / layout primitives / form
lib / surface convention are chosen, adapt each rule's `$filename` guards (`src/client/…` →
`packages/client/src/…`) and its token/component names, move it up into `tools/grit/`, and add it to
`biome.json` `linter.plugins`. Until then they are inert reference, not active gates.
