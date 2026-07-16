# proposed/ Index — verified dispositions (2026-07-13)

Every parked program in this directory, verified against orbweaver code by a 5-agent Opus wave (read-only,
ast+grep+domain reads). The sets were briefly evicted to an out-of-repo staging area and returned the same
day once verified — this INDEX is the condition of their return.
Dispositions: **REALIZED** (code is the doc; set is a historical record) · **PARTIAL** (named remainder) ·
**FUTURE** (baseline riders at most). Re-verify before trusting any set's internal status lines — several rotted.

| Program | Disposition | Landed | Remaining (build order) |
| - | - | - | - |
| `connections/` (both sub-programs) | **REALIZED** | Roles&Keys (getModelsForSource + ModelPicker); the full turn-shaping program: `ModelCapability.turns`, wire-shape derivation, prefill-at-SHAPE, R1 rolling-pair cache (capability-gated), anth-direct backend + belts (D67), minP + verbosity end-to-end, provider.* observability | Deferred tails only: per-model Claude sampling entries (await live probe), quality→sampling numbers, optional first-party `anthropic` source. **Ledger note:** set-internal "D66"/"D68" labels are superseded by the registry's real entries — D68 (sampling completeness) + D69 (turn-shaping capability axis); registry D66 = UI-cohesion |
| `buddy-observer-reaction-engine.md` | **REALIZED** | Whole reaction engine live (observer 8-file tree, bus, quips CAS, supervised loop, tRPC stream, PD-45 self-drop belt) | Runtime-inert `actingUserId` feed arrives with AP3-2 seating |
| `stats-discovery-seam.md` | **REALIZED** (complete 2026-07-13) | Tiers 1–3 (lint wall, stats-owned economics ops, injected compose) + the `discovery-no-stats-rollups` STRUCTURE GATE (landed 2026-07-13 — the proposed depcruise rule was verified vacuous vs the `@orb/db` barrel and replaced; PD-22 cleared) | ST-parity probe only (nice-to-have, no owner) |
| `search-deferred-verbs.md` | **REALIZED** (complete 2026-07-13 — PD-35/36/37/38) | discover/similarCharacters/similarArt, images lens, fields+suggest (MiniSearch) + seal rule; PD-38 unified `search()` dispatch + `SearchScope` + the `chat_digest_speakers` OR-branch + `SCOPE_INSTRUCTIONS` (cleared ledger 2026-07-13); the `vector_distance_cos` gate note resolved as ALREADY-ENFORCED (the `vector-scope-derived` cosine arm) | none |
| `discovery-deferred-corpus-surface.md` | **REALIZED** (complete 2026-07-13 — PD-40 + PD-39 cleared) | every wave: distill/browse/facets/archetypes/projection/similarity/catalog/insights/economics/image-analytics/cooccurrence/dupes/views + the 2026-07-13 tail (`compareCharactersDeep`/`askCard`/`swipeHotspots`/`characterDossier`) + PD-39 BOTH arms (tier-k via the memory `resolveTier0Range` seam) | none |
| `tool-use-design/` | **PARTIAL** | T1–T4: wire seams, stream accumulator, `domain/tool-use` leaf, recurse loop (PD-54 closed). Registry currently has ZERO registrants (dormant by design) | T5 project-mcp + migrate buddy off its local tool server → T6 `runStructuredAgentTurn` + `structured_output_unsupported` (wire half exists) → T7 client renderer |
| `agent-principal-design/` | **PARTIAL** | AP0 schema · AP1 mint/spine · AP2 attribution · AP3-1 seatAgent · resolveSpeakerIdentity · admin/sessions/notifications belts | AP3-2 voicing chain (6 items: AGENT_SPEAKER_SOURCES registry → resolveAgentSpeaker op → RESOLVE soul substitution → USER_BACKED_KINDS present-arm → canAgent('speak') engine gate → AgentCardView) → AP3-3 per-agent connection → AP4a (rpg-gated) → client P6 |
| `saved-rosters-design.md` | **PARTIAL** | RP1 rider: `roster_presets` schema, `RosterPresetId`, contract views | RP1 leaf (`domain/roster-preset` + 6 verbs incl. applyToChat) → RP2 client picker |
| `hub-browse-design/` | **PARTIAL** (~15–20%) | image-sniff kit, image-guard, no-raw-egress gate (stronger than spec), gif slice (D61) | H1 safeFetch self-enforcing `allowedHosts` hardening (D61-committed) → H2 contracts + sealed HubAdapter registry + chub + kill switch + rate limits → H3 more adapters → H4 preview/import → H5 avatar proxy → H6 client |
| `imagery-design/` | **PARTIAL** — free-mode slice works end-to-end + in-chat trigger | chat.generateImage → generatePicture → hosted runner → CAS + generations row; **base free-mode in-chat generate trigger BUILT 2026-07-14** (composer Sparkles button → `chat.generateImage` mode:"free", typed text = prompt; `useGenerateImage` hook); type-level I0 widening (INERT: negativePrompt/size/edit + imageEdit axis unhonored); DDL (3 write-dead columns) | Contracts fill-out + `image_edit_dropped` → substrate + extract/caption verbs → I2 runner translation → I3 reuse gate → editImage + capability gate → I4 quiet/automation/tool → I5 client (**the img2img/edit studio (PD-93) remains I5-deferred**). **README triage line was false (fixed 2026-07-13)** |
| `expressions-design/` | **FUTURE** (PD-56 stands) | Born riders: EXPRESSION_LABELS, character_sprites DDL+tests, sprite AssetKind + GC entry, bus member (never emitted), stub runner | E2 CRUD leaf → E3 classify+hook+emit+setting → E4 real runner (imagery blocker now satisfied) → E5 client stage |
| `databank-design/` | **FUTURE** (PD-57 stands) | DB2-tables rider: documents + 3 junctions, document_chunks vector table, {{databank}} reserved macro slot, stub runners, document AssetKind (bare) | DB1 kit/chunk ∥ DB3 infra/extraction (long pole) → DB2-remainder (5th store arm + prune + sniff ext) → DB4 domain → DB5 search lens → DB6 chat graft → DB7/8 scrapers |
| `automation-design/` | **FUTURE** | Riders: 4 tables (incl. global_variables), contract trigger taxonomy, ID brands. `cel-js` not installed | Whole domain (CEL predicates, watcher, action dispatch). Unblocked: A1–A3 |
| `rpg-design/` | **FUTURE** | Riders: 14 tables (gmUserId seat-as-data encoded), 475-line contracts, 15 brands, 10 stub runners. `tool-propose` ceiling is SPEC-ONLY | R1-proper domain (services, RpgContext, 26-tool registry, turn graft, encounter engine) → R11. Requires tool-use registrant path |
| `chat-crew-design/` | **FUTURE** | Riders: 4 tables, contracts, 4 stub workload kinds (guides correctly verb-not-workload) | Whole domain; needs rpg precedent + tool-use T6 structured output |
| `plugin-design/` | **FUTURE** (pure paper) | Nothing — no schema, no contracts, `quickjs-emscripten` not installed | Everything; last in order (needs automation Tier-1 + tool-use registry). Ruled by D46 |
| `autosave-form-doctrine.md` | **FUTURE** (ratified 2026-07-16 → D78; dispatch LIVE) | Design only — born from the stickler live-P0 review; the lane-h tactical preset patch precedes it | L0 MINT (session boundary in a new module + CT-1..6) → L1 preset ∥ L2 character ∥ L3 per-chat ∥ L4 settings+persona → SEAL (delete old hook export + G-A `no-manual-autosave-flush`) |

## Cross-program build order (docs' own dependency map)

tool-use tails + D46 variables substrate → (rpg ∥ automation) → crew → plugin.
AP3-2 voicing chain is independent and unblocks seated-buddy speech + the observer's live trigger.

## Registry touch-ups (all applied 2026-07-13)

PD-17 (self-drop BUILT-inert, notifications belt, tool-use premise fixed) · PD-26 cleared (assets
maintenance verbs shipped) · PD-56/57/93 sharpened · D68 (sampling completeness) + D69 (turn-shaping
capability axis) ledgered.
