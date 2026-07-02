# Marinara Feature Slot Map (PROPOSED — external inspiration, needs decisions)

> **What this is.** Where marinara-engine's features *would* slot into orbweaver's phases + homes IF
> greenlit. Companion to the committed [`../core/Core-SillyTavern-Feature-Map.md`](../core/Core-SillyTavern-Feature-Map.md);
> this one is entirely **PROPOSED**.
>
> **The three apps (do not conflate — I did once and it was wrong):**
> - **marinara-engine** — its OWN separate app (mined here as a reference at `neo-tavern/references/marinara-engine`). Not neo-tavern, not orbweaver.
> - **neo-tavern** — orbweaver's actual legacy predecessor (the differential-oracle "steady clone"; what the ledger means by "neo did X").
> - **orbweaver** — the new build. **SillyTavern** — the upstream ancestor D47/D49 adjudicated.
>
> **Decision status: NONE of this is committed.** D49 closed the *SillyTavern* inventory — marinara is
> neither ST nor neo-tavern, so D49 doesn't cover it and doesn't forbid it. Every row here needs its OWN
> orbweaver **ledger decision** (yes/no + scope) before it becomes real work. Backing research:
> [`rpg/`](rpg/README.md), [`Marinara-Agent-System-Analysis.md`](Marinara-Agent-System-Analysis.md) +
> [`Marinara-Agent-Port-Map.md`](Marinara-Agent-Port-Map.md), [`Marinara-vs-Orbweaver-Feature-Comparison.md`](Marinara-vs-Orbweaver-Feature-Comparison.md).

**Legend:** ⬜ PROPOSED (needs a ledger decision) · ↳ maps onto a COMMITTED orbweaver domain (see the ST map).

---

## 1. The governing insight — the agent "system" does NOT slot in as a system

Marinara runs a 3-phase agent **pipeline** (pre-gen / parallel / post-processing) orchestrating ~21
agent types out of an 11k-line god-route. **Orbweaver cannot adopt that** — invariant #3 ("one turn
path, no second agent system"; `participants-agents-identity.md`). Orbweaver already has the primitive
marinara's pipeline provides: **agent = a pattern** `(identity, connection, view, tools)`, a stateless
`agentTurn` seam in `infra/providers`, with `domain/buddy` as the first consumer (all BUILT).

So marinara's agents don't port as a pipeline — each **dissolves into the domain that owns the data it
touches** (the "domain-of-affect" rule), as a verb or a Workload that calls `agentTurn`. §3 is that
dissolution. Most of them land in domains orbweaver has ALREADY committed.

---

## 2. RPG engine → `domain/rpg` (PROPOSED, the big one)

No D-decision, no gap-register row. Recommended: a **Phase-7+ feature domain** (post-chat graft), built
per [`rpg/07-port-map.md`](rpg/07-port-map.md). Decomposes:

| Piece | Recommended home | Phase | Notes |
| --- | --- | --- | --- |
| ⬜ Deterministic mechanics (dice, skill-check, combat math, weather, time, loot, elements, reputation) | `domain/rpg/substrate/` (pure) | 7 | Highest-confidence; pure functions + golden tests. Could land early — no chat dep. |
| ⬜ Turn state (`game_state_snapshots`) | `domain/rpg/persistence/` | 7 | Real typed table (swipe-indexed); add contract schemas. |
| ⬜ Campaign/config (the ~30 `meta.game*` keys) | typed sub-contracts in `domain/rpg/contract/` | 7 | The untyped-blob decomposition — the real rigor work. |
| ⬜ Combat encounter sidecar | sealed subsystem in `domain/rpg` | 7 | Verb-entered; `CombatSummary` merged back. |
| ⬜ Scene fork/merge | **likely `domain/chat`, not rpg** | 5-adjacent | Forking a chat is a chat concept — decide with chat. |
| ⬜ Turn-games (Uno) | defer | — | Single-game framework; lowest priority. |
| ⬜ RPG generative (NPC portraits / scene bg) | consumes `domain/imagery` (committed) | 7 | See §4. |

**The gate decision:** is an RPG mode a product goal at all? It's the largest single feature in the
whole marinara corpus. Everything above is one ledger entry away from schedulable.

---

## 3. The 21 marinara agents → where each dissolves

