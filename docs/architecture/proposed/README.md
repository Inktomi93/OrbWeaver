# proposed/ — build-grade design sets + Marinara-derived work (index)

> What lives here after the 2026-07-01 slim + the feature-design hardening round: the **committed
> RPG design set (D58)**, the **committed plain-chat crew design set (D59)**, the **committed
> agent-principal design set (D60)**, the **committed hub-browse + saved-rosters designs (D61 —
> the marinara-borrow adoption, COMPLETE)**, the **eight feature-domain build designs** (each the
> authoritative expansion of an already-committed ledger decision — its `domains/<x>.md` stays the
> decision record and carries a banner pointing here), and the **non-RPG residue** doc, now a
> CLOSED evidence record (every row decided: D58/D59/D61). The original marinara research
> corpus (five analysis docs + the exhaustive `rpg/` corpus) was fully absorbed into the design set
> and removed to prevent parallel-prose drift — **full text in git history** (the "archive the
> marinara research corpus" commit immediately preceding the slim).

## What's here

- **[`rpg-design/`](rpg-design/README.md)** — **COMMITTED (D58).** The authoritative, prescriptive
  design + build plan for `domain/rpg` (12 docs: vision/loop, domain shape, state+schema, mechanics
  rulebook, turn integration + tool registry, GM preset + crew, encounters/scenes/party,
  generative + client contract, seams, R1–R11 build plan, client/UI, the GM seat). The ledger D58
  entry is the decision record; this set wins on detail.
- **[`chat-crew-design/`](chat-crew-design/README.md)** — **COMMITTED (D59).** The
  authoritative, prescriptive design + build plan for `domain/crew` — the plain-chat agent crew
  (README + 8 docs: verdicts/vision, domain shape + state, the four WorkloadKind members,
  integration/scheduler/rings, the interconnection map, persistent guides, client/UI, the CW1–CW7
  build plan). Closes the residue B7/B8 rows; echo-chamber is SUBSUMED BY BUDDY. The ledger D59
  entry is the decision record; this set wins on detail.
- **[`agent-principal-design/`](agent-principal-design/README.md)** — **COMMITTED (D60).** The
  authoritative, prescriptive design for agents as first-class principals — the §8.6/PD-17
  transition ("buddy gets its own ID") (README + 7 docs: identity + the mint
  (`users.kind`/`ownerUserId` + `provisionAgentPrincipal`), the roster kind split + live
  `authorUserId` attribution, the capability ceiling (Principal-unconstructability + the closed
  `canAgent` union), the buddy firewall inversion, the seats (party/GM/crew bright line),
  ripples, the AP0–AP4 build plan + containment suite). The ledger D60 entry is the decision
  record; this set wins on detail.
- **[`tool-use-design/`](tool-use-design/README.md)** — **COMMITTED (D48).** The ONE tool
  registry + both wire projections (agent-sdk MCP / OpenAI-wire), the registration API, result
  serialization for the client chips, the structured-output axis, T1–T7 build plan. Its README
  carries the verified landed-vs-remaining truth table for the D48 seams (only the
  `ModelCapability` gates are in the tree). Describes the SAME chat-owned recurse loop as
  D48/chat.md — never a second design. The ledger D48 entry is the decision record; wins on detail.
- **[`imagery-design/`](imagery-design/README.md)** — **COMMITTED (D49 #1).** The two-step
  (extract → hosted generate) with real template text, the `edit`/`ImageEditInput` seam +
  `input.imageEdit` gate, and the folded residue borrows **B2 pick-before-generate** (+ the
  `imagery_generations` provenance table — a flagged delta to the decision record's "no DB table"
  line) and **B3 avatar-reference img2img**. One vocabulary with `rpg-design/08`. I0–I5 build plan.
- **[`expressions-design/`](expressions-design/README.md)** — **COMMITTED (D49 #4).** The
  classify shaper + snap-to-label contract, the `character_sprites` model + `"sprite"` AssetKind,
  the per-turn hook (`expressions.onTurnCompleted`, the rpg signature convention), the client
  stage, and the folded residue borrow **B1 sprite-sheet generation** (`expressions-sprite-sheet`
  WorkloadKind injecting `imagery.generatePicture`) — resolves the no-sprites early-out gap.
  E1–E5 build plan.
- **[`databank-design/`](databank-design/README.md)** — **COMMITTED (D49 #5).** The `documents`
  canon producer + 3 scope junctions + `document_chunks` (5th vector table), the full
  `@orb/kit/chunk` spec, the db-free `infra/extraction` loader (the long pole), the
  `embeddings.store` 5th arm + `search.documents` lens, the `{{databank}}` GATHER graft
  (`databank.gatherRetrieval` — the precedent rpg-design/05 §0 cites), scrapers, DB1–DB8 build plan.
- **[`gallery-design.md`](gallery-design.md)** — **COMMITTED (D49 #2).** Gallery v1 (`listOwned`)
  / v2 (`"gallery"` kind + `gallery_items`), thumbnails/animated-sniff/token-counter, the folded
  residue borrow **B4 gif proxy**, §0's consolidated `ASSET_KINDS` roster, and §6 — **the home of
  the B5a remote-fetch (SSRF) prerequisite paragraph** that databank scrapers, B5, and server-side
  D44 external-media fetches all cite. G1–G7 build plan. Deliberately small.
- **[`automation-design/`](automation-design/README.md)** — **COMMITTED (D46, Tier 1).** The
  closed trigger union (+ the TriggerFact re-read rule), CEL over the bound MacroEnv surface, the
  closed snake_case action union (`generate_image` imports imagery's schema; reserved
  `enqueue_crew_workload`/`rpg_verb` arms reconcile the crew/rpg seams), budgets/consent + the
  runaway guard, rule DDL + dispatch, macro-DX, global variables, the D50 PromptTransform seam.
  A1–A8 build plan.
- **[`plugin-design/`](plugin-design/README.md)** — **COMMITTED (D46, Tier 2).** The QuickJS-ng
  WASM host in `infra/plugin-host`: the frozen `PluginHostV1` membrane (11 namespaces, per-function
  capability annotations), manifest → `can()`, determinism + DoS budgets, dual-mode installed +
  inline snippets, plugin-sourced tools into the ONE D48 registry, the carried-verbatim
  rejected-runtime list. P1–P6 build plan + the permanent membrane-escape suite.
- **[`themes-design.md`](themes-design.md)** — **COMMITTED (D44 §12.1).** The first-class `themes`
  entity (settings-adjacent home argued; ownerless seed rows), the `theme`/`appearance`
  UserSettings namespaces, duplicate-to-customize verbs, boot-idempotent seeding.
- **[`hub-browse-design/`](hub-browse-design/README.md)** — **COMMITTED (D61, B5a + B5b).** The
  authoritative design for the hardened-egress guard + remote card-hub browsing (README + 3 docs:
  the `safeFetch`/`isAllowedImageBuffer` spec — SELF-ENFORCING SSRF posture, required host
  allowlist, dimension caps, the `@orb/kit/image-sniff` home resolving gallery review-flag 2; the
  `domain/hub` leaf + the ONE capability-flagged `HubAdapter` contract over sealed
  `infra/network/hubs/` modules + the liveness-probed v1 roster chub/wyvern/chartavern/pygmalion;
  the browse→preview-via-import-reader→import-front-door flow, rings/rate-limits/kill switch,
  avatar proxy, NSFW passthrough, client sketch, H1–H7 build plan). H1 ≡ gallery G6 (one work
  item); gif search's home migrates here per gallery §5's own criterion. The ledger D61 entry is
  the decision record; this set wins on detail.
- **[`saved-rosters-design.md`](saved-rosters-design.md)** — **COMMITTED (D61, B6).** Named party
  presets over the built roster: the `roster_presets` producer row (D23 stamp argued) +
  `roster_preset_members` real-FK junction, the optional `GroupConfigInput`/anchor payload, CRUD +
  the additive/idempotent `applyToChat` driving the EXISTING chat roster verbs by injection
  (chat stays preset-blind), owner-only `can()`, the new-chat picker + save-as-party client
  sketch, RP1/RP2 chunks + tests. The ledger D61 entry is the decision record; wins on detail.
- **[`Marinara-Residue-Non-RPG.md`](Marinara-Residue-Non-RPG.md)** — **DECIDED IN FULL
  (D58/D59/D61) — a closed evidence record.** The adjudicated borrow list (every B-row now a
  DECIDED pointer at its owning design set, with the verified marinara cites preserved), the
  scripting cautionary evidence backing D46's rejected alternatives, the agent-pipeline
  post-mortem, and the group-system validation record. Nothing here awaits a decision.
- **[`rpg/`](rpg/README.md)** — tombstone (the corpus location; points to git history).

## Ground rules

- Marinara is an EXTERNAL reference app (`neo-tavern/references/marinara-engine`) — not neo-tavern,
  not SillyTavern. D49 closed only the ST inventory; the marinara borrow rows were each given
  their own ledger decision (D58/D59/D61) — the mining is CLOSED.
- Do NOT re-mine marinara for topics the design sets or the residue doc already adjudicate — the
  verdicts are recorded; git history holds the evidence.
