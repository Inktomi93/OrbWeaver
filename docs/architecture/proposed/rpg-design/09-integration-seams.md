# 09 — Integration Seams (the nine explicit answers + the polyfill)

> **Status: PROPOSED design (prescriptive).** Each seam: the DECISION, the mechanism, the rejected
> alternative. These are the places rpg touches committed law — every answer stays inside what the
> owning doc already commits.

---

## (a) Presets × RPG mode — the GM prompt IS a preset

**DECISION (the lean, confirmed and specced — 06 §1):** the GM system prompt is a normal
`PromptConfig` preset. `rpg.createGame` clones the packaged **"RPG Game Master"** preset into the
host's library and activates it on the chat; rpg contributes only MACRO VALUES (the 8 `rpg*`
macros, volatile-flagged) + ONE depth-0 format-reminder injection. Users tune the GM voice, section
order, params, guided actions — everything — in the normal preset editor; a power user can build a
whole alternative GM preset from scratch (the macros are the stable API). Game-mode-ness is DATA
(the rpg_games row), never a preset "kind" enum or a chat branch. *(Rejected: a `preset.kind =
"game-mode"` discriminated variant — nothing dispatches on it; rejected: rpg-owned prompt assembly
— untunable, duplicates the pipeline.)* One preset-domain touch: a `clonePackaged` seed helper
(the system-default-preset seeding pattern extended with one packaged blob).

## (b) Automation / STscript (D46 Tier-1)

**YES — rpg is a first-class automation citizen, for free.** Tier-1 rules trigger on the closed
event bus; rpg mirrors its curated event subset onto `@orb/contracts/events` (05 §5):
`rpg.clockCompleted`, `rpg.sessionConcluded`, `rpg.encounterEnded`, `rpg.reputationMilestone`,
`rpg.checkResolved`. So "on clockCompleted where clock.name =~ 'Ritual' do notify + trigger a
generation" is a plain D46 rule. CEL predicates read the same MacroEnv — the rpg macros
(`{{rpgSceneState}}` etc.) resolve there, and D46 runtime variables coexist untouched (03 §2.4).
Actions: the D46 closed action union gains NO rpg-specific members in v1 — the existing actions
(notify, set variable, quick-reply, trigger generation) cover the rule library; a `rpg-verb` action
arm (e.g. auto-checkpoint) is reserved-additive. `/roll`-style commands: the dice button is a plain
verb call (05 §6); a `/roll` automation action is unnecessary. *(Rejected: rpg-private automation —
a second rule engine is exactly what D46 forbids.)*

## (c) Plugins (D46 Tier-2)

**Custom mechanics via plugins are POSSIBLE LATER, gated, and NOT v1.** The house mechanic set is
THE system (01 §6). The seam that keeps the door open at zero cost: every rpg verb routes `can()`,
and the D48 registry already accepts plugin-sourced tools gated by the installing principal — so a
future capability grant (`rpg.tools.extend`) would let a plugin register additional GAME tools
(a homebrew crafting check) without rpg changes. The substrate stays closed (a plugin never
replaces `resolveCheck` — determinism + goldens are the product). LEAN: revisit after Tier-2 ships;
resolves when the first real homebrew request lands.

## (d) Databank — campaign documents feed the GM

**Consume, don't build.** Databank (D49) already gives the GM RAG: attach campaign docs/rulebooks
to the game CHAT (`chat_documents` junction); the `{{databank}}` GATHER slot injects retrieval on
the host's documents. rpg adds nothing structural — the packaged GM preset includes the
`{{databank}}` slot in its `continuity` region so attached source material lands automatically.
World-gen additionally reads attached CONSTANT world-info entries as canon (06 §4 — the marinara
lorebook rule); world-INFO ≠ databank (keyed lore vs document RAG), both flow, no new machinery.
*(Rejected: an rpg-owned document store — databank IS that.)*

## (e) Gallery / expressions / imagery — consume the committed domains

