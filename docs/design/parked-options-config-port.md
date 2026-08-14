---
kind: design
status: parked
updated: 2026-08-14
---

# Parked options — config-rail + portability

Decision-input for three parked/deferred items. Investigate-only: no code changed. Each item gives the
current state with `path:line` receipts (code AND docs), the real options, and a RECOMMENDATION marked as
the do-it-right-once arm with its WHY. KISS/YAGNI are SUSPENDED for architecture here (AGENTS §0.1.2), so
"more work" is not by itself a reason to reject the extensible arm — but a **speculative seam extension**
with no committed consumer is still YAGNI, and that distinction decides items 1 and 3.

Coverage limits stated up front:

- Item 2's two originating side-eye docs were not pinned by grep (the "deferred tonight" filings). The
  load-bearing artifacts I cite instead are authoritative and current: the code comment, the mock, the CT,
  and the 2026-08-03 combined-nightly verdict.
- All renders inferred from source + the standing snaps (`reports/snaps/config-*.png`, dated 2026-08-08);
  I did not drive a live populated config workspace this lane.

---

## Item 1 — presets into the config rail

**Owner ruling (TIMED):** presets stay OUT of the config rail until he feels it — "one array member,
forever, whenever." The premise under that ruling is that folding presets in is one array line. **On
today's tree that premise is FALSE**, and the honest cost is the deliverable here.

### Current state

Two different seams are in play, and the owner's phrase blurs them:

- **Presets is ALREADY its own top-level RAIL SECTION** — not a config tenant.
  - `SECTION_IDS` tuple carries `presets` as a peer of `config`: `packages/client/src/state/shell-store.ts:44`.
  - Registered as a section: `presets: presetsSection` — `packages/client/src/main.tsx:245`.
  - The definition is a full `SectionDefinition`: `packages/client/src/features/preset/lib/presets-section.tsx`
    (rail identity, `panelDefaults`, placeholder, `list`/`content`/`context`, `useSelectionTitle`).

- **The config workspace hosts COLLECTIONS**, a different contributor family (`CollectionContribution`,
  the eleventh family — `packages/client/src/lib/collection-contracts.ts:91`).
  - The door array: `configCollections = createContributorRegistry<CollectionContribution>("config-collections", [tagCollection, regexCollection, worldInfoCollection])` — `packages/client/src/main.tsx:231`.
  - `makeConfigSection(configCollections)` consumes it blind — `packages/client/src/features/config/lib/config-section.tsx:30`.
  - The seam's own header states the "one array line to move a library between rail and roster" property —
    but that property is defined for **collections**, not for a full section: `collection-contracts.ts:6-9`,
    `:90-92`, and spec `docs/design/config-rail-spec.md` F-3.

So "presets as one array member of the config rail" means: convert `presetsSection` (a `SectionDefinition`)
into a `CollectionContribution` and add it to `configCollections`. **That conversion is not clean** — three
structural mismatches, each one a field the `CollectionContribution` seam deliberately does not carry:

1. **Context is view-projected, not member-keyed.** Presets' context is
   `{ kind:"single", body: <PresetReadout/>, header: <PresetReadoutHeader/> }` — the readout projects by the
   ACTIVE EDITOR VIEW, and is a first-class arm even with NO member selected (`presets-section.tsx:44-52`
   header note; the §7-row-1 "no-selection panel is the active preset's effective profile" ruling). The
   `CollectionContext` seam is member-keyed: `body: (view:{memberId}) => ReactNode` with a STATIC host-rendered
   `title` string and NO header component (`collection-contracts.ts:75-86`). A view-projected readout with a
   live header component cannot ride a member-keyed body + a static title string.

2. **Panel defaults live on the SECTION, not the collection.** Presets defaults `context: "docked"` because
   "the readout IS the product" (owner ruling, `presets-section.tsx:29-31`). Config defaults
   `context: "collapsed"` (`config-section.tsx:34`). `panelDefaults` is a `SectionDefinition` property; a
   `CollectionContribution` has no way to state its own. Folding presets in either loses the docked-readout
   default or forces the whole config workspace onto presets' default.

3. **The seam header EXPLICITLY forbids "completing the mirror."** `collection-contracts.ts:25-35` lists the
   deliberate exclusions (no `anchor`, no `owns`, no `{dormant}`) each with "do not cargo-cult." Adding
   per-collection panel defaults + a context-header component + a view-projected context purely to seat
   presets is exactly the mirror-completion that header warns against.

