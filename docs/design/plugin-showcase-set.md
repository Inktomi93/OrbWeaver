---
kind: design
status: draft
updated: 2026-09-05
---

# The plugin SHOWCASE set (#774) — nine seeded plugins, full capability coverage, developer teaching material

> **Commission.** #774 elevated + corrected by two owner comments: (1) the seeded plugins are the SHOWCASE —
> collectively they exercise EVERY landed plugin surface, each is a genuinely good little product, and
> (2) "teaching" means DEVELOPER reference material — copyable, well-commented example code + per-plugin
> READMEs + the authoring guide + a published `host-v1.d.ts` (the U1 carry-forward), the
> SillyTavern-example-extension-repo model. Acceptance is a LIVE side-eye drive plus a code-quality read.
> Built by lane forge-showcase on `02b519f31`; every tree claim below was re-verified on that tree, and every
> external-API claim was probed live on 2026-08-28 from this box.

## §1 The set (one screen)

Five upgraded + four new. Each plugin teaches a FOCUSED slice; the SET covers all 20 `PLUGIN_CAPABILITIES`
members, all 7 anchors, all 3 tiers, and every host-mediated affordance (the coverage matrix is §3).

| Slug | Archetype (what it teaches) | New/upgraded |
| - | - | - |
| `research-familiar` | event reactor: markers, debounce, `net.fetch`, `worldInfo` vs **`databank.ingest`** (new arm: `((clip: …))` files a full article into your databank) | upgraded |
| `oracle-deck` | tool provider + the whole UI plane: tool-card, page, dialog, commands (**now #791 typed args**), toasts, **`macros.register`** (the `omen` value macro), **`pubsub.emit`** (announces draws), the smallest honest `message-footer` mark | upgraded |
| `affinity-tracker` | quiet thinker: `llm.quiet` + strict parse, settings panel, per-room flank, Tier-C `ui.js` — **fix: the `ui.register` grant guard** (#774 comment 1) | upgraded (fix + guard only) |
| `draft-polish` | the text pipeline: D50 prompt transform + **`transforms.registerDisplay`** (same pure engine, two seams — what the model reads vs what you see) | upgraded |
| `scene-chips` | room surface: quick-reply chips + **`pubsub.on`** (subscribes to the oracle's draws; the composition demo) | upgraded |
| `card-atlas` | **THE FLAGSHIP** — the hub browser: `ui.page` masterDetail (search → grid → preview → import), `net.fetch` over two live sources, `character.ingest`, `character.card_state` provenance stamps | NEW |
| `story-clocks` | room mechanics: `chat.variables.write` (the member-visible plane), `chat-settings-section` (host controls), a tool the model ticks, **`turn.trigger`** on a filled clock | NEW |
| `keepsake-camera` | the spender: `llm.quiet` **with `schema`** (structured output) → `imagery.generatePicture` → a real-media gallery page; typed-arg command | NEW |
| `pocket-arcade` | the escape hatch: `ui.frame` ONLY — a complete self-contained game (2048) at `chat-flank`, themed by the injected `--sandbox-*` vars | NEW |

Deliverables beside the plugins: the upgraded authoring guide (`packages/showcase-plugins/bundles/README.md` — see §5),
per-plugin READMEs, **`host-v1.d.ts`** + its conformance pin (§4), the extended
`tests/server/entry/boot/seed-example-plugins.int.test.ts`, and (fork-gated, §6.1) the `grid` bound-tiles
vocabulary arm.

## §2 Ground truth the design is built on (recon receipts)

| Fact | Receipt |
| - | - |
| The full API is landed: 20 capabilities / 33 gated host fns incl. U5–U8 (commands+typed args, toast, dialog, page, footer, display transforms, macros, frame, pubsub, ingest ×2, card_state) | `packages/contracts/src/plugin/manifest.ts:13-64` · `host-v1.ts:489-548` |
| Adding a seeded plugin = source dir + one tuple member; the packer + `pnpm plugin:pack` + the seeder all derive from `EXAMPLE_PLUGIN_SLUGS` | `seed-example-plugins.ts:38` · `seed-assets/index.ts:88-108` · `scripts/pack-plugin.ts` |
| A STATIC surface's collection nodes are SPEC-fixed in cardinality; `setState` feeds values only — ghost tiles render for unresolved bindings (no skip in `SurfaceGrid` or `MediaTileGrid`) | `contracts/plugin/ui.ts:441-465` · `features/plugin/components/plugin-browse-nodes.tsx:53-71` · `ui/src/primitives/media-tile-grid/media-tile-grid.tsx:110-121` |
| A SCRIPTED surface renders dynamic trees but CANNOT fire effects: events go only into `ui.js`; the proxy tuple is reads + 2 KV planes (no fetch, no ingest) | `plugin-scripted-surface.tsx:144-146` · `host-v1.ts:624-634` |
| A `message-footer` spec must be STATIC (bound specs are skipped at the mount) and decoration-only — per-row facts are inexpressible | `plugin-message-footer-surfaces.tsx:57-66` · `ui.ts:220-244` |
| A pubsub subscriber is invoked with a NULL chat scope — no `chat.current()`, no room writes; per-install state + global `setState` only | `domain/plugin/substrate/plugin-event-bus.ts:61-63` |
| The U7 frame's host-call bridge is UNWIRED at every mount (`hostCall` prop never passed) — a frame is self-contained pixels; theme reaches it as exactly `--sandbox-bg`/`--sandbox-fg` + the font | `plugin-frame.tsx:59-98` + zero `hostCall` call sites · `ui/src/content/sandbox-frame/use-sandbox-theme.ts:17-22` |
| Tier-C guest surface: `orb.ui(1)` = version/grants/clock/random/log/render/onEvent/host.{chat×2,variables×3,storage×4}; the event payload is `{surfaceId, event: {type:"action",actionId}|{type:"field",name,value}, values}` | `ui-guest-realm.ts:150-238` · `ui-guest.worker.ts:143-156` |
| `host-v1.d.ts` does not exist anywhere on the tree (git ls-files + rg --files, both empty) | absence check 2026-08-28 |
| `character.ingest` consumes `parseCardJson`, which accepts the minimal canonical `{data:{…}}` shape (defaults applied; repair-then-validate) | `domain/import/substrate/card.ts:131-160` |
| **Live sources (probed 2026-08-28):** Character Tavern search `GET character-tavern.com/api/search/cards?q&page` (Meilisearch hits/totalHits/totalPages) + detail `GET /api/character/:author/:slug` returning full `definition_*` fields; RisuRealm search `GET realm.risuai.net/__data.json?search=` (devalue-flattened, 57 KB « the 1 MiB plugin cap) + documented download `GET /api/v1/download/json-v3/:id`; **chub.ai geo-blocks this box** ("not available in your country") | probes in lane log; legacy adapters `legacy-main:packages/server/src/infra/network/hubs/{chartavern,risurealm}.ts` |
| The legacy hub's PROVEN logic to carry as semantics: the chartavern `definition_*`→canonical `{data:{…}}` reshape (deterministic key order ⇒ stable importHash), its two-mapper search/detail split, the realm devalue un-flatten + compact-count parse, cheapest-first admission | legacy files above, re-probed against today's wire |

Memory lessons consulted (by file): `plugin-tool-handler-no-room-identity` (deck state is per-install),
`plugin-frame-hatch-rides-card-frame` (frame walls), `ui-proxyable-excludes-host-mediated-effects` (Tier-C
tuple), `palette-rows-are-a-dynamic-source-not-a-slash-contribution` (commands surface as palette rows),
`plugin-tool-wire-name-is-one-mint` (never re-derive `plugin_*` names), `plugin-consent-is-reach`
(netHosts widening ⇒ re-consent — the atlas README teaches it), `guest-job-pump-outside-the-interrupt-handler`
/ `membrane-async-ctx-alive-guard` (why handlers must never hang), `eval-shaped-marshalling-seam`.

## §3 The coverage matrix (bar 1 — every capability/surface mapped)

Capabilities: `chat.read` familiar/affinity/chips/clocks/keepsakes · `chat.variables.write` clocks ·
`chat.quick_reply` chips · `chat.transform` polish(×2 seams)+oracle(macro) · `worldinfo.write` familiar ·
`global_vars` familiar · `storage.kv` most · `notify` affinity · `ui.surface` oracle/affinity/clocks/atlas/
keepsakes · `ui.frame` arcade · `turn.trigger` clocks · `imagery.generate` keepsakes · `llm.quiet` affinity
(prose)+keepsakes(schema) · `databank.ingest` familiar · `character.ingest` atlas · `character.card_state`
atlas · `events.subscribe` familiar/affinity/chips/clocks · `plugin_events` oracle(emit)+chips(on) ·
`tools.register` oracle/clocks · `net.fetch` familiar/atlas. **20/20.**

Anchors: settings (affinity ×2) · chat-flank (affinity, clocks, arcade-frame) · chat-settings-section
(clocks) · tool-card (oracle) · message-footer (oracle — §6.2) · page (oracle, atlas, keepsakes) · dialog
(oracle). Tiers: static everywhere · scripted (affinity `ui.js`) · frame (arcade). Affordances: commands
(oracle, keepsakes — both with #791 typed args: enum + number + string) · toast (oracle, clocks, atlas,
keepsakes) · openDialog (oracle) · macros (oracle) · display transform (polish) · prompt transform (polish) ·
pubsub both halves · per-room `setState(chat)` (affinity, clocks) · `PluginQuietSchema` (keepsakes) ·
browse nodes grid/masterDetail/searchBar+filters (atlas; keepsakes grid).

**Priced omissions (stated, not hidden):** `llm.quiet` `imageAssetIds` (vision) — no seed exercises it; it
needs a vision-capable connection in the drive env and would double keepsakes' spend per snapshot; the
authoring guide documents the arm. `matchAutomationEvents: true` — no seed needs cascade facts; documented
in the guide's manifest table. Frame-tier `page`/`dialog` — refused by `PLUGIN_ANCHOR_TIERS` until the
client mount lands (`ui.ts:183-191`), not reachable by any plugin.

## §4 `host-v1.d.ts` — the published types, and how they cannot drift

**Home: `packages/showcase-plugins/bundles/host-v1.d.ts`** (moved out of the server package with the
bundles, #1692) — beside the examples, for the
same reason the examples live there (the deployed image copies `packages/*/src`; a `docs/` or repo-root home
would not exist in a running container — the README's own placement rationale). A plugin author copies ONE
file next to their `main.js`/`ui.js` and an editor gives them completion + checking in plain JS.

**Shape: a SCRIPT-kind global declaration file** (no imports/exports — VS Code picks globals up for `.js`
files with zero config): `declare const orb: { host(version: 1): PluginHostV1; ui(version: 1): PluginUiV1 }`
plus the full re-spelled surface — `PluginHostV1` (all 15 namespaces), the `TriggerFact` union (all-plain-
strings by its own schema's design, `contracts/automation/index.ts:648-712`), the surface-spec node
vocabulary, command arg specs, and the Tier-C `PluginUiV1`. Handles are declared as plain `string`
documented as opaque — the contract's brands (`ChatHandle`, `AssetId`, `CharacterId`) are `unique symbol`
intersections (`kit/ids:11-14`) a self-contained file structurally cannot share, and a guest never
constructs one anyway.

**Rejected alternatives:** (a) generating the file from the contracts (no api-extractor-class machinery on
the tree; a generator is a new instrument this deliverable does not need — the pin below gives the same
drift guarantee); (b) a module-kind `.d.ts` importing `@orb/contracts` (useless outside the monorepo — the
whole point is an author WITHOUT the repo); (c) homing it in `packages/contracts` (the published artifact
is part of the example-plugin SDK folder, and contracts' own file is the one true source it mirrors).

**The conformance pin, AS BUILT** (`tests/contracts/plugin/host-v1.test-d.ts` — renamed from the
planned `host-v1-dts` spelling, see the dated repair below): brings the script-kind globals in via `///
<reference path>` PLUS an explicit root-tsconfig include, then asserts per-NAMESPACE mutual assignability
against the contract through a targeted brand-erasure walk (`ChatHandle|AssetId|CharacterId → string`) with
plain typed accept-functions, plus exact `toEqualTypeOf` pins on every closed union and the namespace key
set. Two instrument shapes were tried and REFUTED by planted controls before this one (whole-host
comparisons `any`-bail at TS's instantiation depth over the recursive spec union — a pin that cannot fail);
the landed shape's plants fire BOTH directions through ts7 with member-exact TS2345 diagnostics. The
`no-inline-types` gate passes the file by its own rules (script-kind = nothing exported); the SERVER
per-package program excludes it (ambient hygiene — `packages/server/tsconfig.json`'s commented exclude row).

**DATED REPAIR 2026-08-28 — the vitest typecheck lane serves STALE verdicts for /// -referenced files.**
Measured, not argued: a planted wrong return type in the referenced `.d.ts` went red (correct); after a
byte-verified restore the lane stayed red WITH THE PLANTED TEXT through repeat runs, `--no-cache`,
`rm -rf node_modules/.vite/vitest`, and `touch`, while the same checker + config invoked directly
(`node node_modules/ts7/bin/tsc -p tsconfig.json`) judged the tree correctly every time; RENAMING the test
file purged the ghost instantly. Consequence folded into the design: `types:graph` is the pin's
authoritative enforcement tier (it compiles the same file — planted control proven there); the vitest lane
is a belt; the staleness itself is filed with the orchestrator as a fix-tools row.

## §5 The authoring guide + per-plugin READMEs

**One home: the existing `packages/showcase-plugins/bundles/README.md` IS the authoring guide** — it is already titled
"Writing an Orbweaver plugin" and already carries the deployment-path rationale; a second guide under
`docs/` would be a second home for the same concept (and invisible in a deployed image). It is STALE against
U4–U8 and gets the full rewrite: the three-entry bundle (`ui.js`), all 20 capabilities with their postures,
the UI plane (anchors/tiers/nodes/bindings/state), commands + typed args, toasts/dialogs, macros, display
transforms, the pubsub plane, the ingest + card_state pair, the frame hatch (with its honest consent story),
`host-v1.d.ts` usage, and the archetype index over NINE examples. Per-plugin READMEs (no frontmatter —
`packages/**` markdown is outside the doc catalog, as the five existing ones already are) each state: what
it does, which capabilities and WHY each, the file tour, what to copy it for, and how to modify/repack.
This design note is the lane's only `docs/**` artifact (frontmatter + `check:docs` + catalog receipts owed
at merge — flagged to the orchestrator).

## §6 Forks

### 6.1 The `grid` bound-tiles arm (API change — escalated 2026-08-28; **RULED: ARM C, approved**)

Orchestrator ruling 2026-08-28, conditions binding this lane: build ARM C LAST and only after #793 merges
(re-sync first; message before starting); STRICTLY append-only on `ui.ts` (existing `tiles` specs untouched;
re-flag if the coupled-site count grows past ~6 or the change stops being append-only); the owner-scoped
assetId resolve for bound tiles is a SECURITY-LOAD-BEARING seam (a foreign assetId resolves to NO-PAINT,
never a cross-owner cover leak — red-first receipt owed; a focused security-executor pass follows on this
seam + the bound-action dispatch); the count clamp at `PLUGIN_GRID_TILES_MAX` at resolve; the arm lands in
`host-v1.d.ts` + a contract test. The ruling's ground: the scripted tier is effect-less BY DESIGN
(`UI_PROXYABLE` excludes host-mediated effects), so the static tier's binding model is the correct tier to
grow. Original fork text, for provenance: spec-fixed tile cardinality makes the flagship's
results grid and keepsakes' gallery render ghost tiles; the scripted tier cannot substitute (no effects).
Default: append-only vocabulary arm `tilesFrom?: {$state} + tileAction?: ident` on `PluginGridNode`
(exactly-one-of with `tiles`), state-sourced tiles clamped to `PLUGIN_GRID_TILES_MAX`, validated client-side
at resolve; coupled sites: `ui.ts` node+schema, `SurfaceGrid`, the image-id sweep + `specBindsState`
(state-sourced `assetId`s must join the owner-scoped URL resolve), contract tests, `host-v1.d.ts`. Built
LAST so an ARM-A override costs only the atlas/keepsakes grid spelling. Fence: hunk-region coordination with
#793 on `features/plugin` files.

### 6.2 The `message-footer` anchor is structurally wallpaper today (flagged, smallest arm shipped)

The landed anchor is static-only (bound specs skipped) and decoration-only — the same strip under EVERY
committed row, with attribution chrome. No per-row FACT is expressible, so every possible occupant is
repeated decoration. Shipped: the smallest honest arm — the oracle's one-badge trust mark ("⟡ committed
draws — `/plugin oracle-deck reveal` verifies"), which is at least MEANINGFUL per row in a room whose
transcript carries draws. If the live drive scores it as noise, deletion is one hunk; the platform-side fix
(a per-row binding root, the `tool-card` precedent) is flagged as a follow-up, not improvised here.

### 6.3 Hub sources (decided in-lane, receipts §2)

Primary: Character Tavern (live, paged search, full definitions, unauthenticated). Secondary: RisuRealm
(live search via the same `__data.json` surface the legacy adapter probed and shipped against, import via
the DOCUMENTED json-v3 download). chub.ai: not carryable (geo-blocked from this box — the live drive would
fail on arrival). Orchestrator condition: chub is never a live-drive acceptance dependency — if carried at
all it is reference-only. The legacy chub/aicc/wyvern/botbooru/charavault adapters stay minable later; the
atlas README names the extension seam (one source object per hub).

## §7 Test plan

- `tests/server/entry/boot/seed-example-plugins.int.test.ts` extended: the seeder tuple test covers 9 by
  derivation; every new plugin gets a real-bytes install→grant→enable→drive test over the REAL host
  (registrations asserted; handlers driven through the same `invoke` closure: atlas action router with a
  scripted `net.fetch` op fake, clocks tick→var ops→fill→requestTurn capture, keepsakes snapshot pipeline
  with quiet+imagery fakes, polish display transform, oracle macro/pubsub emit capture, chips pubsub
  delivery with null scope). The support `makeInertOps`/`recordingOps` grow the missing op arms as fakes —
  planted-control style: each new assertion first proven failable by driving the pre-upgrade bundle where
  applicable (red-first for the affinity guard fix: the ungranted-activation refusal reproduces on the
  pre-fix source).
- `host-v1.test-d.ts` (§4) with a planted control (a deliberately mis-typed member goes red) proven
  during build, then removed.
- Floors: per-package `pnpm typecheck` (owns `.test-d` via `types:testd` + any `.ct.tsx` — none planned),
  `types:graph` (sees `tests/`), scoped biome on touched files, `pnpm check:docs` (this file), the seed
  int-suite + the contracts plugin suites if the 6.1 arm lands (`tests/contracts/plugin/ui.contract.test.ts`
  + a grid-arm CT is NOT owed — the renderer change is covered by the contract test + the live drive; if a
  CT exists asserting grid behavior it is swept by the literal grep).
- Shared-value law: no enum/label/wire literals change except fork 6.1 (new members, no renames) — the
  repo-wide grep of `tilesFrom`/`tileAction` and the touched tuples runs before READY.

## §8 Build order (stop-anywhere; each row a coherent unit)

1. affinity guard fix (+ its red-first receipt) · 2. draft-polish display transform · 3. oracle upgrades
(typed args, macro, pubsub, footer, README) · 4. scene-chips subscriber · 5. research-familiar clip arm ·
6. story-clocks · 7. keepsake-camera · 8. pocket-arcade · 9. card-atlas (+ fork-6.1 arm unless overridden) ·
10. `host-v1.d.ts` + pin · 11. the guide rewrite + READMEs · 12. int-test extension rides each row.

**Status 2026-08-28: rows 1-11 BUILT and suite-green** (seed int-suite 13/13 over the real WASM host;
ui.contract 43/43; bindings unit 4/4; the touched plugin CTs 16/16; the host-v1 pin 5/5 with both-direction
planted controls through ts7). ARM C landed per the ruling (append-only; three arms; the security-executor
pass on the owner-scoped assetId seam is the orchestrator's follow-up). Residual: the acceptance drives
(the live side-eye + code-quality read), which are the orchestrator's.

**#788 append, 2026-08-28 (post-merge of 569afb596):** the surface grew past this design's 20-capability
snapshot — the axis is now 23 (`worldinfo.read`, `assets.read`, `search.query`) plus the FREE `tokens`
namespace (`tokens.count`, both realms) and three gated members on existing namespaces (`chat.listCharacters`,
`worldInfo.listBooks`/`listEntries`). The pin tripped exactly as designed on the re-sync (5 ts7 errors
naming every gap by namespace/member), and the mirror, pin rows, and authoring-guide capability table were
extended to match, with fresh planted controls on the NEW rows (`tokens`, `search`) red in both directions.
The dated 20/20 coverage receipts above remain true of their date AND of the seed set: the nine plugins
exercise the original 20; the three new read capabilities and `tokens.count` are documented (SDK + guide)
but not yet exercised by a seed plugin — a follow-up candidate, deliberately not bolted on at merge time.