Imagery: rpg is a POLICY layer over injected `imagery.generatePicture` (08); it never talks to
providers. Generated art = `"generated"` `AssetKind` rows in the per-user CAS → gallery v1's
`listOwned` shows campaign art for free; gallery v2's `subjectCharacterId` junction fits NPC
portraits when it lands. Expressions: game chats use the SAME committed per-turn classify hook
(expressions.md Phase-5 hook) — a character with a sprite set gets stage expressions during the
game with ZERO rpg code; the sprite-sheet GENERATION borrow (Feature-Slot-Map §4's top pick)
remains an expressions/imagery enhancement rpg merely benefits from. rpg owns no image bytes, no
sprite rows, no gen calls. *(Rejected: marinara's rpg-owned sprite/background/gallery plumbing —
the committed domains ARE those features.)*

## (f) Memory — one recall system, two rhythms

**Session summaries and chat digests are DIFFERENT layers; both stay; no merge.** Memory (D55) is
the mechanical recall substrate — pure function of canon, block-digests, `{{memory}}` — and works
in game chats untouched (the GM benefits from it automatically). `rpg_sessions.summary` is GAME
canon: a structured, model-authored, host-reviewed campaign artifact (resume points, arcs, secrets
progression) that feeds `{{rpgContinuity}}` and DRIVES state (sheet evolution, twist refresh).
Memory digests are derived + regenerable; session summaries are authored + load-bearing — merging
them would make campaign canon a cache. The overlap (both compress history) is priced: the reminder
+ preset put `{{rpgContinuity}}` in the system half and `{{memory}}` in its committed dynamic slot;
they serve different queries (campaign spine vs "what did the innkeeper say 400 messages ago").
*(Rejected: sessions-as-digest-tier — breaks D55's pure-function-of-canon invariant.)*

## (g) Stats — game economics vs chat economics

**No new stats surface.** Token/cost/cache economics of GM turns and crew workloads land in
`domain/stats` through the existing turn/workload paths (crew workloads already carry ownerId +
role-client billing). GAME-mechanical aggregates (checks per session, band distribution) are NOT
stats-domain material (stats = economics, zero game tables — the committed line); they derive from
`ToolCallRecord`s and live, if ever surfaced, in rpg read verbs. *(Rejected: rpg rows in stats —
re-blurs the exact line domains.md just cleaned.)*

## (h) Variables two-plane × swipe-keyed game state — RECONCILED

The full reconciliation is 03 §2.4. Summary: same principle (state derives along
`selectedVariantId`), two encodings — D46 runtime variables = per-variant DELTAS folded (small
scalar bag); rpg snapshots = per-variant FULL ROWS clone-forwarded (large structured tracker).
Game state does NOT ride `message_variants` variable deltas; game fields do NOT enter the macro
variable namespace (rpg macros are read-only projections). ONE story for users: *swipe-scoped
state keys on the variant; the selected pointer is the truth; a swipe rewinds both.* CEL/automation
can read both planes (b).

## (i) Group chat / multi-human — the party is the roster (day-one)

Specced in 07 §3: players = human participants (invites/kick/handoff standard), companions =
character participants, GM = narrator-mode group turns authored by the synthetic group character,
arbitration untouched, `can()` matrix per verb, host = the table's GM-owner (funds turns per D19,
confirms deaths/session ends). Multi-human is not a mode — a second human joining a running
campaign is `redeem invite → joinParty → sheet seeded`, zero rpg special-casing. This is the
single largest structural win over marinara (verified single-human, `if(isGroup)` god-route).

## (+) The local-model polyfill (Tier-3b — where the repair heuristics live)

Game chats REQUIRE tool calling (05 §3). For local models without native tool support, the port
target stays what the port-map decided: marinara's `parseTextualToolCalls` + `parseGameJsonish`
repair heuristics relocate into `infra/providers` as a backend-internal textual-tool-call shim
(model emits fenced pseudo-calls → the shim parses/repairs → normal `ToolCallRecord`s), OWNED BY
Tier-3b, invisible to rpg. Until that ships, `createGame` refuses non-tool-capable connections
with a clear error. The human JSON-repair modal is NOT ported anywhere — its replacement
affordances are: errors-as-data in the recurse loop (the model self-corrects), bounded retry +
workload `failed`+retry for crew payloads (06 §3), and host regenerate buttons. *(Rejected:
porting the repair modal — it is the UX of not having structured output.)*
