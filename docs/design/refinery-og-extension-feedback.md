# Refinery — the OG extension's community feedback, mapped to orb (2026-08-08)

> **Source:** the owner's Discord release thread for SillyTavern-CharacterTools → SillyTavern-CardRefinery
> (2025-12-27 → 2026-02-07), pasted by the owner 2026-08-08 as R3/R4 input. This doc distills every
> user-asked improvement and maps it to today's tree (R0+R1 shipped, R2 in flight, R3 mocked). Where a
> want is already covered, the receipt says by what — do NOT re-board those.

## Already covered or exceeded on today's tree

| OG want (who) | Orb status | |
| - | - | - |
| Token counting, not chars ("# of chars was much less useful", owner 1/2/26) | RULED AGAIN 2026-08-08: critique caps are 4,000 TOKENS/field (kit tokenizer) + derived char backstop; the R3 mock's run bar shows `prompt ≈ N / M tok` fit. The extension and the rebuild converged on the same lesson independently. | |
| Leave `{{user}}`/persona macros INTACT during refinement (interlamer 12/28, zvxcm 1/8) | EXCEEDED structurally: belt-5 satisfaction-by-construction — the refinery domain has no macro engine at all (two-method zero-imports receipt), macros ride verbatim; pinned both drift directions. The OG fixed this behaviorally, twice. | |
| Session persistence + pick-back-up (owner 12/28) | BUILT: `refinery_sessions`/`refinery_runs`, R1 lifecycle verbs. | |
| Full history + revert / snapshot before apply (README, F6) | BUILT/RULED: apply auto-snapshots first (`"auto: before refinery apply"`); F6 auto-stamp ratified. | |
| Selective field processing (README) | BUILT + EXCEEDED: `selection.fields[]` + per-greeting `greetingIndexes` (the belt-9 fence — finer than the OG ever had). | |
| Structured output + custom schema (README) | BUILT (fixed payloads, xgrammar-enforceable) + the NL→schema `{kind:"custom", schemaId}` arm is DDL-free and designed (SF0-SF3). | |
| Connection pain (Vertex/Claude/etc — kirin, FracKen\_A 1/1) | N/A by construction: orb's connection layer owns providers; the refinery rides the summarize role. The OG's whole connection-refactor saga is structurally impossible here. | |
| Card export when done, same image (Jeb 12/31) | MOSTLY COVERED: `applyFields` writes the live card; \`?format=png | json\` export exists + C6's kebab submenu landed 2026-08-08. Residual: see gap 3. |

## Real gaps — boarded

1. **THE MANUAL-REWRITE ARM (ShadowKyogre 1/11 — the diagram want, accepted by the owner then):**
   the pipeline forks after SCORE: *LLM rewrite* OR *hand-edit the scored fields in a WIP area inside
   the extension*, both feeding ANALYZE ("did my manual edit break it?"). Orb's R1 engine runs
   model-authored rewrites only — there is no verb accepting a HAND-authored rewrite as the analyze
   input. This is a real R3-scope feature (the WIP edit area belongs on the surface; the verb arm is
   small — analyze already compares arbitrary rewrite-shaped payloads against the anchored original).
   The OG's accepted workflow: score → (LLM | manual) → analyze → accept/refine/revert.
2. **LOREBOOK / WORLD-INFO REFINEMENT (zvxcm 1/8, ShadowKyogre's auxiliary-lorebooks ask 1/11):** the
   OG grew from titles-only to full entry contents analyzed + rewritten, and users immediately wanted
   auxiliary books too. Orb's `REFINABLE_FIELDS` is card-fields-only (F5 v1, deliberately). A
   world-info refinement arm is an R4+ doorway — new field family, same engine; the batch-score sweep
   (R4) is its natural sibling. NOT v1 scope; recorded so it isn't re-derived from scratch when asked.
3. **APPLY-AS-COPY (the OG's "download as a new one" arm, Jeb/owner 1/5):** orb applies to the live
   card or nothing. A "save refined result as a NEW character" arm (fork-the-card-with-rewrite) is
   RULED IN 2026-08-08 (owner) — R3 scope; design: refinery-schema-renderer.md §17.
4. **Persona-substitution TOGGLE (zvxcm 1/8, owner offered):** "in case you WANT the {{user}}
   replacement" during analysis. Orb's belt-5 makes the default (no substitution) structural; an
   opt-in substitution arm would be a deliberate belt-5 exception needing its own security look.
   Recorded as a doorway with a warning label, not a plan.

## Sequencing note

Gap 1 (manual-rewrite arm) is the only one with a live sequencing claim: it shapes the R3 surface
(the WIP edit area is a CONTENT state) and should be in the R3 build brief, not discovered after the
surface ships. Gaps 2-4 fold into R4 planning. The accept-ergonomics rework (owner 2026-08-08,
checkbox itch) is being mocked separately — `docs/design/mocks/refinery/accept-ergonomics.html`.
