# `@orb/client/features` — the flat feature-slice layer

**Law:** `docs/architecture/core/UI-Architecture-and-Layout.md` §2.1 (the tree) + §4/§4b (the container
model). This file is the per-slice shape at your fingertips; the doc wins on any conflict.

## The slice shape (every feature dir)

```
<feature>/
  surfaces/     # containment CONSUMERS — pure content; query @container variants; NO layout-context props (§4)
  anchors/      # containment PROVIDERS — wrap a surface in container-type: inline-size + container-name (§4)
  components/   # leaf presentational bits — COMPOSE @orb/ui primitives; never hand-roll UI (§1.1 physics)
  hooks/        # data reads via trpc.* (useGatedQuery) + createEntityMutation calls (§13.1)
  lib/          # feature-local pure helpers
  index.ts      # the feature's ONLY public surface (front door)
```

`app-shell/` is scaffolded to this shape as the canonical exemplar; the other slices land with their
own chunk.

## Hard rules (law / gated)

- **Flat slice, NOT FSD** — no `entities/` / `shared/` layers. `@orb/ui` IS the shared-component home (§2.1).
- **Cross-feature reads go through `trpc.*` ONLY** — never import another feature's internals; there is no
  `_shared/` drawer (§11.0). A feature is an island; the server is the only cross-feature channel.
- **Features COMPOSE, never PAINT** — no raw styled intrinsics / `className` on `<div>`; compose `@orb/ui`
  primitives + the layout kit. The kit is the only painter.
- **The responsiveness model IS the folders** — a component responds to its `@container` (its surface),
  not the screen. Anchors provide containment; surfaces consume it.

## The slices (§2.1)

`app-shell` (the 4-region rail frame: RAIL | LIST | CONTENT | CONTEXT — the one viewport `@media` site) ·
`auth` · `character` · `chat` · `corpus` · `credentials` · `persona` · `preset` · `prompt-manager` ·
`settings` · `tag` · `user-admin` · `workloads` · `world-info`.
