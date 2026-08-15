---
kind: history
status: archived
updated: 2026-08-02
---

# Stickler design review — the actor-state model (roster · cast · the volatile plane)

**Charge (owner):** three defects landed in ONE seam in ONE day — `b962df48` (actorState additive),
`ad60f455` (editSnapshot plane/value legality), and the in-flight cast-edit wipe lane. Is the actor-state
model coherent, or are we bandaiding a mis-shaped seam? Plus: "NPCs are different — or should be — from
characters and human players in the roster; NPCs can come in and out." Mid-review additions: Q5 (hp's
native privilege — **RULED during review: hp folds into the unified tracker system**; deliverable is the
HOW), the ST `rpg-companion` reference as the wandering-NPC gameplay benchmark, and the owner's two
departure/return arms (tail-reach vs per-game NPC ledger). North star (owner, verbatim-close): *"rpg-lite
isn't a full-ass rpg, it's basically rpg-ISH: to steer the story and for state to be a bit more durable."*

**Reviewer:** stickler (fresh context). Everything below was read/evidenced this session; the
verification log is §8.

---

## VERDICT: RESHAPE — scoped, staged, and cheaper than it looks

The three fixes were each the **right local shape** (all three verified real: regression tests proven
red-first, asserted at the db row through the real verb, the e2e helper hardened — §8). But they are
three patches on **one mis-shaped contract**, and the owner's NPC instinct is correct about a **second,
independent mis-shape**. Neither reshape touches the model wire, the xgrammar/D112 fold machinery, or
the merge engine's model path — the expensive, measured parts all survive.

The two structural defects:

