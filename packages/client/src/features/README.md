# `@orb/client/features` — the flat feature-slice layer

**Law, in precedence order:** `docs/law/client-architecture-lockdown.md` (D70 — the tier
ladder §3, the registry model §5–§8, the channel table §12) → `docs/law/UI-Architecture-and-Layout.md`
§2.1 (the tree) + §4/§4b (the container model). This file is the per-slice shape at your fingertips and a
POINTER card; both docs win on any conflict, and the gates below win over all prose.

## 0. What a feature IS

**A feature dir earns its existence by OWNING at least one registered definition** — a rail section, a
modal, a settings pane, or a chrome widget, co-located at `lib/*-{section,modal,pane,chrome}.tsx` and
exported on the front door. Gate `feature-owns-definition` (G23) deletes-or-reds anything else; there are
no exemptions (`prompt-manager` was deleted rather than exempted). A dir of helpers with no definition is
not a feature — it is either tier-2 `components/`, tier-4 `lib/`, or nothing.

**The roster is the TREE, not a list in this file.** A hand-maintained slice list rots (this one used to
name a dead `corpus` and miss six live slices). `ls packages/client/src/features` is the roster. What the
tree does NOT tell you: a section id is not a mechanical mirror of its owner's dir name — `corpus` →
`features/discovery`, `analytics` → `features/stats`, `chats` → `features/chat`. Ownership is declared by
WHERE the definition lives; G1 keys on location, never on name derivation.

## 1. The slice shape (every feature dir)

```
<feature>/
  surfaces/     # REGION-level bodies — what a section def's list/content, or a modal/pane, MOUNTS.
                #   Containment CONSUMERS: pure content, @container variants, no layout-context props (§4)
  anchors/      # containment PROVIDERS — wrap a surface in container-type: inline-size + container-name (§4)
  components/   # everything mounted INSIDE a region: leaf bits, context-tab bodies, contributed
                #   settings-section bodies. COMPOSE @orb/ui primitives; never hand-roll UI
  hooks/        # use-*.ts — data reads via trpc.* (useGatedQuery) + createEntityMutation calls
  lib/          # feature-local pure helpers, VIEW-MODELS, and the feature's registered DEFINITIONS
  index.ts      # the feature's ONLY public surface (front door)
```

Naming is gated (`client-structure`): `surfaces/*.tsx` end `-surface.tsx` and may not render their own
outer `Dialog`/`AlertDialog`/`Drawer` (that box is an anchor's job); `hooks/` files are `use-*` (or
`*-context.tsx`/`*-provider.tsx`); `anchors/` files end in a container-type suffix. Only `index.ts` and
notes live at the slice root, and the bucket set is closed.

**Bucket nesting is legal in EVERY bucket, and changes no rule** (lockdown §3, F-4): group a big bucket
into sub-dirs (`preset/components/{prompt-assembly,readout}/`) and the per-file contracts follow the files
down — `client-structure` recurses. A group dir may not be NAMED after a bucket (`components/hooks/` is a
slice growing inside a slice).

**A bucket may be absent.** `rpg` ships no `surfaces/` and no `anchors/` at all: everything it owns mounts
inside a host's region, so all of it is `components/`. That is correct, not an omission.

## 2. The judgment calls the tree already answers (settle these here, don't re-decide)

