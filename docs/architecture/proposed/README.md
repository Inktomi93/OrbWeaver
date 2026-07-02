# proposed/ — Marinara-derived work (index)

> What lives here after the 2026-07-01 slim: the **committed RPG design set** and the **non-RPG
> residue** still awaiting ledger calls. The original marinara research corpus (five analysis docs +
> the exhaustive `rpg/` corpus) was fully absorbed into the design set and removed to prevent
> parallel-prose drift — **full text in git history** (the "archive the marinara research corpus"
> commit immediately preceding the slim).

## What's here

- **[`rpg-design/`](rpg-design/README.md)** — **COMMITTED (D58).** The authoritative, prescriptive
  design + build plan for `domain/rpg` (12 docs: vision/loop, domain shape, state+schema, mechanics
  rulebook, turn integration + tool registry, GM preset + crew, encounters/scenes/party,
  generative + client contract, seams, R1–R11 build plan, client/UI, the GM seat). The ledger D58
  entry is the decision record; this set wins on detail.
- **[`Marinara-Residue-Non-RPG.md`](Marinara-Residue-Non-RPG.md)** — **PROPOSED.** Everything
  non-RPG that survived the mining and still needs its own ledger decision: the borrow list
  (sprite-sheet generation → expressions; asset-manifest pick-before-generate + avatar-ref
  conditioning → imagery; gif proxy; the bot-browser/card-hub gap + its SSRF guards; saved rosters;
  non-game lorebook-keeper/card-auditor workloads; roleplay-mode narrative agents), the scripting
  cautionary evidence backing D46's rejected alternatives, and the agent-pipeline post-mortem.
- **[`rpg/`](rpg/README.md)** — tombstone (the corpus location; points to git history).

## Ground rules

- Marinara is an EXTERNAL reference app (`neo-tavern/references/marinara-engine`) — not neo-tavern,
  not SillyTavern. D49 closed only the ST inventory; each residue row needs its own ledger decision.
- A decided residue row moves to the ledger + its owning domain doc and is deleted here.
- Do NOT re-mine marinara for topics the design set or the residue doc already adjudicates — the
  verdicts are recorded; git history holds the evidence.
