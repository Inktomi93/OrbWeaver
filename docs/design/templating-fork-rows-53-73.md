# The templating fork — PROSE-1 census rows 53-73 (REWRITE\_TOGGLES / GREETING\_TRANSFORMS)

**Status:** RULED **ARM B** (owner, 2026-08-09) and **BUILT** in the same pass. What landed, against §4's
inherited list:

| what | where |
| - | - |
| 21 slots (`preset.rewriteToggle.*` ×7, `preset.greetingTransform.*` ×14), `macros:"none"`, preset-homed and NOT legacy-adapted | `packages/contracts/src/preset/prose.ts` (two new tables) + `prose-slot/index.ts` (the id tuple) + `prose/index.ts` (composition) |
| the catalogs keep `id`/`label`/`axis` and now carry a `slot` pointer INSTEAD of `fragment` — the bytes have one home | `packages/contracts/src/preset/index.ts` |
| the wire carries KINDS: `guidedSteerSchema.rewriteToggles` (enum) + `transforms` on both greeting params/procedures | `contracts/chat/metadata.ts`, `server/domain/character/contract/params.ts`, `transport/trpc/routers/character.ts` |
| ONE resolver for "picked ids → ordered resolved fragments" | `resolveSteerFragments`, `contracts/prose/index.ts` |
| server composition at the two seams that already hold the prose blob | `chat/assembly/context.ts` (`composeSteerInput`, also feeding the WI haystack) · `character/substrate/greeting-studio.ts` (`composeGreetingSteer`), with `resolveGreetingTemplate` now returning `{template, prose}` |
| 21 Templates-tab rows — `steer` kind for the toggles, `studio` for the transforms (no new kind: each cohort's delivery IS the kind's existing statement) | `TEMPLATE_DEFS`, `contracts/preset/index.ts` |
| byte-parity proofs (server-composed bytes == the old client-composed bytes) + wire receipts | `tests/server/domain/chat/assembly/context.int.test.ts`, `tests/server/domain/character/verbs/rewrite-greeting.int.test.ts`, `tests/client/features/chat/components/composer-guided-cluster.ct.tsx`, `tests/client/components/greeting-studio.ct.tsx` |

`composeRewriteSteer` (kit) is byte-unchanged — the fork moved its CALLER, never the join. The rest of this
file is the reconstruction the ruling was made from; it is kept as the record of the arms.
**Why this file exists:** the board carried the fork as one parenthetical (`docs/retro-workboard.md:601-603`
— *"REWRITE\_TOGGLES/GREETING\_TRANSFORMS fragment bytes — client-composed via kit, a design fork"*) and the
history board as one more (`docs/history/retro-workboard-2026-08-08.md:1133`). Neither states the arms, and
no row exists in the OWNER RULINGS LEDGER (`docs/retro-workboard.md:42-60`) or in PROSE-1 §11's owner-decision
list. A lane sent to "take the recorded lean" found there is no recorded lean. This is the fork, reconstructed
from the tree, so the ruling is one word and the build lane needs no re-derivation.

**Scope:** the 21 `fragment` strings of `REWRITE_TOGGLES` (7) + `GREETING_TRANSFORMS` (14) — PROSE-1 census
rows 53-73 (`docs/design/prose-1-spec.md:138-139`), the last un-slotted rows of stage S2 (`:451`).

---

## 1. What is true today (source-pinned)

| fact | receipt |
| - | - |
| The 21 fragments are `as const` registry data in a contracts file that is ALSO a sanctioned prose catalog | `packages/contracts/src/preset/index.ts:450-462` (REWRITE\_TOGGLES), `:496-573` (GREETING\_TRANSFORMS); catalog membership at `scripts/check/gates/no-hardcoded-model-prose.ts:45` |
| Two CLIENT surfaces filter the catalog by selection and read `.fragment` | `packages/client/src/features/chat/components/use-rewrite-modal.ts:50`; `packages/client/src/components/greeting-studio.tsx:98` |
| Composition is a pure kit join, executed IN THE BROWSER | `composeRewriteSteer`, `packages/kit/src/guided/index.ts:61-68` |
| The wire carries the COMPOSED STRING, never the selection | chat turn: `guidedSteerSchema.input` (`packages/contracts/src/chat/metadata.ts:212`); greeting studio: `RewriteGreetingParams.steer` / `GenerateGreetingParams.steer` (`packages/server/src/domain/character/contract/params.ts:100,106`) |
| The server never learns which toggles fired — it neutralizes the whole steer and splices it as `{{input}}` | `resolveGuidedActionText` → `resolveGuidedInstruction` (`packages/server/src/domain/chat/assembly/macros.ts:244-248`, `kit/guided/index.ts:138`) |
| **Prose resolution is a 100% SERVER-TIER invariant today** | `resolveProse(`/`resolveProseText(` resolve in 23 files, all `contracts` + `server`; **zero** in `packages/client`, **zero** in `packages/kit` (`grep -rln`, positive control: the same pattern returns the 23 server/contracts files) |
| The client imports `@orb/contracts/prose` only for EDITOR metadata (`PROSE_SLOTS`, `proseFooterState`) | `features/preset/components/template-drill-in.tsx:18-19`, `features/chat/components/prose-settings-section.tsx:20-21` — no resolution call |
| Neither client surface holds the preset's `promptConfig` | no `promptConfig` reference anywhere in `packages/client/src/features/chat`; `GreetingStudioProps` (`greeting-studio.tsx:56-64`) carries no preset id at all |
| The SERVER already holds the preset prose at both seams | chat: `AssembleContext.prose` composed at `chat/assembly/context.ts:792`, live where the guided template resolves (`macros.ts:244`). greeting: the caller's preset `detail.config` is already loaded at `entry/compose/assets-character.ts:242-244` |
| Leaving them un-slotted trips NO gate | `preset/index.ts` is an exempt authoring home (`no-hardcoded-model-prose.ts:45`); ARM B (dead catalog prose) walks catalog files and these consts are imported, so they are alive |
| PROSE-1 §6.1 records only their macro MODE (`none`), which is arm-neutral | `docs/design/prose-1-spec.md:342` — the join stays `composeRewriteSteer` under either arm; only WHERE it runs changes |