The punchline: **~half map onto domains orbweaver has already committed** (so "adopting them" is mostly
free — they're features of committed work), and the rest are RPG, D46 automation, or out.

### 3a. ↳ Already covered by COMMITTED orbweaver domains (no new decision needed — they ARE the committed feature)

| Marinara agent | Lands as | Committed by |
| --- | --- | --- |
| `expression` (emotion→sprite) | `domain/expressions` | D49 (Phase 7) |
| `illustrator` (scene art) | `domain/imagery` | D49 (Phase 7) |
| `knowledge-retrieval` / `knowledge-router` (RAG) | `domain/databank` (or a `world-info` retrieval verb) | D49 (Phase 7) |
| `html` (rich HTML cards) | D44 HTML-card sandbox (`@orb/ui` `sandbox-frame`) | D44 (Phase 6) |
| `background` (scene background) | D44 `ThemeOverride.background` token | D44/D49 (Phase 6) |

### 3b. ⬜ RPG features (need the §2 `domain/rpg` decision)

`world-state` (weather/time/location), `quest`, `combat`, `character-tracker`, `persona-stats`,
`custom-tracker`, `cyoa` (choice branches). These ARE the RPG game-state/tracker system — they only
exist if `domain/rpg` is greenlit.

### 3c. ⬜ D46 automation / plugin layer (Phase 8) — output shaping & narrative control

| Marinara agent | Lands as | Note |
| --- | --- | --- |
| `prose-guardian` / `continuity` (rewrite/check output) | a post-turn **Workload** (audit → propose edit) OR a D46 automation rule; some overlaps built `kit/regex` | Never a blocking nested LLM call in the RECEIVE seam. |
| `director` (secret plot / narrative pressure) | a thin `domain/director` + a `WorkloadKind` (its stateful loop runs async) | The one genuinely new subsystem; own decision. |
| `echo-chamber` (ambient parallel reactions) | a D46 automation rule / Workload | Ambient, non-blocking. |

### 3c. ⬜ Domain-of-affect Workloads (proposed — a verb in the data's owner domain)

| Marinara agent | Lands as |
| --- | --- |
| `lorebook-keeper` (auto-update lorebooks) | a `domain/world-info` verb/Workload calling `agentTurn` |
| `card-evolution-auditor` (auto-update character cards) | a `domain/character` verb/Workload |

### 3d. ⚫ Out (marinara-specific; not in orbweaver scope)

`spotify` (music integration) and `haptic` (teledildonics) — marinara's media/hardware agents. Adjacent
to the ST-side by-design-out set (TTS/STT, media). Would each need an explicit decision to even consider;
recommend leaving out.

---

## 4. Generative borrows → enhancements to COMMITTED Phase-7 domains

From the feature comparison — marinara has real *generation* capability the committed domains' plans
lack. These are **enhancements to already-committed work**, not new domains:

| Borrow | Enhances | Why it's worth a decision |
| --- | --- | --- |
| ⬜ **Sprite-sheet generation** (generate a full expression set, slice, bg-remove) | `domain/expressions` (D49) | Orbweaver's expressions plan assumes sprites already exist. This *produces* the `character_sprites` the classify-and-swap selects from — the single best cross-pollination. |
| ⬜ **Asset-manifest "pick-before-generate"** + **avatar-reference img2img conditioning** | `domain/imagery` (D49) | A cost/latency saver (reuse an existing tagged asset before generating) + on-model consistency via the `edit`/`ImageEditInput` seam. Neither is in the imagery plan. |

Ignore (comparison verdicts): marinara's scripting layer (its mutable var bag ships ST's swipe bug; its
raw-JS extensions are the sandbox anti-pattern) — orbweaver's D46 plan already out-designs it; and its
group system (an `if(isGroup)` character-array) — orbweaver's built roster is categorically bigger.

---

## 5. Recommended decision batches (for the ledger)

If Nate wants to act on any of this, these are the natural yes/no units — smallest/safest first:

1. **Generative borrows (§4)** — cheapest, highest-value, ride committed Phase-7 domains. Two small decisions.
2. **Domain-of-affect Workloads (§3c)** — `lorebook-keeper` + `card-evolution-auditor` as verbs on `world-info`/`character`. Small, additive, post-chat.
3. **The RPG decision (§2)** — the big one. A single "is RPG a product goal?" yes/no; if yes, it's a phased Phase-7 build (mechanics → state → campaign → sub-engines).
4. **`director` + automation agents (§3c)** — fold into the D46 Phase-8 automation/plugin work; decide when that phase is scoped.
5. **Leave out** — spotify, haptic, turn-games (§3d / §2).

Each batch = one ledger entry. Until then, all of this stays research in `proposed/`.

---

## 6. Cross-refs

- Marinara research: [`rpg/`](rpg/README.md) · [`Marinara-Agent-System-Analysis.md`](Marinara-Agent-System-Analysis.md) · [`Marinara-Agent-Port-Map.md`](Marinara-Agent-Port-Map.md) · [`Marinara-vs-Orbweaver-Feature-Comparison.md`](Marinara-vs-Orbweaver-Feature-Comparison.md)
- Committed side: [`../core/Core-SillyTavern-Feature-Map.md`](../core/Core-SillyTavern-Feature-Map.md) (the ST/committed map) · [`../core/Core-Laws-and-Precedents.md`](../core/Core-Laws-and-Precedents.md) (the ledger — where a marinara decision would be recorded)
- The agent pattern orbweaver already has: [`../domains/participants-agents-identity.md`](../domains/participants-agents-identity.md) · [`../domains/buddy.md`](../domains/buddy.md)
