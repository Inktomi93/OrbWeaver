---
kind: review
status: active
updated: 2026-09-05
---

# Derived-field fixture parity — the census, and why the lens is NOT a ratchet yet (#900)

Owner ask, 2026-08-30: three times in one week a test passed on a shape the server cannot produce, and
"our seed characters have the same problem." This is the CENSUS that names the class, the sweep verdicts,
and the **measured** answer to "can a `pnpm ast` arm enforce it?" — which is **no, not on the field name
alone**, with the precision receipts below. Nothing here is a ratchet proposal; the ratchet that IS
proposed is a compile-time one that this lane already landed twice.

## The rule

A factory/fixture/seed DERIVES every derived field through the ONE contracts derivation, with an explicit
override param for the tests that deliberately pin an arm. A fixture whose shape the server cannot mint
tests a product nobody ships. The worked example is
`tests/client/features/character/fixtures.ts#makeCharacterDetail` (#893): build the row, then
`provenance: overrides.provenance ?? characterProvenanceOf(row)`.

## The census — derivations whose output appears as a fixture/seed FIELD

The enforcement key is not "a derivation exists" but "a derivation's output is a field some fixture or
seed hand-writes". Column 4 is the verdict AFTER this lane.

| Derived field | The ONE derivation (path) | Who RE-DERIVES and compares it | Verdict |
| - | - | - | - |
| `CharacterSummary/Detail.provenance` | `characterProvenanceOf` — `packages/contracts/src/character/index.ts:84` | `domain/character/persistence/queries.ts:674,712` (both read models); the client only DISPATCHES | **Derived.** `makeCharacterDetail` (#893) + `characters-section.ct.tsx` (this lane). `makeCharacterSummary` keeps a stated default: `CharacterSummary` carries neither `creator` nor `importedFrom`, so the summary row has no inputs to derive FROM. |
| `characters.content_hash` | `cardContentHash` — `packages/server/src/kit/serde/card/index.ts:381` (sha-256 over the nine `CARD_IDENTITY_FIELDS`) | `verbs/update.ts:69` (`contentChanged` → gates re-embedding) · `domain/refinery/verbs/apply-fields.ts#basisOf` (belt 14) · `domain/imagery/substrate/identity-hash` | **Derived** (this lane). `makeCharacter` stamps it over the FINISHED row, override-explicit. Reached via `@orb/server/kit/serde/card` — the server-only-PURE bottom tier (`.dependency-cruiser.cjs:437`), no domain graph. |
| `RpgGameView.publicConfig.statProfile` + `trackers` | `RPG_RULESET_PROFILE[ruleset]` + `rpgSeedTrackers` — the BIRTH derivation, `domain/rpg/game-mint.ts:23-24`; the retune is `applyRulesetVocabulary` (`contracts/src/rpg/ruleset.ts:84`) | `verbs/game/update-config.ts:144` on a ruleset change | **Derived** (this lane) — `tests/client/features/rpg/fixtures.ts#makeRpgGameView` runs `rpgGameConfigSchema.parse` over the same three inputs birth passes. |
| `characters.background_override` (and the chat twin) | `canonicalBackgroundSource` — `packages/contracts/src/theme/background.ts:71` | every carried-background WRITE path; the asset-GC live-source scan roots what it stores | **Derived** (this lane) for the seed pack — `seeder/cards.ts#seededBackground` parses + canonicalizes, and the slug now derives from the card's own handle. |
| `characters.handle` | `slugifyHandle` — `packages/kit/src/slug/index.ts:90` | **Nobody.** `createCharacterSchema` only length-validates + brands it (no charset/name refinement), and #517 retired the client's derivability gate | **Hand-set BY DESIGN**, receipt in the `makeCharacter` header: deriving it would give every row in a suite the same handle against a `(ownerId, handle)` UNIQUE. |
| `CharacterSummary.nameIsAmbiguous` | `ambiguousNamesFor` (library-wide, lens-independent) | the list read model | **Derived where derivable**: `characterListResponder` recomputes it over the whole fixture library. A SINGLE-row story legitimately states it — one row cannot answer a library-wide question. |
| `ResolvedContextTab.crown` | none — it is DECLARED on three contribution defs (`chats-section.tsx:98`, `rpg-context-section.tsx:158`, `automation/lib/activity-context-tab.tsx:28`) | `context-bracket.tsx` renders it; #898 killed the predicate that read it | **Hand-declared axis data, corrected + documented (#898), NOT parity-asserted.** Refusal receipt below. |
| `RpgGameView.effectiveDelivery` | `deriveEffectiveDelivery` — `domain/rpg/substrate/readonly-axis.ts:56` | `verbs/read/get-game.ts:26` | **UNREACHABLE derivation** — it lives in `@orb/server/domain`, and client → server is an illegal import direction. `makeRpgGameView` mirrors the three arms in four lines and cites the source. This row is the class's one honest exception. |

Not on the census, checked and excluded with receipts: the preset-knob `provenance` axis
(`{value, provenance}` — a different concept under the same word, 15 fixture sites), the character-create
`provenance: {importedFrom, importHash}` ARGUMENT (5 sites), the `@orb/tooling` token `provenance` (2
sites), and the opaque-by-design content hashes on `character_embeddings` / memory digests / databank
chunks (they key equality, nothing recomputes them against a card).

## What the sweep found

1. **`tests/client/features/rpg/lib/dice-ask-source.ct.tsx` and
   `tests/client/features/chat/components/choice-send-provider.ct.tsx`** each hand-spelled an
   `rpg.getGame` literal behind a `: unknown` return. Both carried `statProfile: { attributes: [] }` — one
   `RpgStatProfile` field of six — and the first carried it beside `ruleset: "d20"`, a pair
   `planLiteGameBirth` cannot mint (a d20 game is BORN with `RPG_RULESET_PROFILE.d20`). Both were missing
   `publicConfig.dateMode`; the second was also missing `publicConfig.ruleset`. **Neither lie changed a
   verdict** (the dice row keys on `ruleset`, the choice provider on `cyoaChoiceBehavior`) — which is the
   \#900 hazard exactly: the pin is green over a fiction and the next reader of those fields inherits it.
2. **`tests/support/factories/character.ts`** defaulted `contentHash` to `hash_<id>` — see the census row.
3. **The seed pack** hand-spelled the five blank non-`seeded` background fields beside each card and
   retyped each `<handle>-bg` slug. Both are now computed; the retype was the surface a future edit could
   have smuggled an `assetId` through (the GC-root hazard `canonicalBackgroundSource` exists to close).
4. **`characters-section.ct.tsx:195`** spread `creator: "orbweaver"` AND `provenance: "shipped"` past the
   factory's own derivation. Now `makeCharacterDetail({ ...AZARAEL_DETAIL, creator: AUTHORED_CARD_CREATOR })`.

Refusals, with receipts:

- **`makeCharacter().handle`** — census row above. Deriving it is the defect, not the fix.
- **The crown axis (#898 / item 5).** Two of the three crowned defs are minted INSIDE contribution
  factories that need runtime deps (`chats-section.tsx`, `rpg-context-section.tsx`); only
  `activity-context-tab.tsx:28` is a module const. A parity assertion would have to construct all three
  feature contributions, which is a section-registry integration test, not a fixture change. The #898 fix
  already corrected the fixture to the live set and wrote the durable rule into
  `tests/client/features/app-shell/_ct-stories.tsx:910-913`. **Recommend: a follow-up row**, not a lane
  edit — and note it is exactly the case the lens below cannot judge either.

## Item 4 — the lens. Measured, and NOT ratchetable on the field name

Proposed rule (`ast-grep`, run in both languages — `ts` and `tsx` are different languages):

```yaml
id: derived-field-literal
language: tsx    # and a `ts` twin
rule:
  kind: pair
  all:
    - has: { field: key, regex: "^(provenance|nameIsAmbiguous|crown)$" }
    - not: { has: { kind: call_expression, stopBy: end } }   # a derivation CALL is the legitimate shape
```

### Receipts, both directions, run by hand

Planted a control file at `tests/client/features/character/cb-fixpar-plant.ts` (deleted after) carrying
the exact #893 defect as a positive control and the worked example's override shape as a negative one:

```ts
export const PLANTED_VIOLATION = { importedFrom: "chub", provenance: "authored", nameIsAmbiguous: false };
export function legitimate(overrides = {}) {
  const row = { importedFrom: null, creator: null };
  return { ...row, provenance: overrides.provenance ?? characterProvenanceOf(row) };
}
```

- **Positive control CAUGHT** — `cb-fixpar-plant.ts:6` appears in the `ts` hit list (twice: once per
  census key on the line).
- **Negative control NOT flagged** — the `?? characterProvenanceOf(row)` line is absent from the hits;
  the `not: has call_expression` clause clears it. So the rule's *shape* is right.
- **Scanned-file receipt** (a zero is "I could not search", never "not found"):
  `scannedFileCount=581` (tsx) and `2079` (ts) over `tests/`, `effectiveRuleCount=1,skippedRuleCount=0`.
  An earlier run of this same rule reported ZERO hits — the rule was fine and my output FILTER
  (`grep '^tests/'`) ate `ast-grep scan`'s box-drawing format. The number only became a result once the
  planted positive appeared in it.

**Precision: 1 true positive out of 42 hits (2.4%).** The 41 false positives break down as: 15
preset-knob `provenance` · 5 character-create `provenance:{importedFrom,importHash}` arguments · 9
ASSERTION sites (`toStrictEqual` / `toHaveBeenCalledWith` — asserting a shape is not authoring one) · 8
`crown` (the 4 corrected #898 story rows, which ARE the subject under test, and 4 in
`tests/client/lib/registry-contracts.test.ts`, a unit test OF the resolver) · 2 tooling token
`provenance` · 2 legitimate defaults in the worked example itself.

**Verdict: do not ratchet.** The field NAME is not the enforcement key — `provenance` names three
unrelated concepts in this repo, and ast-grep cannot see which type an object literal inhabits, so it
cannot tell a fixture from an assertion or a card from a preset knob. A ratchet here would be \~97% noise
and would train readers to allowlist.

### What to build instead (recommended, in priority order)

1. **The compile-time ratchet, which is free and already proven twice in this lane.** Give every fixture
   builder the REAL contract type as its return, never `unknown`. `makeRpgGameView(): RpgGameView`
   converted three silent holes into tsc errors the moment it landed — receipt, run against the two
   replaced literals with their id brands and `statProfile` repaired so only the missing members remain:

   ```text
   error TS2741: Property 'dateMode' is missing in type '{ statProfile: …; ruleset: "d20"; … }'
     but required in type '{ readonly statProfile: …; readonly ruleset: "d20" | "freeform";
     readonly dateMode: "narrated" | "structured"; … }'.
   error TS2739: Type '{ statProfile: …; immersiveHtml: true; … }' is missing the following properties
     from type '…': ruleset, dateMode
   ```

   This is the strongest enforcement available and it needs no new instrument: it fires on the NEXT
   contract member too, not just today's census. The cheap gate arm is therefore not "find hand-set
   fields" but **"find a fixture/story helper whose return type is `unknown`"**, which IS a precise
   structural query and whose remediation is this.
2. **A type-aware lens if a runtime check is still wanted** — a `ts-morph` pass (the shape
   `tooling/src/**` lenses already use) that resolves the CONTEXTUAL type of an object literal and checks
   the census field only when the literal inhabits the owning contract type. That is the only way to
   separate `CharacterSummary.provenance` from `EffectiveKnob.provenance`. Cost is real; propose it only
   if (1) leaves a measured gap.
3. **Per-derivation contract pins where a seed is the subject** — the shape this lane added to
   `tests/server/domain/character/seeder/cards.contract.test.ts`: assert the DERIVATION over the authored
   row (`characterProvenanceOf(...) === "shipped"`, `canonicalBackgroundSource(bg)` is a no-op), never a
   second copy of the expected value. These are FENCES (they pass on the unmodified pack); both were
   proven with planted controls that flip `shipped`→`authored` and smuggle an `assetId`.