**So the fork is precisely this:** every other prose slot is authored in a contracts catalog, stored on the
preset/user blob, and resolved by the server at the seam that assembles the prompt. These 21 fragments are
assembled in the BROWSER. To make them host-editable, either the resolution moves to the client, or the
composition moves to the server. Nothing else is in tension.

---

## 2. The arms

### Arm A — resolve client-side (keep the wire, add a prose tier to the client)

Ship the 21 as `home:"preset"` slots; both client surfaces load the active preset's `promptConfig.prose` and
call `resolveProseText(id, overrides)` per selected fragment before `composeRewriteSteer`.

- **For:** zero wire change; the catalog stays one client-rendered registry; smallest server diff.
- **Against:** it FORKS the "prose resolves server-side" invariant that is currently absolute (23/23 call
  sites). "Which bytes reached the model" stops being answerable from server storage — the wire capture shows
  a composed blob with no provenance. It also needs new plumbing: the chat composer must read `promptConfig`
  (it reads none today) and the greeting studio — a tier-2 component mounted by TWO features
  (`greeting-studio.tsx:1-6`) — must be handed a preset blob it currently has no concept of.
- **Not a security issue:** presets are per-user and global (standing ruling), the caller owns the character
  (`loadOwnedCharacterRow`, `rewrite-greeting.ts:18`), and the composed steer is neutralized as `{{input}}`
  downstream either way. A member can already type any bytes into the free-text field. The cost is
  architectural and auditability, not trust.

### Arm B — compose server-side (the wire carries IDS)

Add `rewriteToggles?: RewriteToggleId[]` to `guidedSteerSchema` and `transforms?: GreetingTransformId[]` to
the two greeting params; the client sends the SELECTION + free text; the server resolves each fragment through
`resolveProseText(id, ctx.prose)` and calls the same pure `composeRewriteSteer`.

- **For:** one prose tier, unchanged. Both seams already hold the overrides (`context.ts:792`,
  `assets-character.ts:242`), so the resolution is a read away. It matches the recorded doctrine on this exact
  schema — `gameSteer` is enum-only *"the wire carries only the kind, never template text"*
  (`chat/metadata.ts:218-223`) — and it makes a slot's bytes auditable in the wire capture, which is what
  makes the override worth having.
- **Against:** a wire-contract change on a declared trust boundary (`guidedSteerSchema` is *"THE trust
  boundary"*, `metadata.ts:204-205`) plus two character params; the client keeps the catalog for CHIPS but loses
  composition, so `tests/client/features/chat/components/rewrite-dialog.ct.tsx:38` (asserts the composed steer
  bytes) and the `_ct-stories.tsx:1041` story must re-target the fired IDS.
- Free text still crosses as text under both arms — it is user input, not prose.

### Arm C — rule them OUT of scope (they stay code)

Precedent: `GUIDED_GAME_STEERS` and `SCOPE_INSTRUCTIONS` (PROSE-1 §3.3). The argument: these are a client
STEERING VOCABULARY — chips that compose into the user's own instruction — and a host who wants different
wording types it in the free-text box that sits beside them.

- **For:** zero build, and it is gate-legal today (§1, last row) — the census rows just stay `✗` forever.
- **Against:** it contradicts PROSE-1 §9's own S2 line (*"preset: rows 49, 53-73 → slots"*, `:451`) and leaves
  21 model-facing strings the program's thesis says must be reachable. If taken, the ruling should be
  appended to §3.3 with its reason so the next census sweep does not re-open it.

---

## 3. Recommendation

**Arm B.** The deciding receipt is not cost, it is the invariant: prose resolution is server-tier in 23 of 23
call sites, and arm A's only real benefit — a smaller diff — is spent immediately on plumbing a preset blob
into two client surfaces that have never seen one. Arm B's cost is a wire change on a schema whose own header
already argues for carrying kinds instead of text, and it leaves the auditable property ("the bytes the model
got are the slot's bytes") that is the entire point of slotting them.

If the owner prefers C, say so and §3.3 gets the row — that is a legitimate close, not a deferral.

## 4. What a build lane inherits (either arm)

Coupled sites that assert these bytes or this composition:

- `tests/kit/guided/index.test.ts:129-155` — `composeRewriteSteer` unit (7 cases; pure, survives both arms)
- `tests/contracts/preset/index.contract.test.ts:407-430` — catalog shape + the no-macros invariant
- `tests/client/features/chat/components/rewrite-dialog.ct.tsx:38` — asserts a literal fragment byte inside
  the composed steer (**re-targets under arm B**)
- `tests/client/features/chat/_ct-stories.tsx:1041-1042` — the story that composes on Apply
  (**re-targets under arm B**)
- `tests/client/components/greeting-studio.ct.tsx:17-24` — chips render blind from the catalog (survives both)

Plus the standard slot obligations: 21 rows in `packages/contracts/src/preset/prose.ts`, `PROSE_SLOT_IDS`
membership, the `prose-baseline.json` regen (`pnpm prose:baseline`), byte-identity contract tests per slot
(PROSE-1 §10), and the Templates-tab rows (`features/preset/lib/template-rows.ts` walks
`PRESET_PROSE_SLOT_IDS`, so the editor door opens the same commit).
