# Marinara → Orbweaver — Legacy Analysis & Port Corpus

> Reverse-engineered analysis of the legacy **Marinara Engine** (`references/marinara-engine`) and how
> its features should — or should not — cross into Orbweaver. Everything here is verified against source
> with `ts-morph` (real symbol resolution / import graphs) and `ast-grep` (structural queries), not
> hand-review. Where a prior draft (Gemini-authored) was wrong, the correction is called out in the doc.
>
> **These are research/planning docs, not committed design.** Committed decisions live in
> [`../domains/`](../domains/) and the ledger; when a section here is promoted, the domain doc wins on
> any conflict.

---

## What's here

### RPG engine (the largest system)
- **[`rpg/`](rpg/README.md)** — the exhaustive corpus (9 docs + raw flow spines): state model, the 41
  endpoints pulled apart into flow spines, the 26-service mechanics layer, the 86-type catalog, the
  generative pipeline, the sub-engines, the port map, and the monorepo-wide validation-gap /
  client-leak findings.
- **[`Marinara-RPG-Architecture-Consolidated.md`](Marinara-RPG-Architecture-Consolidated.md)** — the
  executive summary that the `rpg/` corpus backs. Read this for the shape; the corpus for the detail.

### Agent system
- **[`Marinara-Agent-System-Analysis.md`](Marinara-Agent-System-Analysis.md)** — verified analysis of
  what marinara's 3-phase agent pipeline actually does (the "what"), incl. the 5 pipeline bypasses and
  the ~1,400-line side-effect dispatch.
- **[`Marinara-Agent-Port-Map.md`](Marinara-Agent-Port-Map.md)** — the port strategy (the "how"):
  dismantle the god-route, distribute phases to GATHER verbs / Workloads / the D48 tool loop, keep
  buddy thin (agent = pattern, not domain).

### Feature comparison (best-of-both)
- **[`Marinara-vs-Orbweaver-Feature-Comparison.md`](Marinara-vs-Orbweaver-Feature-Comparison.md)** —
  per-feature verdicts (marinara vs the committed ST-grounded Orbweaver ports): expressions/sprites,
  imagery/backgrounds, gallery, bot-browsers, and the whole scripting layer (macros, variables, regex,
  slash commands, extensions).

### Where it slots in (roadmap)
- **[`Marinara-Feature-Slot-Map.md`](Marinara-Feature-Slot-Map.md)** — where every marinara-sourced
  feature (the RPG engine, the 21-agent set, the generative borrows) *would* land in Orbweaver's phases +
  homes IF greenlit. Everything PROPOSED — each needs its own ledger decision (marinara is an external
  app; D49 closed only the SillyTavern inventory). Pairs with the committed
  [`../core/Core-SillyTavern-Feature-Map.md`](../core/Core-SillyTavern-Feature-Map.md).

---

## The through-lines (what the whole corpus concluded)

1. **Borrow marinara's *generators*, ignore marinara's *scripting*.** Marinara has real generation
   capability Orbweaver lacks (sprite-sheet gen, asset orchestration); its scripting/automation layer is
   a faithful ST port that inherits ST's bugs (swipe #3263 mutable-var bag) and ST's security model
   (unsandboxed client JS/CSS extensions) — the exact things Orbweaver's plans were designed to beat.

2. **The god-routes are the enemy, everywhere.** `game.routes.ts` (8,659 lines) and
   `generate.routes.ts` (11,227) both mix transport + DB + LLM orchestration + side-effect dispatch. The
   port pattern is identical in both port maps: dismantle the orchestrator, distribute logic to
   domain verbs / GATHER-BUILD / Workloads / tool calls.

3. **State is two-layered, and only half of it is the "untyped blob" problem.** Per-turn state is a real
   typed table; the campaign/config sprawl is the untyped `metadata` blob. Different port strategies —
   see [`rpg/01-state-model.md`](rpg/01-state-model.md).

4. **No internal validation.** zod at the HTTP edge only; 413 raw `JSON.parse` + 324 `as any` in server,
   0 zod in the 200k-line client — with backend logic (dice ×3, a 1,124-line tag parser, macros)
   duplicated into it. See [`rpg/08-validation-gap-and-client-leak.md`](rpg/08-validation-gap-and-client-leak.md).

## Verification method (applies to every doc here)

Counts/paths/constants/exports pulled with `ts-morph` against the marinara `tsconfig` (symbol
resolution, `findReferencesAsNodes`, import graphs) and `ast-grep` (structural patterns). Line-anchored
where it matters. Prior Gemini-authored drafts were corrected against source — notably the deleted
`Agent-System-Migration.md` (claimed `generate.routes.ts` ~2,500 lines; actual 11,227) and the original
RPG consolidated draft (truncated schemas, misattributed symbols, a raw AST dump).