There is a prior fold in the same direction that DID fit: world-info moved into the config roster as a
collection (`collection-contracts.ts:14-16`, R2's migration). World-info fit because its context is
member-keyed and its default panel posture matches. Presets does not share either property.

### Options

1. **Leave presets standalone (status quo).** Respects owner timing. Cost: none. Leaves the false "one array
   member" premise on the books.
2. **Fold presets in NOW as a `CollectionContribution`.** Requires extending the seam with all three missing
   capabilities (view-projected context, context-header component, per-collection panel-default hint), then
   rewriting `presetsSection` → a preset collection and deleting the standalone section. Real migration, and
   it risks degrading the readout to a member-keyed static-title body if done cheaply. No committed consumer
   demand — the owner explicitly hasn't "felt it."
3. **Pre-extend the seam now, move presets later.** Add the three optional fields to `CollectionContribution`
   speculatively so a future fold is genuinely one array line. This is a speculative seam extension with no
   consumer — the one YAGNI that survives the architecture suspension.
4. **Record the true cost, leave standalone, and — when the owner feels it — do the real migration (arm 2)
   as a scoped seam-extension job, not an array edit.**

### RECOMMENDATION — arm 4 (leave standalone now; correct the premise; migrate properly when timed)

The do-it-right-once move is NOT to fold now (no consumer, owner-timed) and NOT to pre-bloat the seam
(speculative, and the seam header forbids exactly that). It is to **kill the false premise with receipts** so
that when the owner does feel it, nobody green-lights the fold as a one-liner and then degrades the
view-projected readout to hit the deadline. The readout — docked-by-default, projected by editor view, a
first-class no-selection arm — is the presets product; the `CollectionContribution` seam cannot carry it
today by DESIGN, not by omission.

When the owner feels it, the right-once shape is: extend `CollectionContribution` with (a) an optional
view-projected context arm carrying a header COMPONENT (not a title string), and (b) an optional
per-collection panel-default hint; then convert `presetsSection` into a preset collection and delete the
standalone section in the same commit (no half-migration — AGENTS §4 banned escape hatches). That is a
real \~day of work across the seam + presets, not one array member — and stating that honestly now is worth
more than either premature arm.

---

## Item 2 — the landing-cards + "New book" duplication CLASS

Two side-eyes filed this as one class; they are two different findings that should be split.

### Current state

**Finding (a) — the landing restates the roster once populated.** The Configuration no-selection CONTENT is
`ConfigWelcome` (`packages/client/src/features/config/components/config-welcome.tsx`), which draws one
LAUNCHER card per collection: icon + label + live count + blurb + a `create` button
(`config-welcome.tsx:45-91`, the `CollectionLauncher` child). The adjacent LIST is `ConfigRosterSurface`
(`config-roster-surface.tsx`), whose group bands ALSO show icon + label + count + create `+`
(`collection-group.tsx:58-102`). With both panes docked and populated, `Tags · 32 · New tag` renders in
BOTH panes at once — the launcher card differs only by carrying the blurb.

- The 2026-08-03 verdict that this collides with: `docs/reviews/side-eye/2026-08-03-combined-nightly.md:291-292`
  — "The parts every chat is built from plus three described launcher cards is a genuinely good teaching
  state." **That verdict was the COLD-FIRST-TIMER (empty) test**, not the populated case. The cards are a good
  empty-state teacher; the collision is that they keep restating the roster after the library fills.
- Why the naive fix is a trap (already documented): `config-welcome.tsx:6-12` — a "switch voice when
  populated" needs every collection's count AT THE PARENT, and counts are OWNER hooks; reading N in a parent
  loop is the rules-of-hooks violation the one-child-per-contribution shape exists to avoid. So any trim MUST
  happen inside each `CollectionLauncher` child, which already runs its own `useCount` hook-safely
  (`config-welcome.tsx:56-59`).

**Finding (b) — the "New book" double affordance.** In a zero-member group, the band keeps its create `+`
AND the empty slot repeats the verb as an inline "New book" next-step — two affordances, one verb, both in
the roster (`collection-group.tsx:95-123`; the empty card is `CollectionGroupEmpty` at `:231-242`).

- Mock-ratified: `docs/design/mocks/config-rail/empty-states.html:191-193` (and :195-203) draw the `+` in the
  zero band AND a `New tag`/`New script`/`New book` link inside `.gempty`.
- CT-pinned: `tests/client/features/config/surfaces/config-roster-surface.ct.tsx:340-356` —
  `getByRole("button", { name: "New tag" })).toHaveCount(2)` asserts BOTH affordances render.
- The code comment already ruled the split: `collection-group.tsx:95-99` — "Only the DEAD half of the finding
  (a disclosure onto nothing) is fixed here; collapsing the two verbs into one is a design call, not a defect
  fix." (The dead disclosure at zero was already removed — `:54-64`, side-eye 2026-08-06 P2.)

### Options (for the class)

1. **Keep both (status quo).** Landing teaches; New-book double is drawn + CT-pinned. Cost: none. Leaves the
   populated-landing duplication standing.
2. **Trim the landing when populated; keep the New-book double.** Per-`CollectionLauncher` (hook-safe): once a
   collection has members, its card drops the count + create (which live in the roster band) and keeps only
   icon + label + blurb — or the whole welcome degrades to the teaching heading + paragraph once every
   collection is populated.
3. **Trim both.** Also collapse the New-book double to a single verb — but that is a coupled-site edit (mock +
   CT + the ruling comment) reversing a drawn, owner-ratified design.

### RECOMMENDATION — arm 2 (split the class; fix the landing, keep New-book)

They are not one finding.

- **Landing (a): fix it, at the child level.** The duplication is real (two homes for label+count+create on one
  screen — the same "one home per concept" class the 2026-08-03 review flagged for personas/regex). The
  right-once arm preserves the praised empty-state teacher AND kills the restatement: each `CollectionLauncher`
  renders count + create ONLY while its own `count === 0` (the onboarding next-step), and collapses to
  icon + label + blurb once populated — where the blurb is the one thing the roster band does NOT carry, so
  the welcome stops being a second roster and becomes what its heading promises ("the parts every chat is built
  from"). This is entirely inside the existing hook-safe child; no parent count-loop, so the documented
  rules-of-hooks trap is untouched. The 2026-08-03 empty verdict stays satisfied because at empty every card
  still shows its count(0) + create.

- **New-book (b): KEEP.** It is mock-ratified (`empty-states.html:191-193`), CT-pinned
  (`config-roster-surface.ct.tsx:349`), and owner-drawn; the two affordances serve two reading moments (the
  band `+` is the persistent map-level create; the empty card is the inline first-step for a zero group).
  Trimming it is a coupled-site reversal of a ratified design and should not ride a duplication-cleanup lane.
  If the owner later wants it collapsed, it is a three-site edit (mock + CT + comment), flagged as such.

---

## Item 3 — JSON-card export format

**PORT's recommended home was `?format=png|json` on the existing character export door. That is exactly what
shipped — the server side is DONE. The only gap is a client affordance to reach the JSON arm.**

### Current state

- **The door validates and serves both formats.** `packages/server/src/entry/http/export.ts:107-117` — reads
  `?format`, rejects anything not in `CARD_FORMATS = {png, json}` (`:40`), and content-types the response
  `json ? application/json : image/png` (`:117`).
- **The verb emits the unwrapped card as JSON.** `packages/server/src/domain/export/verbs/export-character.ts:169-176`
  — the `json` arm skips the avatar read and returns `JSON.stringify(card)`; `png` welds the same card into the
  avatar via `writeCardChunk`. The card is `buildCardV3(...)` (`:139`) — the V3 TavernCard spec object.
- **The union is first-class.** `ExportCardFormat = "png" | "json"` —
  `packages/server/src/domain/export/contract/params.ts:12`; contract note `contract/service.ts:37-39`.
- **The round trip is closed — import already accepts JSON cards.** `domain/import/substrate/card.ts:131-143`
  (`fromText` → `cardFromJson`), and the client import dialog accepts `.png,.json` —
  `packages/client/src/features/character/components/character-import-dialog.tsx:16`.
- **SillyTavern-compat: JSON-card IS a known interchange format.** What the verb emits is the unwrapped V3
  TavernCard JSON — the same object ST welds into a PNG and also reads/writes as a bare `.json` card. So this
  is standard interchange, not an orb invention.
- **THE GAP — no client affordance.** The character kebab has ONE "Export card" link with no `?format`, so it
  always hits the PNG default: `packages/client/src/features/character/components/character-card.tsx:187-190`
  (`href={`${EXPORT\_CHARACTER\_PATH}${character.id}`}`, `EXPORT_CHARACTER_PATH` at `:25`). JSON is reachable only
  by hand-typing the query.

### Options

1. **Build the client affordance on the existing json arm.** Replace the single "Export card" link with a
   two-item submenu (PNG / JSON) hitting `?format=json` for the JSON arm. The server is done; this is \~10 lines.
2. **Separate export door.** Rejected — duplicates the built, correct door.
3. **Skip.** Leave JSON as an API-only capability (power users hit the URL).

### RECOMMENDATION — arm 1 (surface the built arm; do NOT rebuild)

Item 3 is not a build — it is exposing an already-shipped, already-correct capability. The right-once client
arm mirrors the CHAT kebab's existing precedent, which already offers its formats as `MenuLinkItem`s inside a
`MenuSubmenu` (`packages/client/src/features/chat/components/chat-list-row-menu.tsx:10-14, :22-23` — orb/jsonl/txt).
Convert the character kebab's lone "Export card" into the same submenu shape: `Export card ▸ PNG (with avatar)`
(default) and `JSON (data only)` (`?format=json`), both plain download `MenuLinkItem`s. One grammar for both
export doors, no second endpoint, and it turns a hidden server capability into a visible one. Trivial, and the
only reason it is a recommendation at all is that shipping the server arm without the affordance leaves a
built feature no user can find.