| Question | The answer, as built |
| - | - |
| Where does a view-model go? | `lib/` — `preset/lib/preset-editor-model.ts`, `character/lib/character-card-form-model.ts`, `user-admin/lib/*-model.ts`. Uniform across every feature |
| Context-tab / claimed-pane body: surface or component? | `components/`. `surfaces/` is region-level only; anything mounted INSIDE a region is a component |
| Settings-section anatomy | four files, two buckets: def `lib/<x>-section.tsx` + nav `lib/<x>-nav.ts` + model `lib/<x>-model.ts` + body `components/<x>-section.tsx`. The def and its body deliberately share a basename across buckets. UNIFORM: every settings-section def on the tree delegates to a `components/` body — none inlines one |
| `-section.tsx` means two things | `lib/chats-section.tsx` is a `SectionDefinition` (a RAIL section); `lib/appearance-avatars-section.tsx` is a `SettingsSectionContribution` (a settings-pane section). The filename does not distinguish them — the exported TYPE does. G23 accepts both as "owns a definition" |
| Feature-local store? | No such thing. EVERY store lives in the central `state/` commons, minted through one of the three doors — so a pointer another feature must read is never trapped behind a feature boundary (lockdown §9) |
| A new `.css` file for my feature? | Never. The path-closed six-home paint law and the one bounded shell-frame exception live only in `docs/law/client-architecture-lockdown.md` §4; do not restate or widen them here |

## 3. Cross-feature needs — pick the channel, don't invent one

**The old rule on this line — "cross-feature reads go through `trpc.*` ONLY; a feature is an island; the
server is the only cross-feature channel" — is SUPERSEDED and was wrong for client-ephemeral state** (there
is no row to fetch). The decision table is **lockdown §12**, eleven rows with their enforcers. The
three you will actually reach for:

- **Another feature's SERVER-persisted entity** → `trpc.*` queryOptions. Cache-first: with
  `staleTime: Infinity` + bus-driven freshness this is a cache hit, not a round-trip.
- **A client-EPHEMERAL pointer** (active chat/section/selection, panel mode, a draft, a filter) → the
  `#state` commons: read via narrow hooks, write via intent-named module actions. A trpc call for the
  active chat id is retire-on-sight.
- **EXTENDING another feature's surface** (a tab, a pane claim, a settings section, a home tile, a slash
  command, a tool renderer, a surface anchor) → raise a CONTRIBUTION and let `main.tsx` assemble it. You
  export a definition; the door imports both sides; neither feature imports the other.

What stays banned: importing another feature's internals at runtime (`client-feature-front-door` +
`client-features-no-cross`), a `features/_shared/` drawer (dissolved — generics → `@orb/ui`, the form
toolkit → `forms/`), a store mirroring server rows, and an ad-hoc event emitter. Type-only cross-feature
imports ARE allowed (a shape wired at the composition root).

## 4. Building a new feature — the checklist

1. **Name it** after the server domain it serves (`client-structure` rule 2 checks against
   `packages/server/src/domain/*`), or add it to the gate's `RESERVED` set with the reason it is UI-only.
2. **Decide what it OWNS** before writing UI: a rail section (`SECTION_IDS` member + a
   `SectionDefinition`), a modal, a settings pane, a chrome widget — or, if it owns none of those, it is
   a contribution to an existing host and probably not a new feature at all (G23).
3. **Write the definition first**, co-located at `lib/<id>-{section,modal,pane,chrome}.tsx`, and export it
   on `index.ts`. `content` is a real body or the declared-`{ planned: "<reason>" }` arm; `context` is a
   real `ContextDefinition` or the explicit `{ kind: "none" }` — absence is not a state.
4. **Register it at the door** (`main.tsx`) and nowhere else — G8. A total registry (`sections`, `modals`,
   `settings-panes`) is `Record<Id, Def>`-total by tsc, so it will not compile until you do.
5. **Reach DOWN the ladder before hand-rolling**: `@orb/ui` → `components/` → `{data,forms,state}/` →
   `lib/`. Mutations ride `createEntityMutation`; paginated browse rides `createCollectionSurface`;
   ≥3-field forms ride a form factory; destructive confirms ride `ConfirmDialog`; suspending reads sit in
   `QueryBoundary`. Each of these is a sealed gate, not a preference (lockdown §1's table names the wall).
6. **Ship all three states** — designed EMPTY (with an action), a shape-matched skeleton, and
   `QueryErrorState` with a real retry. A bare spinner or a dead-end empty is a defect (§11).
7. **Mirror the tests** at `tests/client/<path>` — never beside the source (`test-layout`).