**MS-1 — The hand-write contract is IMAGE-shaped over a plane the client can only see in
projections.** `rpg.editSnapshot`'s `patch` asks the client to author a plane's **whole new array
image**, while the read contract splits that plane into projections that do not reconstruct it:
`actors[].volatile` (roster half), `castVolatile` (present-cast half — **zero client consumers**,
evidenced §8), and an invisible residue (departed NPCs' rows, in **no** projection at all). Every one of
the three defects is this contract failing a different way. Even the in-flight lane fix (seed
`emptyVolatile` from `castVolatile`) leaves the image structurally unauthorable — a client can never
re-author the departed NPCs' rows it cannot see; only the `omissionRemoves:false` patch keeps that from
being data loss. The repo already knows the right shape: **the quest plane got op-shaped hand verbs**
(`upsertQuest`/`deleteQuest`) instead of array images. The actor plane should get the same.

**MS-2 — NPC identity is split across two planes with OPPOSITE lifecycle semantics.** A cast NPC's
soft half (name/emoji/mood/relationship/appearance/outfit/thoughts) lives on the `presentCharacters`
row — **destroyed on departure**; her hard half (hp/trackerValues/conditions/inventory/wallet/status)
lives on the `actorState` `cast:` row — **retained forever, invisible offstage, and now removable by no
gesture whatsoever**. Departure destroys exactly the state the schema itself calls "STANDING state …
persists until the story changes them" (`snapshot.ts:90-99`) and silently resets the relationship arc;
return re-surfaces the hard half against a blank identity. That is not "come and go" — it is
half-amnesia one way and a permanent ghost the other.

Plus the ruled **hp demotion** (Q5, §6) and four smaller confirmed incoherences (§2.3).

---

## 1. Q1 — The actor taxonomy, as actually built (receipts)

### 1.1 There is ONE store, not two — the "two homes" are projections

- Durable home: `packages/db/src/schema/rpg.ts:138` — `rpg_snapshots.actor_state` JSON column,
  `readonly RpgActorVolatile[]`. **No `castVolatile` store exists anywhere.**
- `castVolatile` is minted only in `packages/server/src/domain/rpg/chat-ops/tracker-view.ts:174-181`:
  the view walks `state.presentCharacters` and looks each present member's `cast:<key>` row up in the
  same `volatileByKey` map the roster rows use. One plane, split read.
- The write contract (client): `packages/client/src/features/rpg/lib/volatile-patch.ts:19-32`
  (`actorStatePatch`) rebuilds the whole-array image **from `actors` only** — the roster projection.

So the honest current taxonomy:

| Kind | Identity home | Presence | Volatile | Sheet | Exceptions |
| - | - | - | - | - | - |
| roster human | chat roster (`user:<id>`) | `presentCharacters` row optional (`characterId` join for characters; never for users — `rpg-status-tab.tsx:45`) | `actorState[user:<id>]` | `rpg_sheets` row | `sheet.trackerGrants/Revokes` |
| roster character | chat roster (`character:<id>`) | same | `actorState[character:<id>]` | `rpg_sheets` row | same |
| cast NPC | **the `presentCharacters` row itself** (name-keyed) | the same row (identity ≡ presence) | `actorState[cast:<name>]` | none | def-side explicit `appliesTo` list only (`tracker.ts:143-145`) |

For roster people, presence and identity are already **separate planes** (correct). For NPCs they are
**the same row** — which is exactly why departure destroys identity. The split is not "roster state vs
cast state"; it is "identity-with-presence-fused vs identity-free hard state".

### 1.2 Presence / departure / return, per kind (traced)

- **Departure gesture:** model-only — `scene.presentRemove` (`tools/apply.ts:295-303` filters the cast
  array). **No hand gesture exists**: swept `packages/client/src/features/rpg` for
  remove/dismiss/depart and for any client `presentRemove` producer — zero hits (§8). A host cannot
  dismiss an NPC from the product.
- **What departure destroys:** the `presentCharacters` row — mood, emoji, relationship,
  appearance/outfit/thoughts (the RV-11 "standing" guides), and the `characterId` join.
- **What departure retains:** the `actorState[cast:<key>]` row — invisibly. It is projected **nowhere**
  once the NPC is off the cast (view `castVolatile` iterates `presentCharacters` only; `actors` is
  roster-only), yet it remains a legal write target: `reachableActorRefs`
  (`tools/apply.ts:480-491`) admits every tracked cast actor, and the compose enum walk
  (`entry/compose/rpg.ts:403-407`) puts every tracked cast key in the `targetRef` enum **forever**. A
  model can wound an NPC nobody can see.
- **Return:** `presentUpsert` with the same name re-creates the identity row from scratch —
  `mergeRelationship` (`apply.ts:266-274`) resolves `existing === undefined` → **neutral**; the guides
  start empty; `deriveRelationshipBeats` (`apply.ts:609-626`) **skips first-seen members**, so an
  established `enemy` returning as `neutral` produces no journal beat, no delta line — a silent arc
  reset. The hard half (hp/inventory/conditions/wallet/trackers) re-surfaces intact via the `cast:`
  key. **Half-retention, split exactly along the identity/state seam.**
- **Removal of the hard half:** after `b962df48`, **no gesture removes an `actorState` element at
  all** — omission never removes (`merge.ts:98`), no tool removes an actor, the hand image cannot
  remove, and even `resyncFromStory` merges through the same additive plane
  (`resync-from-story.ts:106` → `applyLockedPatch` → `KEYED_ARRAYS.actorState`). The plane is
  **grow-only**, clone-forwarded into every snapshot row on every beat, and a pre-R5-guard hallucinated
  mint (the "Aldric Vane" class the R5 doc itself records) is now **permanent**: permanently in the
  targetRef enum, permanently reachable, permanently cloned. Only a checkpoint restore (a rewind, not a
  gesture) ever shrinks it.

### 1.3 Can the client READ every kind's state? — No (and it is a wrong-split tell, not just a missed wire)

- `castVolatile` client consumers: **zero** (ast-grep over `packages/client`, both `ts` and `tsx`
  langs, §8). The Scene cast card renders mood/guides/relationship/`castTrackers` only
  (`rpg-scene-tab.tsx:196,292`); the Inventory tab iterates `state.tracker.actors` — roster only
  (`rpg-inventory-tab.tsx:184`). So a cast NPC's model-written hp, conditions, status, **inventory and
  wallet** — the exact planes the view header boasts are "written … onto a cast NPC exactly as they do
  onto a roster member" (`views.ts:151-157`) — render to the **host nowhere**. The model sees them
  (reminder `castLine` → `volatileSegs`, `reminder.ts:361-363`); the human does not.
- Verdict on "wrong split vs missed wire": **wrong split.** The server had to grow a THIRD view member
  (`castVolatile`) bolted beside `cast` and `castTrackers` precisely because the NPC is not an actor in
  the view model; the client then predictably consumed the two old members and not the bolt-on. A
  unified per-actor view row (roster and cast through one `RpgActorView`) would have rendered the NPC's
  pack for free the day `update_inventory` learned cast targets.

### 1.4 Tracker grants/revokes across kinds — one confirmed read/write drift

The carrier classes partition **rows**, not **people**, and one person can be both:

- WRITE surface (`entry/compose/rpg.ts:373-407`): carriers are deduped **by lowercased name**, roster
  loop first — a roster character standing in the scene cast is a `party` carrier only. Honest.
- READ surface (`tracker-view.ts:176-181` + `reminder.ts:465-468`): every `presentCharacters` row —
  **including a roster character standing in the scene** (the §12.2.3 join the Status tab renders,
  `rpg-status-tab.tsx:44-48`) — gets `castCarrier(key, name)` = kind `npcs`, grants/revokes empty, with
  no dedup against the roster half.

**Confirmed consequence** (schema-level, no live repro needed): define `trust` with
`appliesTo:"npcs"` (the e2e SPEC 1 shape). A roster character joins the scene cast. The reminder and
Scene tab teach `Trust` on her cast line (bare label via `castTrackers`), but the write surface never
offers `trust` for her (party group) — under an enforcing grammar the model **cannot write the tracker
it is being shown on her line**; on a non-enforcing wire the write resolves through the roster index to
`character:<id>.trackerValues.trust`, which **no reader projects** (her `RpgActorView.trackers` excludes
it — party carrier; `castTrackers` reads the `cast:` row — null). This is exactly the
"reminder-is-knowledge / tools-are-permissions" drift the file headers claim is impossible
(`tracker-view.ts:11-14`), reborn through the row/person conflation. Severity: moderate today (needs an
npcs-classed tracker + a scene-standing roster member — a common d20 shape), structural either way.

### 1.5 Cast identity is a raw verbatim NAME

`actor.ts:9` and `snapshot.ts:78` both say "stable **normalized**-name key"; the code stores the
verbatim model-authored name: `mergeCastMember` sets `key: up.name` (`apply.ts:281-283`),
`resolveActor` mints `cast:${targetRef}` verbatim (`apply.ts:91`) while **matching** lowercased
(`roster.get(targetRef.toLowerCase())`), and the view joins by exact string (`` `cast:${c.key}` ``,
`tracker-view.ts:178`). The normalization claim is aspirational. Under an enforcing grammar the
per-call enum pins spelling, so the live risk is confined to non-enforcing wires and hand/seed writers —
but identity-by-display-string is also what makes rename impossible and promotion awkward (§4). Dots in
names additionally collide with the dotted lock-path grammar in pathological cases (exact-match lookup
saves the common ones).

---

## 2. Q2 — The write model: is `omissionRemoves` principled, or a patch?

**Both — it is a principled policy for a contract that should not exist on the hand path.**

Split the two writers, because they were never symmetric:

- **The model wire is already op-shaped.** Tools/extraction author *deltas against a target*
  (`update_party {targetRef, …}`); the appliers rebuild complete plane images **server-side from the
  true base** (`withActor` map-or-append, `apply.ts:95-100`; the staging read-through). There is no
  omission ambiguity on this path: the image the merge sees is always complete because the server built
  it. `omissionRemoves` on quests/inventory/presentCharacters/wallet/conditions correctly encodes
  "these planes have a real remove-by-omission gesture" (`deleteQuest`, item removal, `presentRemove`,
  `removeCondition`) — the registry is honest, the contrast test pins it, keep it.
- **The hand wire is image-shaped, and that is the defect factory.** All three of the day's defects are
  the same failure: (1) `b962df48` — partial image deleted unnamed actors; (2) `ad60f455` — image keys
  weren't validated against the plane vocabulary; (3) the wipe lane — the image was fabricated
  (`emptyVolatile`) for the half of the plane the client cannot read, and under `[merge-clear]` that
  fabrication is **destructive**: `hp:null` = clear, `conditions:[]`/`inventory:[]`/`wallet:[]` = wipe
  (keyed planes, `omissionRemoves:true`), `status:""` = replace (`volatile-patch.ts:13-15` +
  `merge.ts:203-224` — traced, matches the workboard's dispatch note verbatim).
- **A fourth latent defect the image contract carries** (confirmed by construction, not live-reproduced):
  the stale-image clobber. `actorStatePatch` re-sends **every carrying actor's full volatile row**
  read at query time; `applyHandEdit` re-resolves the head at write time (`snapshot-edit.ts:89-91`)
  with `locks:null`. Any model flush that lands between the panel read and the hand write is
  overwritten field-by-field for **every actor in the image**, and its freshly-added conditions/items
  are removed by omission from the stale nested arrays. An op-shaped write (touch one actor, one field)
  confines the blast radius to the datum the human actually touched. Low likelihood per-click
  (one-beat-behind panel, flush barrier), but it scales with party size and with the coming member-arm
  (`edit-snapshot.ts:37-38` defers member self-edits — under an image contract, that arm would let a
  *member's* stale image clobber the whole plane; under ops it is trivially scoped to their own ref).

**Would an op-shaped hand contract kill the ambiguity class? Yes, and it costs the model wire
nothing.** The hand door is not model-facing — xgrammar, the D112 fold, `constrainExtractionSchema`,
`cacheStableExtractionRefs`, the three-vehicle salvage: all untouched. The repo precedent is already
in-tree: the quest plane's hand doors are verbs (`upsertQuest`/`deleteQuest`), not array images, and
none of the day's defect class ever touched them. Proposal in §5.

---

## 3. Q3 — `locks:null`: two jobs, one flag

Confirmed as described: `applyHandEdit` passes `fieldLocks: null` (`snapshot-edit.ts:91`) to get
hand-always-wins, and `null` simultaneously disables `hasLockAtOrBelow`'s element-survival defense and
every per-element pin inside `mergeKeyedArray` (`merge.ts:135-144,182`). Two semantics, one sentinel.

**But: no live defect remains that a split would fix, and the reshape retires the question.** Audit of
the coupling's arms today:

- Hand removes a *locked* element via whole-image omission (quests/presence/nested planes): the human
  is the authority the lock protects — correct behavior, not a defect.
- Hand-vs-hand: locks exist to stop **tool** writes; a hand edit overwriting another hand edit's locked
  path is correct.
- The one place the coupling actually bit — the hand door's partial `actorState` image losing the
  removal defense — is dead by the additive policy.

Recommendation: **do not split the flag now** (a `{honorValueLocks, honorRemovalDefense}` pair would be
machinery with no live consumer difference). Under the §5 op-shaped hand door the server performs the
read-modify-write itself and "hand always wins" becomes a property of the op applier, not a merge flag —
the second job disappears structurally. Bank the lesson (already banked); spend the effort on the
contract, not the flag.

---

## 4. Q4 — Gameplay, the wandering-NPC benchmark, and the owner's two arms

### 4.1 The ST `rpg-companion` reference (read: `src/utils/presentCharacters.js`,

`src/systems/generation/promptBuilder.js`, `src/core/{state,persistence}.js`)

Its model: the model **re-emits the entire tracker block every generation** (user stats + info box +
present characters, each NPC with details/thoughts/relationship/per-NPC stats); the extension parses it,
stores it **per-message/per-swipe** (`rpg_companion_swipes` in message extras), commits it, and
re-injects the committed block into the next prompt. The narrator prompt is pure prose-presence: *"Infer
the identity and details of characters present in each scene from the story context"*. Departure = the
model omits the NPC from its next list; return = the model re-lists her, re-inventing details from
prose context. The only durable per-NPC thing is `extensionSettings.npcAvatars` — a name-keyed avatar
map that survives everything (an accidental mini-ledger).

**Where ours beats it:** durable merge-based planes with omit=keep (no N×turns re-emission cost, no
per-turn restatement drift); schema-enforced arrival (`establishScene.presentCast` + per-call enums +
the R5 ghost guard — ST has a regex/JSON scrape with a legacy text fallback); hard state (hp/inventory/
wallet) that genuinely survives departure; swipe-consistency by construction (ST approximates it with
per-swipe blobs).

**Where ours trails it — the actual "wandering feel":** in ST, because the model re-states everything
every turn, a returning NPC *feels* continuous — the model is the store, and prose context rehydrates
her details instantly. In ours, omit=keep means the model is **not** asked to restate standing guides —
so a returning NPC surfaces with blank guides, neutral relationship, and nothing forces
re-establishment (`establishScene.presentCast` only fires on an **empty** cast). Our return experience
is measurably worse than the benchmark's for the soft half, and it is the *retention* design (destroy
the row) rather than the extraction design that causes it. The lesson to mine: **retention must live in
the substrate (our way), but the substrate must actually retain the identity half** — then we beat the
reference on both axes instead of one.

### 4.2 The owner's two arms

- **(a) TAIL-REACH** — rehydrate a returning NPC from her last appearance. **Reject as the primary
  mechanism.** The hard half needs no reach-back (it already survives structurally on the additive
  plane); only the destroyed `presentCharacters` row would need it, and that means an unbounded scan
  over snapshot JSON columns with genuine last-appearance ambiguity across variants/branches (which
  sibling's "last time" wins after a swipe?). The one-homed tail selectors resolve *the current head's
  lineage*, not "the last snapshot anywhere whose cast contained key X" — that is a new, worse query
  class. Keep reach-back as at most a one-shot heal (`resyncFromStory` already re-derives a departed
  NPC's stance from prose when she returns — that IS tail-reach, done through the model, already built).
- **(b) PER-GAME NPC LEDGER** — right instinct, **wrong plane if taken literally.** A game-scoped
  durable row must not hold swipe-volatile story state: a swipe MUST rewind an NPC's hp, her
  relationship turn, even her outfit change — snapshot-residency is what makes the panel
  swipe-consistent (the D108 ratification demand), and it also means a swiped-away NPC introduction
  correctly evaporates instead of ghosting in a durable table. What genuinely belongs at game level is
  **identity chrome**: canonical name/aliases, avatar, the `characterId` promotion join, host notes.
  And the architecture has already reserved exactly this seat: `actor.ts:9-11` — *"Full ADDS the
  `{kind:"npc"}` arm when `rpg_npcs` lands."* The ledger is the declared future; lite does not need the
  table yet — it needs the **snapshot-resident split fixed** so the ledger can graft later with zero
  re-spell.

**The synthesis (what §5 proposes):** make the NPC an **actor**, not a scene annotation. Move the
identity+standing fields onto the (already departure-surviving, already swipe-consistent) per-actor
row; reduce `presentCharacters` to a pure **presence** plane. Departure then retains *everything* by the
same mechanism that retains it today for the hard half; return re-surfaces the whole NPC; the owner's
"per-game NPC array" exists **in effect** (the actorState cast rows, made whole, visible, and
removable) without a new table, and `rpg_npcs`/`{kind:"npc"}` stays the clean cross-game graduation
doorway (cross-game NPC library, promotion) it was always reserved to be.

### 4.3 Promotion NPC→roster

**Does not exist** (swept server+client+contracts for promote/promotion: zero hits). The backward join
exists (`presentCharacters.characterId` — a roster character standing in the cast), but there is no
"this NPC earned a card" path. Should it exist? Under the north star (rpg-ISH steering), yes but late:
it is the emotional payoff of the wandering-NPC loop (the recurring stranger becomes party). Under §5's
shape it is mechanical: mint a character card from the actor row, stamp `characterId`, re-key
`cast:<name>` → `character:<id>` in the head snapshot (one keyed-plane rename op — the same op family
`dismiss` needs). Name it a doorway; do not build it in this lane.

---

## 5. The RESHAPE proposal (spec-grade, staged)

Everything below is hand-door + view + contracts; the model wire (tool arg schemas, extraction schema,
fold, salvage, enums, prompts) is untouched except where hp's demotion (§6) removes an arm.

### Stage R1 — op-shaped hand door for the actor plane (kills the defect factory)

- `rpg.editSnapshot` keeps the `[merge-clear]` image contract for the planes where an image is honest
  (ambient leaves, `trackerValues` record, `plot`, `recentEvents`) — the record/leaf planes never had
  the ambiguity. The **array planes leave the patch vocabulary**:
  - `rpg.patchActor { chatId, targetRef: RpgActorRefInput, volatile: PartialVolatileOps, lock?: … }` —
    per-field ops (`setStatus`, `setTrackerValue(key, {value?,items?,max?})`, `addCondition`/
    `removeCondition`, `addItem`/`removeItem`/`patchItem`, `setWalletAmount(name, amount)`). Server does
    read-modify-write against the resolved head; hand-always-wins by construction; auto-locks the
    exact fine path per op (the `#10` grammar gets *more* precise, not less). One actor, one datum, no
    image, no fabrication, no stale-clobber, member-arm-ready.
  - `rpg.dismissActor { chatId, targetRef }` — **the missing removal gesture**: drops the
    `actorState` row *and* the presence row + releases that element's locks (the `deleteQuest`
    symmetric-lock precedent). This is what makes the additive plane honest: "an actor leaves the plane
    by a real gesture" (`merge.ts:88`) finally names a gesture that exists.
  - `presentCharacters` hand edits similarly collapse to `rpg.patchCastMember`/(presence ops) or stay
    image-shaped short-term (the client's `castPatch` image is built from the complete `cast`
    projection, so it is not currently defective — image-exit can trail).
- `applyLockedPatch` + `KEYED_ARRAYS` survive unchanged for the model path and clone-forward.
- Client: `volatile-patch.ts` dies (both its image builder and `emptyVolatile`); the four call sites
  (`rpg-status-tab.tsx:71`, `rpg-scene-tab.tsx:115`, `rpg-inventory-tab.tsx:184,191`,
  `rpg-character-detail.tsx:359`) become one-op mutates. **This supersedes the in-flight cast-edit-wipe
  lane's fix** — land that lane's fix now as the stopgap (it is correct), but its approach (rebuild the
  image from more projections) is the bandaid arm of this review's question and should not grow.
- Sizing: **M**. Contracts input + 2 new verbs + `applyHandEdit` op arm + 4 client call sites + mirror
  tests. No schema/db change, no baseline regen.

### Stage R2 — the NPC becomes an actor; presence becomes presence (dissolves the two-projection split)

- Contracts: the identity/standing fields (`name`, `emoji`, `mood`, `relationship`,
  `appearance`/`outfit`/`thoughts`, `characterId`) move from `rpgPresentCharacterSchema` onto the
  per-actor row (either widening `rpgActorVolatileSchema` or — cleaner — an `RpgActorEntry
  { actorRef, identity?, volatile }` shape where `identity` is present for `cast:` actors only;
  roster actors keep identity in the roster/sheet as today). `presentCharacters` slims to the presence
  plane: `{ key | actorRefKey }[]` — who stands in the scene, roster refs included (it already
  half-does this via `characterId`).
- The view: `castVolatile` and `castTrackers` **die**; `RpgTrackerView.actors` carries every actor
  (roster ∪ tracked cast), each with `presence: boolean`, one `RpgActorView` shape; `cast` becomes a
  thin presence echo. The Scene card, Status roster, Inventory tab, reminder (`actorLine`/`castLine`
  converge on the shared segs they already share via `volatileSegs`), and macro feed all read ONE
  shape — the §1.3 unread-plane class and the §1.4 phantom-carrier class both become unrepresentable
  (carrier kind derives from `actorRef.kind`, a partition of people, not rows).
- Model wire: **unchanged.** `presentUpsert`/`presentRemove` keep their arg shapes; the appliers
  re-target (upsert writes identity onto the actor row + adds presence; remove drops presence only).
  `establishScene.presentCast` unchanged. The per-call enum stops growing stale-forever once `dismiss`
  exists; consider capping the enum to present ∪ recently-tracked if growth ever measures as a real
  xgrammar/prompt cost (not needed day one).
- Departure/return semantics after R2: departure = presence drop, **everything retained** (guides,
  relationship, trackers, pack) — swipe-consistent, branch-correct; return = presence add, the whole
  NPC re-surfaces; the reminder can render a one-line "Known, offstage" roster for steering continuity
  (cheap, optional); the panel gets a "Known characters" disclosure derived from tracked cast rows —
  the offstage NPC is finally visible, editable (R1 ops), and dismissable.
- `rpg_npcs`/`{kind:"npc"}` stays the reserved cross-game doorway; **promotion** = the R4 doorway
  (mint card → stamp join → re-key, one keyed-plane rename op).
- Migration: pre-launch NO-LEGACY — contracts change clean, baseline squash into `0000_baseline.sql`
  (JSON-column shape only; the db columns don't move), dev-db wipe/reseed sanctioned (the db-remint
  precedent). The e2e support mirrors (`tests/e2e/support/trpc.ts` volatile/cast shapes) and the
  field-reachability suite re-key.
- Sizing: **L** (a lane): contracts + view + reminder/macro + appliers' target + 4 client tabs + suite
  re-keys + baseline squash. What dies: `castVolatile`, `castTrackers`, `castCarrier`, the
  presentCharacters guide fields, `volatile-patch.ts`, the wipe-lane's projection-union workaround.

### Stage R3 — hp demotion (§6, ruled) — rides R2's baseline squash

### Stage R4 — doorways (not this lane): promotion verb · `rpg_npcs` cross-game library · offstage

steering line polish

Recommended order: **R1 now** (defect-class kill, M, no schema), **R2+R3 as one lane** (one baseline
squash, one contracts re-shape, one suite re-key), R4 parked.

---

## 6. Q5 — HP demotion plan (RULED: hp joins the unified tracker system)

Owner testimony + visual receipt: the lived default is hp-absent —
`reports/snaps/untangle-status.png` (real freeform session, Nate + Niko, zero hp/pool rendering; the
only organic volatile is one condition "Very Drunk"). A d20-seeded def renders that exact screen, so
the demotion has **no default-UX regression surface**; the entire cost is plumbing. The unification's
own artifacts already predict the fold: `tracker.ts:94-99` designed the per-carrier `max` override
citing *"the d20 max-HP reality, which `hp` has always modelled this way"*, and `config.ts:195`'s
"hp … stay first-class, never trackers" line is the clause the ruling amends (wallet/inventory/
conditions stay first-class — they are lists with their own grammar, not labelled numbers; hp was the
only labelled number left outside the rule).

**Target shape:** `d20` profile SEEDS `{key:"hp", label:"HP", shape:"meter", write:"delta",
subject:"actor", appliesTo:"everyone", max:<profile default>, pinned:true}` at game mint (the D71
"new theme = a json" pattern: profile → seed defs); freeform seeds nothing (add-by-hand);
branch-and-save modes redefine or omit freely. Addressing: `trackerValues["hp"]`, per-carrier ceiling =
`RpgTrackerValue.max` through the ONE `trackerCeiling` resolver.

**Coupled sites, enumerated honestly:**

1. **Contracts:** `actor.ts:71` `hp` field removed from `rpgActorVolatileSchema` (+
   `newActorFor`/`emptyVolatile` shapes); `sheet.ts:21` `maxHp` **dies** — this also kills a live
   incoherence found this review: hp carries a **dual-max home** (`sheet.maxHp` + `volatile hp.max`)
   with no reconciler — the exact drift class the unification killed for pools (spec §5.2 "today's
   sheet/snapshot max duplication dies") surviving on the one exempt field. `views.ts:85`
   `RpgActorView.sheet.maxHp` follows.
2. **Extraction wire:** `tools.ts:93` `hpDelta` arm removed from `updatePartyArgsSchema` (+ its
   description prose); the structured schema follows by derivation (shared-plane proof); the projected
   grammar shrinks — hp writes ride the existing `trackerDeltas` vocabulary + the R6 per-actor key
   enums, which is a *stronger* gate than today's post-parse null-hp refusal (an actor not carrying hp
   is untypeable, not refused).
   **Semantic delta to accept knowingly:** today `hpDelta` on a null-hp actor REFUSES
   (`apply.ts:171-173` "set a max HP by hand"); a tracker delta on a carried-but-unset meter starts
   from 0 (`applyTrackerWrites`, `apply.ts:142-144`). Under the north star (steering, not simulation)
   delta-from-0 on a carried meter is acceptable — and `populateFromCharacter`/the d20 seed can born-set
   the value where it matters. Note it in the def's `hint` if the owner wants the old strictness back
   per-game (`locked` until set is also available).
3. **Appliers:** `apply.ts` `applyUpdateParty` hp arm + refusal die; the extraction fold's party-arm
   error lane simplifies.
4. **Reminder/delta:** `reminder.ts:239-241` named `HP value/max` seg dies (hp renders through
   `trackerSegs` like every meter — vocabulary line + reading, same grammar); `delta.ts:105-116` hp
   plane arm dies (the tracker delta line covers it).
5. **Panel:** Status card hp bar/editor → the ordinary tracker meter row (already built — the
   unification's click-to-edit rows); band: hp orbs ride `pinned:true` on the seeded def through the
   existing `trackerOrbs` path (`tracker-view.ts:110-127`) — the bespoke hp-orb arm, where one exists,
   dies; `agent-seed/index.ts:317` `PLAYER_MAX_HP` re-seeds as a def+value.
6. **Populate/resync:** `populate-from-character.ts` sheet default loses `maxHp`; the populate schema's
   sheet plane is unaffected (it never carried hp); a d20 populate can write the hp *value* through the
   ordinary tracker set arm if desired (follow-up, not required).
7. **Tests:** `tests/e2e/support/trpc.ts:597-601` volatile/sheet mirrors; `rpg-lite-loop.spec.ts` hp
   asserts re-key to `trackerValues.hp`; `field-reachability.suite.int.test.ts` hp leaves become
   seeded-def leaves; `merge/apply/flush/delta/reminder` unit tests re-key.
8. **Stored snapshots:** pre-launch NO-LEGACY — baseline squash (the sanctioned path; `0000` regen,
   never a `0001`), dev-db wipe/reseed or a one-time throwaway normalization script
   (`hp → trackerValues.hp`), never committed compat code.

Net: one exemption class closed, one dual-max drift home deleted, one bespoke wire arm deleted, health
becomes mode-forkable. **M-sized**, cheapest it will ever be, and it shares R2's baseline squash.

---

## 7. Findings index (severity-ranked)

1. **\[RESHAPE/MS-1] The hand-write contract is image-shaped over a projection-split plane** —
   `contracts/rpg/inputs.ts` (editSnapshot patch) + `client/src/features/rpg/lib/volatile-patch.ts:19-32`
   - `chat-ops/tracker-view.ts:174-181`. Failure class: all three of the day's defects + the latent
     stale-image clobber + the member-arm hazard (§2). Evidence: code trace + the three commits + zero
     client `castVolatile` consumers. Fix: §5 R1.
2. **\[RESHAPE/MS-2] NPC identity/presence fused, state split — departure destroys the standing half,
   retains the hard half invisibly and irremovably** — `contracts/rpg/snapshot.ts:78-99` +
   `tools/apply.ts:266-303,609-626` + `merge.ts:98` + `tracker-view.ts:174-181`. Failure: return =
   blank guides + silent neutral relationship (no beat) + intact pack; no dismiss gesture exists; the
   plane is grow-only (even resync can't shrink it) and every tracked cast key rides the targetRef enum
   forever. Fix: §5 R2 + `dismissActor`.
3. **\[CONFIRMED] Cast NPC hard state is host-invisible** — model-written hp/status/conditions/
   inventory/wallet on a `cast:` actor render in no client surface (`castVolatile` consumers: zero;
   Inventory tab roster-only `rpg-inventory-tab.tsx:184`; Scene card renders identity+trackers only).
   The reminder sees it; the human doesn't. Interim fix rides the in-flight lane/R2.
4. **\[CONFIRMED] npcs/party carrier classes partition rows, not people → read/write tracker drift on a
   scene-standing roster member** — `tracker-view.ts:176-181` vs `entry/compose/rpg.ts:373-407` (§1.4).
   A `trust(appliesTo:npcs)` def is taught on her cast line but unofferable (enforcing wire) or
   written-to-nowhere (loose wire). Dissolves under R2; a pre-R2 spot fix = skip `castCarrier` for cast
   rows whose `characterId`/name joins a roster actor.
5. **\[RULED→PLAN] hp's native privilege** — demotion plan §6; includes the live `sheet.maxHp` /
   `hp.max` dual-home incoherence (`sheet.ts:21` + `actor.ts:71`, no reconciler anywhere — swept).
6. **\[CONFIRMED, minor] "normalized" cast key is actually verbatim** — `actor.ts:9`/`snapshot.ts:78`
   doc claim vs `apply.ts:281,91`; case/spelling variance can mint sibling identities on non-enforcing
   wires; blocks rename; makes promotion re-key ugly. R2 should mint a real normalized key (slug) with
   display name separate — the unification's own key/label lesson (`tracker.ts:15-17`) applied to
   people.
7. **\[NO-ACTION] Q3 lock flag** — two-jobs-one-flag is real but currently defect-free; the R1 op
   contract retires the second job structurally (§3). Do not split now.
8. **\[NO-ACTION] `omissionRemoves` registry** — principled and correctly scoped for the model path;
   keep, including the contrast test (§2).

---

## 8. Verification log (what my silence covers)

**Read IN FULL this session:** `docs/architecture/core/AGENTS.md` · `.claude/agent-doctrine.md` ·
D-ledger rows D106–D120 (`Core-Path-Registry.md:270-330`, incl. D108/D109/D110/D111/D112/D113 whole) ·
`docs/design/tracked-field-unification.md` (owner spec, whole) · commits `b962df48`, `ad60f455`
(messages + full test diffs), `87d7ef10` (workboard dispatch) · `packages/server/src/domain/rpg/`:
`substrate/merge.ts`, `snapshot-edit.ts`, `substrate/reminder.ts`, `chat-ops/tracker-view.ts`,
`tools/apply.ts`, `verbs/edit-snapshot.ts`, `verbs/game/resync-from-story.ts`, `chat-ops/flush.ts`,
`staging.ts` (all whole) · `packages/contracts/src/rpg/`: `snapshot.ts`, `actor.ts`, `tracker.ts`,
`views.ts`, `extraction.ts` (whole) · `packages/client/src/features/rpg/lib/volatile-patch.ts` (whole) ·
`packages/client/src/features/rpg/components/rpg-scene-tab.tsx` (lines 1–160 + the cast-edit and
castPatch regions) · `entry/compose/rpg.ts:330-470` (the carrier/enum walk) · reference:
`rpg-companion-sillytavern` `src/utils/presentCharacters.js` (whole), `promptBuilder.js` (presence +
persistence regions), `state.js`/`persistence.js` (committed/swipe-store regions) · visual receipt
`reports/snaps/untangle-status.png`.

**Regions NOT read whole:** `substrate/delta.ts` (hp arm + structure only), `chat-ops/macro-view.ts`
(consumer list only), `persistence/snapshots.ts` (write-fn signatures via callers), the remaining rpg
client components (`rpg-status-tab`/`rpg-character-detail`/`rpg-inventory-tab` — targeted regions at
the `actorStatePatch`/cast-row call sites), `contracts/rpg/config.ts` (targeted: trackers home,
statProfile, the "never trackers" clause), `profile.ts` (targeted: d20/packaged profiles),
`verbs/game/populate-from-character.ts` (targeted regions). None of the report's claims rest on unread
regions.

**Sweeps performed (ast-grep v0.44 `ast-grep run` — the `/usr/bin/sg` shadow binary is not ast-grep on
this host; `/usr/bin/grep -a` for literals per doctrine):**

- `castVolatile` consumers: ast-grep pattern over `packages/client` in BOTH `-l ts` and `-l tsx` → zero;
  repo-wide literal grep → 5 files, all server/contracts (producer + reminder + macro-view + merge
  comment + views decl). The "client-unread" claim is a two-method absence check.
- `actorStatePatch` call sites: ast-grep `-l tsx` → 4 components (listed in §5 R1).
- `actorState` element-removal gestures: literal sweep over server domain for
  filter/remove/delete/splice near actorState → none outside comments; `writeResyncedSnapshot` callers
  read; resync merge path traced through `applyLockedPatch`.
- Promotion / hand cast-removal / client `presentRemove`: literal sweeps → zero hits each.
- `maxHp` readers: repo-wide sweep (13 hits, all enumerated in §6); no volatile↔sheet reconciler exists.
- `buildTrackerWriteGroups`/`castCarrier`/`rosterCarrier` call sites: swept; the compose dedup-by-name
  and the view's undeduped `castCarrier` both read in context.
- hp coupled sites: `hpDelta`/`hp`/`maxHp` sweeps over contracts/server/client/tests (results in §6).

**Tests/gates:** no code was changed by this review (review-only; report file is the sole write), so no
battery was run — whole-tree `pnpm check`/`pnpm test` are banned in lanes on the shared tree (doctrine,
owner ruling 2026-07-25), and both commits under review are merged with recorded green (b962df48: SPEC 1
live-green ×2 + 436/436 domain tests, red-first regressions; ad60f455: gate-neutering proofs recorded in
the commit). I verified the TESTS THEMSELVES are real (assert-the-real: both new regression tests drive
the actual verb against the seeded db and assert at `resolveSnapshotForTurn`; the e2e helper's
errors-as-data throw is a genuine hardening; the merge contrast test pins the non-additive planes).

**Unconfirmed suspicions (explicitly NOT findings):**

- A hand edit landing mid-turn (between a turn's commit and its flush) may interleave with the flush's
  bucket write in an order that drops or clobbers one side — the anchor/slot ordering across
  `postNarratorMessage` vs the in-flight turn's messageId was not traced to a verdict. Low priority
  (solo-lite composer is busy during a turn).
- Cast keys containing dots could in pathological name-pairs alias a lock path across actors
  (exact-match lookup covers the common cases); not constructed to a repro.
- Whether any live game data currently contains orphaned `cast:` actorState rows (the pre-R5 ghost
  class) — the dev db was re-minted 08-02, so likely moot.
