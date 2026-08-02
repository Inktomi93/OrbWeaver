# THE PERSONA MODEL — design review (actor-state grade)

```
kind: stickler design review
date: 2026-08-03 (session ran on the 08-02/08-03 boundary; HEAL merge 14c88995 is IN the reviewed tree)
charge: four owner threads, one design — (1) multi-human resolution (confirmed live defect),
        (2) persona-pin/anchor integration, (3) forced first-run persona creation w/ the dev/harness
        constraint, (4) SillyTavern first-run comparison + Traveler-clause verification.
ground truth: docs-are-law — the owner's worked examples in
        docs/architecture/history/FINAL-Persona-and-Immersive-Chat-Visuals.md PART A (§A.0–§A.4)
        and docs/architecture/core/Chat-Macro-Resolution.md are the authority; code is judged against them.
form: INVENTORY (receipted) → JUDGMENT → R-staged program with OWNER FORKS (recommendations marked ★).
constraint honored: persona is OWNER-SACRED (memory law persona-is-owner-sacred) — this review proposes,
        never changes behavior; every behavioral delta below is an owner fork or an owner-ruled item.
```

---

## 0. INVENTORY — the model as documented (the ground truth), receipted

### 0.1 The four pointers and three contexts (THE law)

`docs/architecture/history/FINAL-Persona-and-Immersive-Chat-Visuals.md` — PART A is explicitly marked
"a reference for how the shipped persona system works — do not rebuild it":

- **§A.0 (lines 28–41)** — four independent pointers: #1 Default (`seeds.defaultPersonaId`), #2 Current
  (`seeds.currentPersonaId`), #3 Chat persona (`chat_participants.activePersonaId`), #4 Anchor / "the pin"
  (`chats.anchorPersonaId`). Plus the per-message stamp `messages.personaId` (a consequence, not a control).
- **§A.1 (lines 43–71)** — THE CENTRAL LAW, three `{{user}}` contexts: **CARD → Anchor (#4)**;
  **PROMPT → Chat persona (#3)** ("who's *speaking right now*"); **HISTORY → the row's own stamp**.
  Also: "BOTH `{{user}}` AND `{{persona}}` ride the SAME routed persona object … card `{{persona}}`
  resolves the ANCHOR's *description* too — orb pins the whole persona object, not just a name.
  (PersonaPin only string-replaced `{{user}}`; base ST has no pin at all.)"
- **§A.2 (lines 73–85)** — the canonical worked example (Nate/Mary/Steve + the brown-hair corollary).
- **§A.3 (lines 87–92)** — the seed chain resolved ONCE at chat-open:
  `explicit ?? character-connected ?? Current ?? Default`.
- **§A.4 (lines 94–106)** — the traps, incl. "Anchor is orb's invention (from Nate's
  SillyTavern-PersonaPin) … do NOT simplify orb to match ST", and the both-personas rule
  (anchor ≠ active → BOTH descriptions inject, each macro-resolved against ITS OWN persona).

`docs/architecture/core/Chat-Macro-Resolution.md` — the resolution law: §0 storage-raw + volatile freeze;
§1 the **member-gated** name producer (`{id; name; description}` — "NOT the owner-scoped persona read …
a co-participant's persona *name* is not a secret", lines 45–58); §2 the shared atom (`resolveRowMacros`,
null-stamp → ANCHOR, never the viewer); §3 the five-context table — **prompt-config sections:
`{{user}}` = `ctx.activePersona` = the TRIGGERING human's persona** (line 98); §4 the three axes
(pinned = anchor ?? active, active = trigger-bound via `triggerPersonaId`, row stamp); §5 reattribution
as the only stamp writer; §6 the parity fixture (Nyx/Zara/Mara).

`docs/architecture/core/Spine-Identity-and-Auth.md` §"Persona — three axes, three homes" (lines 76–86):
active = `chat_participants.activePersonaId` "each human's lines render under their own persona
(**multi-human native**)"; anchor = `chats.anchorPersonaId`; attribution = the stamps. "There is NO
`chats.personaId` second home."

Ledger anchors: **D51 macro rider** (`Core-Path-Registry.md:122` — greeting/AI `{{user}}` → the ANCHOR,
never the viewer; active binds to the TRIGGERING human); **D18/D19** (host = role on ownerless chats;
`runAsUserId` = funding, `triggeredBy` = responsibility); **D62 placement ruling**
(`Core-Path-Registry.md:157` — "first-run persona ask lives in the landing hero (no dialog)");
**D70/client-architecture-lockdown.md:305** (later law — sanctions `FirstRunPersonaDialog` as one of the
four things that legitimately live on `app-root.tsx`); **D107** (`personaWizardSeen` DELETED — "the
first-run persona gate triggers on zero owned personas, never a 'seen' flag"); **PD-129**
(`docs/architecture/history/Core-Debt-Cleared-Ledger.md:122` — the default-persona seeder, boot + first
authed request, latch `onboarding.defaultPersonaSeeded`).

### 0.2 The code as built (receipts; every path below read in full or to its cited region)

**The resolver — the ONE foreign persona read** (`packages/server/src/entry/compose/chat.ts:980–1041`):
`resolveForeignInputs` builds `const principal = hostPrincipal(runAsUserId)` (:982 — a synthetic
`role:"user"` principal for the FROZEN HOST) and resolves BOTH persona arms through
`input.persona.get({ principal, personaId })` (:1001), catch → `null` (:1007–1009).
`persona.get` is **owner-scoped** (`domain/persona/verbs/get.ts:11–17` —
`loadOwnedPersonaWithAvatar(db, principal.userId, personaId)`, not-owned collapses to
`PersonaNotFoundError`). Anchor: :1011. Active: :1014
`loadPersona(triggerPersonaId ?? personaIds.at(0) ?? null)`.

**The callers** (`packages/server/src/domain/chat/verbs/turn.ts`) — every human-triggered path passes the
TRIGGERING member's persona: send :1231–1233 (`triggerPersonaId: personaId !== undefined ? personaId :
membership.activePersonaId`), force :1402–1403, swipe :1641–1642, continue :1705–1706, impersonate
:1824–1826, generate :1902–1903. The two no-live-human paths pass `triggerPersonaId: null` WITH the
comment "No live triggering human — `{{user}}` binds to the chat anchor, not a presence-order human":
deferred drain :2052–2054, auto turn :2246–2248. `Room.personaIds` = ONLINE present humans' active
personas (:222–226 — presence-gated, "presence gates which persona-book world-info joins the pool").

**Consumption**: `assembly/context.ts:392` `pinnedPersona: input.personas.anchor ?? input.personas.active`;
`:393` `activePersona: input.personas.active`. `assembly/macros.ts:67–100` `macroOptionsFor` —
`user: persona?.name ?? "User"`, `persona: persona?.description ?? ""` (the null floor is the literal
string "User"/empty — NOT the anchor). Section routing (`assembly/assemble.ts`): card-derived →
`pinnedPersona` (:125 `renderMemberField`, :334 `char_description`, :347 `char_personality`,
:351 `dialogue_examples`; depth notes `context.ts:651`); prompt-config/literal/guided/nudges →
`activePersona` (:239, :313, :375; `macros.ts:222, :242, :306`); the `persona` marker → **ACTIVE**
(:353–358, gated on `personaMarkerActive` — single-placement rule); WI per entry-source
(`context.ts:200` — `character` → pinned, else active). Both-personas machinery:
`context.ts:554–625` (`activePersonaDepthCandidate` + `anchorPersonaCardCandidate` +
`sameProjectedPersona` dedup; the anchor block only on a real swap).

**The anchor verb** (`domain/chat/verbs/chat-lifecycle.ts:138–152`): `setChatAnchorPersona` — host-only;
a non-null target must be owned by **any present human participant** (`verifyPersonaOwned` against each
present human, :141–147); null clears. **Ruled (HEAL lane fork, orchestrator): the verb's permission
surface STAYS — the RESOLVER is the widening point.** This design owns specifying that widening.

**The seed chain** (`domain/chat/verbs/start-chat.ts:369–375`): `explicit ?? resolveConnectedPersona ??
resolveCurrentPersona ?? resolveDefaultPersona` — matches §A.3 rung-for-rung (each compose resolver at
`compose/chat.ts:804–849`). Founding host row gets `activePersonaId: anchor` (:388) — anchor == host's
chat persona at open.

**HEAL (merged, `14c88995` / `1d8c1a68`)**: handoff + fork now conditionally NULL a foreign
`anchorPersonaId` in the atomic swap batch when the incoming host can't read it (`verifyPersonaOwned`);
re-pin was rejected because `anchor == active` must dedup (`sameProjectedPersona`); "personas are
owner-sacred — this heals the POINTER, never copies a persona"; audit metadata records
`healedAnchorPersona`. fork twin: `verbs/fork.ts` `resolveForkAnchorPersonaId`.

**The behavioral contract** (`tests/server/domain/chat/persona-resolution.suite.int.test.ts`, 295 lines):
the four §A.2 worked examples run end-to-end through the REAL renderer, card-`{{persona}}`→anchor, canon
freeze. **Every fixture is single-human, host-owned, and injects `personas` DIRECTLY into
`buildAssembleContext`** (`inputOf(...)` :90–109) — the resolution layer (`resolveForeignInputs`) is
bypassed by construction.

**First-run machinery**: seeder `entry/boot/seed-default-persona.ts` — the authored default persona
**"Traveler"** (:25–31, owner-ruled copy with the renaming-is-safe-by-latch note), idempotent via
`onboarding.defaultPersonaSeeded`, `ensureSeeded` never throws. Two trigger sites: owner at boot
(`entry/lifecycle.ts:196`) and EVERY user's first authed request (`entry/lifecycle.ts:342–347` →
`app.ts:120/:179` `seedUserCharacters` per-request hook, which also fires `personaSeeder.ensureSeeded`).
Dialog `client/src/features/persona/anchors/first-run-persona-dialog.tsx` — forced-open (inert
`onOpenChange`), trigger = viewer owns ZERO personas (:33), creates + seeds both global pointers; mounted
on `app-root.tsx` (D70-sanctioned). **Dead by construction**: the seeder pre-creates Traveler on the very
first authed request, so `personas.length > 0` before the dialog can ever hold. Harness discriminator:
`env.E2E_HARNESS` (`foundation/env/index.ts:125`, enum on/off, default off; surfaced as the healthz
self-stamp `app.ts:219`).

**The Traveler clause — VERIFIED template-homed** (charge 4's verification ask):
`packages/contracts/src/preset/index.ts:930–932` — `DEFAULT_MARKER_TEMPLATES.main_prompt` ends with
"Address `{{user}}` in the second person; use their name only when it is one they have chosen for
themselves." The comment block :913–929 records BOTH owner rulings: the starter framing lives on the
marker DEFAULT (not a stored `template` — side-eye F-03, 2026-08-02) and the ADDRESS clause is
deliberately CONDITIONAL, homed HERE and not in a PROSE-1 slot (the only identity-framing prose slot
`chat.assembly.anchorIdentity` fires solely on a swap; PROSE-1's census row 52 leaves this template
un-slotted because the per-section `template` override IS its edit path). The word "Traveler" itself
appears only in the seeder (correct — the clause is name-agnostic by design).

**The "odd macro" the owner half-remembers — FOUND, and it is already law**: card-context `{{persona}}`
resolves the **ANCHOR persona's whole DESCRIPTION** (not just the `{{user}}` name swap his old ST
PersonaPin extension did). Receipts: FINAL §A.1:62–65 ("orb pins the whole persona object, not just a
name — PersonaPin only string-replaced `{{user}}`"); kit `macro/registry.ts:129–130` + `:509`
(`persona` → `ctx.persona`, `requires:"char"`); `assembly/macros.ts:74` (`persona:
persona?.description`); `assemble.ts:125` (card fields render against `pinnedPersona`); pinned by the
suite ("CARD `{{persona}}` resolves the ANCHOR's description, never the active speaker's", suite
:230–245). The owner's other recalled control — "the host gets the CONTROL to change the anchor" — is
`setChatAnchorPersona` (host-only, any present human's persona permitted). His memory-note's "VERIFY
that claim" (persona-pin-prompt-resolution): the claim is TRUE at the verb and FALSE at the resolver —
which is exactly finding F2 below.

**The member-visibility precedent that anchors the widening**:
`domain/chat/persistence/macro-names.ts` — `loadChatMacroNameProducer` (:62–79) selects persona
`{id, name, description}` for every id the chat references **with NO owner filter** (membership gates
upstream); header law: "Names only … a co-participant's persona/character name is not a further secret
to gate." AND the persona-book world-info arm already feeds **member-persona-scoped lore into the shared
prompt**: `assembly/world-info/pool.ts:108–114` loads `personaBooks` by `inArray(personaId, personaIds)`
(the present ONLINE humans' active personas, pool.ts:22) with no owner filter on that arm (ownership is
write-gated at attach). So today the room already consumes a member persona's ATTACHED LORE while
refusing to resolve the same persona's NAME. The asymmetry is accidental, not designed.

**Client surfaces** (`features/persona/`, all files enumerated; key reads):
`persona-this-chat-section.tsx` — "Playing as" (self-scoped `setActivePersona`), the read-only anchor row
("Card sees you as …"), host Re-pin menu, Restamp (client-assembled `REATTRIBUTE_WINDOW = 100`);
`use-chat-persona.ts` (all three busDriven); `use-persona-identity.ts` (seed pointer patch);
`persona-chrome.tsx` (D74 Identity widget); `lib/persona-description-macros.ts`; the settings surface
(showNotifications + restore). `persona.setActivePersona` verb (`domain/persona/verbs/set-active.ts`):
host-or-self via injected `requireChatAuthorOrHost`; **a non-null persona must be owned by the TARGET,
never the principal** — a host can re-target but never assign their own persona onto someone else.

---

## 1. JUDGMENT — findings, each reconciled against the documented examples

### F1 — CONFIRMED (the charge's live defect): multi-human PROMPT-`{{user}}` resolution is silently dead for non-host members. The code contradicts §A.1, the authority.

Chain, fully evidenced this session: a non-host member sends → `turn.ts:1233` passes THEIR
`membership.activePersonaId` as `triggerPersonaId` → `compose/chat.ts:1001` resolves it via
`persona.get` under `hostPrincipal(runAsUserId)` (:982 — the HOST) → `verbs/get.ts:12` owner-scoped
lookup finds nothing → `PersonaNotFoundError` → caught (:1007) → `active = null` →
`macroOptionsFor` (:73–74) renders PROMPT `{{user}}` as the literal `"User"` and `{{persona}}` as `""`;
the `persona` marker is skipped entirely (`assemble.ts:356`); the rpg steeringNote's `{{user}}`
(`turn.ts:509` `foreign.personas.active?.name`) goes undefined; guided actions and nudges
(`macros.ts:222/:242`) address "User". The member's OWN turn — the exact context §A.1 defines as
"who's speaking right now" and Chat-Macro-Resolution §3 pins as "the TRIGGERING human's persona" —
resolves to the kit floor. Docs-are-law: **FINAL §A.1 + Spine-Identity "multi-human native" are violated
by the resolver, not by the model.** Consequence class: silent identity corruption of the shared prompt
in every multi-human room (the feature the D16/D18 spine exists for). The comment at compose:989
("active = the speaking participant's persona") believes it works; the closure's own multi-human intent
never survived the single-principal read.

Corroboration: HEAL's lane confirmation (workboard :58–61 "MULTI-HUMAN ACTIVE-PERSONA IS SILENTLY DEAD
for non-host members (single-principal resolveForeignInputs)"), and the handoff review
(`docs/reviews/stickler/2026-08-03-handoff-card-ownership.md:182–197`).

### F2 — CONFIRMED: the anchor verb/resolver mismatch is still live on the DIRECT verb path (post-HEAL).

HEAL healed handoff and fork. But `setChatAnchorPersona` (chat-lifecycle.ts:141–147) still permits —
by ruled design — pinning **any present human's** persona, and the resolver still nulls a member-owned
anchor through the same owner-scoped read (compose:1011 → :1001). A host exercising the exact control
the owner described ("the host gets the CONTROL to change the anchor persona") gets a dead pin TODAY:
`anchor = null` → `pinnedPersona = anchor ?? active` falls to the speaker → card `{{user}}` drifts
per-turn — the precise POV drift §A.2 exists to prevent, now reachable through a sanctioned verb rather
than a handoff accident. The ruling stands (verb stays; resolver is the widening point) — so F2 is not a
verb bug, it is the OTHER HALF of F1's widening: the design below must make the resolver honor everything
the verb permits, or the verb's permission is a lie the UI faithfully repeats.

### F3 — CONFIRMED: the no-trigger (drain/auto) arm's comments claim anchor-binding; the resolver does something else.

`turn.ts:2053–2054` and `:2247–2248` pass `triggerPersonaId: null` with "`{{user}}` binds to the chat
anchor, not a presence-order human." The resolver (`compose:1014`) coalesces that explicit null with
`??` into `personaIds.at(0)` — the presence-order-arbitrary first ONLINE human — and only then to null,
where `macroOptionsFor:73` floors to `"User"`, **never the anchor**. So on a deferred drain / automation
turn: with another human online, PROMPT `{{user}}` = that arbitrary human; with nobody online, `"User"` —
in both cases not the anchor the caller documents. The contract type
(`contract/foreign.ts:113` `PersonaId | null | undefined`) already spells three states; the
implementation collapses two of them, and `foreign.ts:103–105` documents the `personaIds[0]` fallback as
"only when the trigger has no persona" — a THIRD meaning. Three semantics, one null. (The
turn-identity biome-ignore comments at `turn.ts:1232/:1255` show the codebase already knows this
explicit-null-vs-undefined distinction matters — it just wasn't carried into the resolver.)

### F4 — CONFIRMED (test reality): the resolution layer has NO behavioral contract.

The owner-sacred suite (persona-resolution.suite.int.test.ts) pins ASSEMBLY semantics given
already-resolved personas — every fixture single-human, `personas` injected directly (:90–109 `inputOf`).
`resolveForeignInputs` — the layer where F1/F2/F3 live — is exercised only by compose tests under the
host's own personas. That is WHY a defect this central survived: the contract protects the model's
precedence, not its reach. Any widening must land red-first with multi-human suite arms (see R1).

### F5 — CONFIRMED: `FirstRunPersonaDialog` is dead by construction; the owner's new ruling reshapes the seeder/dialog relationship, under the dev/harness constraint.

The dialog's trigger (zero owned personas) can never hold: the per-request hook (`app.ts:179` →
`lifecycle.ts:346`) seeds Traveler on the first authed request, before or concurrent with the client's
first `persona.list`. (Residual today: a transient dialog FLASH is possible if `persona.list` returns
`[]` while the seed is in flight — the seeder is fire-and-forget `void`.) Owner rulings on file:
persona creation is FORCED at real first sign-in (workboard :107–112), and the force MUST NOT fire on
dev regens / test harnesses (workboard :116–121 — "every stack re-mint + E2E boot would prompt; the
seeder likely keeps auto-creating under harness/dev and the force applies only outside"). Ledger
tension to resolve in ceremony: D62 ruled "landing hero (no dialog)" (2026-07-05); the later D70
lockdown doc sanctions the dialog on `app-root.tsx` (2026-07-15); the owner's 08-03 ruling implies a
forced modal-or-hero at real first sign-in — whichever shape ships needs the D62 rider. Note the seeder
has TWO trigger sites (owner-at-boot `lifecycle.ts:196` AND per-user first request) — the force must
gate BOTH, or the deployment owner (a real first sign-in too) never sees it.

### F6 — CONFIRMED (client seams the widening must fix):

- `persona-this-chat-section.tsx` `personaLabel(personas, chat.anchorPersonaId)` resolves the anchor
  name against the **viewer's own** `persona.list` — a member viewing a host-pinned anchor (or any
  cross-owner anchor) renders "Unknown persona", though the member-gated macro-names producer already
  ships the correct name on the chat read.
- The host Re-pin menu lists only the **host's own** personas — the verb permits any present human's
  (the owner's described control); the UI can't express it.
- No "Clear pin" affordance (the verb accepts `personaId: null`; the menu only mutates with `p.id`).

### F7 — Memory-law drift (for the orchestrator's memory store, not a code defect): the
`persona-pin-prompt-resolution` memory claims the preset's `persona` marker "renders the anchor's
description". The code renders it against **ACTIVE** (`assemble.ts:353–358`), matching FINAL §A.6's
placement rule (`in_prompt → {{persona}}` as the active persona's description slot) and neo-tavern's
persona-pin test ("the persona marker to the ACTIVE one",
`~/inktomi-stack/development/neo-tavern/tests/integration/persona-pin.test.ts:21`). The anchor's
description reaches the prompt through the FRAMED card-context block instead
(`anchorPersonaCardCandidate`, context.ts:577–596). The memory should be corrected before it misleads a
future pass.

### Coherence verdict on everything else — CLEAN, with receipts.

The pin model itself is coherent and doc-faithful end-to-end for the single-human case: seed chain
(start-chat :369–375 == §A.3), three-context routing (assemble.ts == §A.1), both-personas + dedup
(context.ts:554–625 == §A.4), history stamps + anchor fallback (macros.ts:162–175 == Chat-Macro-Resolution
§2/ruling A), canon freeze (suite :248–295), reattribution as sole re-stamper, HEAL's
heal-the-pointer-never-copy posture, `setActivePersona`'s owned-by-target rule, and the owner-sacred
suite green against all of it. **The defect class is exactly one thing: a multi-human model resolved
through a single-principal keyhole.** Nothing in the model needs reshaping; the RESOLUTION REACH does.

---

## 2. THE WIDENING DESIGN — the `persona.getForRoom`-class question (charge 1's shape to judge)

### The principle (written as input to the CERD permissions-model page, three-layer voice)

**The persona layer of the permissions model:** a persona is a single-owned library entity (D23 KEEP —
`personas.ownerId` is the partition key). Playing it in a room — holding it as your
`chat_participants.activePersonaId`, or having it host-pinned as `chats.anchorPersonaId` — is CONSENT to
the room consuming its *presentation surface*: name, description, and placement preference, into the
shared assembly and every member's display. This is not new law; it is the already-shipped
macro-names/persona-book posture (Chat-Macro-Resolution §1: member-gated `{id,name,description}`;
pool.ts's persona-book lore already entering the shared prompt) stated as a rule. The gate is the persona
OWNER's **present membership** (leftSeq null) in the room — never the reader's identity (the prompt is
the room's, D106), and never a copy (personas are owner-sacred; HEAL's heal-the-pointer precedent).
The host holds the anchor control (`setChatAnchorPersona`, host-only, present-member-owned targets);
each human holds their own active pointer (`setActivePersona`, host-or-self, owned-by-target). What is
NOT consented: the persona row itself (avatarAssetId, metadata beyond placement, edit/duplicate/export
stay owner-only — `PersonaService` is untouched).

### FORK 1 — the resolution seam (owner pick; ★ = recommended)

- **★ (a) A persona-domain principal-less factory op** — `resolvePersonasForRoster` (getForRoom-class):
  `(personaIds, allowedOwnerIds) → Map<PersonaId, {name, description, metadata}>`, a compose-built
  injected op (the "Principal-less ops = standalone factories" pattern; the op signature CARRIES the
  owner set per the injected-op caller-gate law — dropping it would be the cross-tenant hole).
  Chat supplies the room's **present human userIds** as a new `ResolveForeignInputsOp` key (it already
  supplies `personaIds`; note the anchor's owner may be present-but-OFFLINE, so the set is
  present-members, not the online-filtered `personaIds` source). `resolveForeignInputs` loads anchor +
  active through it; a persona whose owner is not in the set resolves null — which keeps HEAL's
  semantics for free (a departed member's persona stops resolving; anchor falls to active exactly as the
  heal chose). One home for the persona read stays in the persona domain; membership stays chat's.
- (b) Compose-local scoped query (`personas WHERE id = ? AND ownerId IN (…)` inside
  `resolveForeignInputs`) — cheapest; compose already raw-reads `personas`
  (`resolveUserPublics` :734–746, `verifyPersonaOwned` :851–854) so it isn't unprecedented, but it
  re-homes a persona READ POLICY into entry and leaves `persona.get`'s "one owned read" story with an
  unmarked sibling. Acceptable fallback if the owner wants zero new domain surface.
- (c) Per-member real-principal resolution (`resolveHostPrincipal(ownerId)` per persona) — REJECT:
  impersonation-shaped, N settings-tier principal reads per turn, and semantically wrong — the assembly
  read is a ROOM-plane read under host authority (D106), gated by the persona-owner's membership, not a
  stack of per-member identities.

### FORK 2 — do member personas' DESCRIPTIONS enter the shared prompt? (★ YES)

Post-widening, a member-triggered turn injects THEIR persona description
(`activePersonaDepthCandidate`), and a member-owned anchor injects via the card-context block
(`anchorPersonaCardCandidate`). Recommended YES, unconditionally: it IS the feature (§A.1 — the prompt
context is the speaker's), the room already consumes member persona-book lore through the same
assembly, and D53's non-host regex ban is a different class (executable shared-prompt TRANSFORMS, not
authored identity content). The host's moderation levers already exist: kick, the host arm of
`setActivePersona`, and the anchor pin. If the owner wants a dial anyway, the D22
`memberCardVisibility` pattern is the shape — but I recommend against minting a knob nobody asked for.

### FORK 3 — no-trigger turns (drain/auto): what does PROMPT `{{user}}` bind to? (★ the ANCHOR)

Implement the three-state contract the type already spells: `undefined` = trigger unknown → today's
fallback chain; `null` = deliberately no triggering human → bind active to the ANCHOR (turn.ts's own
comments at :2054/:2248 are the spec; the anchor is the chat-invariant identity, D51 rider). This is
the smallest behavioral delta in the program and is currently a comment-vs-code lie either way — one of
the two must change; changing the comment instead (ratifying "first online human") is the non-★ arm.

### FORK 4 — first-run shape + the dev/harness discriminator (charges 3+4)

**ST comparison (charge 4).** No SillyTavern checkout exists in the development folder (neo-tavern is
Nate's own prior app — its persona-pin is the orb anchor's ancestor, and its `persona` marker already
resolved ACTIVE). From training knowledge (flagged as such, not a repo receipt): ST's first-run persona
UX is a forced **name-only** ask — the "What's your name?" popup on a fresh install renames the default
persona, which ships as the literal **"User"** with an empty description; persona management (default
star, per-character/chat locks) is a separate panel discovered later; ST's default main prompt ("Write
{{char}}'s next reply in a fictional chat between {{char}} and {{user}}") carries **no address clause at
all** — ST simply lives with models producing vocative "User". Verdict: orb's dialog shape (name
required, description optional) already matches ST's proven low-friction pattern, and the Traveler
clause is strictly BETTER than ST's wording (ST has nothing in the slot; orb's conditional clause was
owner-ruled 2026-08-02 and is verified template-homed). **Recommend: no wording adoption from ST; keep
the clause exactly as homed.** The clause also stays load-bearing post-redesign — it covers the
harness/dev-seeded Traveler AND any imported/unnamed persona, not just first-run.

**The redesign (★ recommended shape):**
1. The seeder's auto-create arm becomes conditional: auto-create Traveler **only when the stack is a
   harness/dev stack**; on a real stack, `ensureSeeded` records nothing and creates nothing — the
   zero-personas trigger (D107's ruled trigger) then genuinely holds and the forced dialog fires.
   Both trigger sites (boot-owner `lifecycle.ts:196` + first-request hook) route through the same
   seeder, so ONE conditional inside `createDefaultPersonaSeeder`'s deps covers both.
2. Discriminator: `E2E_HARNESS === "on"` covers the e2e harness by existing stamp. The DEV stack needs
   an explicit second arm — recommend a dedicated env (e.g. `DEV_SEED=on`, set by the dev-stack
   automation that already pins env per the dev-stack memory law), NOT `NODE_ENV` inference (this repo's
   env law is explicit natures, D107's knob discipline). The persisted `onboarding.defaultPersonaSeeded`
   latch keeps its exact role (idempotence + deletion-respect) — on a dev DB regen the latch is gone but
   `DEV_SEED=on` re-seeds silently; on a real stack the latch is irrelevant until the user creates.
3. The dialog stays the force surface (D70-sanctioned home on `app-root.tsx`, forced-open shape already
   built and correct: no close affordance, seeds both global pointers on create). Fix the in-flight
   flash residue by construction: on a real stack there is no racing seeder, so the flash class dies
   with the redesign. Owner fork (non-★): move the ask into the landing hero per D62's original ruling —
   more work, weaker force (a hero ask is skippable by navigation unless re-gated everywhere);
   whichever arm ships, the ceremony D-entry carries the D62 amendment rider.
4. Wording pass (owner asked): keep dialog copy; one improvement worth taking from the ST pattern —
   the dialog's description field could ghost the Traveler description as `placeholder` (the
   guided-actions ghosting idiom) so "what goes here" teaches itself. Owner's call, cosmetic.

### FORK 5 — explicitly OUT OF SCOPE (parked by the owner, restated so nobody re-opens it here)

rpg-lite persona↔character linkage (models A/B/C, per the persona-pin memory: owner "need to think
about this one", re-parked 2026-07-31 wanting a design pass that handles anchor-vs-active, host-chosen
`{{user}}`, and per-persona game-state retention). This program must not foreclose model C
(character = anchor persona): the widening keeps the anchor a first-class resolvable identity in
multi-human rooms, which C needs — nothing below narrows it. Composition with the approved
handoff-copy-arm program: an anchor nulled at handoff falls to the new host's active persona
(HEAL's chosen semantics) and the copy arm copies cards/books, never personas — no interaction.

---

## 3. THE R-PROGRAM (staged; each stage independently shippable, owner forks called at their stage)

- **R0 — the three-state trigger contract (F3; FORK 3).** Resolver honors explicit-null →
  active := anchor; undefined keeps today's chain. Fix the `compose/chat.ts:1014` `??` conflation;
  update `foreign.ts` op-doc. Red-first: a drain/auto fixture with an online non-host human asserting
  PROMPT `{{user}}` = the anchor name, failing today. Smallest possible slice; behavioral —
  owner-gated via FORK 3's ★.
- **R1 — the widening (F1+F2; FORK 1+2).** The `resolvePersonasForRoster` persona-domain factory op
  (FORK 1★); `ResolveForeignInputsOp` gains `presentHumanUserIds`; anchor + active both resolve
  through it; HEAL semantics preserved by construction (owner-left ⇒ null ⇒ anchor-falls-to-active).
  Red-first multi-human arms ADDED to the owner-sacred suite (never editing existing arms —
  persona-is-owner-sacred): (i) non-host trigger's PROMPT `{{user}}` = their persona; (ii) member-owned
  anchor actually pins card `{{user}}`/`{{persona}}`; (iii) a kicked/left member's persona stops
  resolving; (iv) the §A.2 worked examples re-run with anchor and active owned by DIFFERENT humans.
  Also covers: steerIdentity (turn.ts:509), guided/nudge/`persona`-marker arms — all downstream of
  `personas.active`, no per-site changes needed.
- **R2 — client seams (F6).** Anchor label reads the macro-names producer (already on the chat read),
  not the viewer's list; host Re-pin menu offers present members' personas (grouped by member — the
  owner's described control becomes expressible) + a Clear-pin item; member view of "Card sees you
  as …" renders the real name. No new verbs — surfaces catch up to the verb.
- **R3 — first-run (F5; FORK 4).** Seeder conditional on `E2E_HARNESS`/`DEV_SEED`; forced dialog on
  real first sign-in for every user incl. the owner; latch semantics unchanged; owner wording pass on
  the dialog copy; NO change to the Traveler clause (verified in place). Tests: seeder int test gains
  the real-stack arm (no auto-create, dialog trigger holds); harness boot re-verified (the e2e stack
  must keep auto-seeding or every spec re-minting a stack would hit the dialog — the constraint's
  whole point).
- **R4 — ceremony.** One D-entry minting the multi-human persona-resolution model: the
  membership-consent rule (the CERD paragraph above, verbatim input to the permissions-model page),
  the resolver-widening + verb-stays ruling, the anchor no-trigger binding, the D62 first-run rider,
  and the FORK dispositions. Orchestrator memory corrections: the F7 persona-marker drift in
  `persona-pin-prompt-resolution`; the "host anchor control" claim now VERIFIED-with-cites.

Sequencing note: R0 folds into R1 cleanly if dispatched as one lane (same resolver function); R2/R3
are independent of each other and of R0/R1. R1 is the one that must be persona-suite-red-first and
carries the owner-sacred constraint in its brief verbatim.

---

## 4. VERIFIED CLEAN (what my silence covers)

- **Docs sweep**: 123 persona-mentioning files enumerated (`grep -rln persona docs/`); read in full:
  FINAL-Persona PART A–D, Chat-Macro-Resolution.md, Spine-Identity-and-Auth.md,
  Core-Laws-and-Precedents.md, Core-Path-Registry.md (all persona-relevant entries: D16–D23, D51, D60,
  D62, D64, D66, D70, D74, D86, D106–D112 headline lines), Core-0 §6 partitioning table + full doc,
  agent-doctrine, AGENTS constitution, PD-129 (Debt-Cleared :122), the D62-vs-D70 first-run pair,
  D107's personaWizardSeen deletion, workboard persona/HEAL/FIRSTRUN sections, the handoff stickler
  review's F2/§ receipts.
- **Persona domain read WHOLE** (all 31 files under `domain/persona/` incl. front door, contract/,
  persistence, substrate, every verb) + `contracts/persona` whole + the client `features/persona`
  feature (all 18 files enumerated; read: dialog, this-chat-section, both chat/identity hooks; skimmed
  by role: editor/panel-row/chrome/surfaces/lib). Consistent with the docs: every persona verb
  owner-scoped; `setActivePersona` owned-by-target; no second `chats.personaId` home; metadata
  narrowing single-seamed.
- **Chat-side**: compose/chat.ts read WHOLE (1078 lines); turn.ts all 8 `resolveForeignInputs`-feeding
  call sites + loadRoom + buildTurnContext read; chat-lifecycle.ts WHOLE; start-chat.ts seed-chain +
  founding batch; foreign.ts WHOLE; assembly macros.ts WHOLE; assemble.ts marker-routing + member-field
  regions; context.ts persona-candidate + WI regions; macro-names.ts WHOLE; world-info/pool.ts persona
  arm. Regions NOT read: turn.ts outside the cited spans (~60% of its 2312 lines — engine/round
  plumbing with no persona surface per grep sweep of `persona` hits), assemble.ts budget/trace guts,
  the rpg domain beyond its chat-ops seam.
- **Suites read**: persona-resolution.suite.int.test.ts WHOLE; HEAL's commit (`1d8c1a68`) diff + its
  four test files' stat; merge-state verified (`git merge-base --is-ancestor 14c88995 HEAD` → merged).
- **Charge-4 verification**: the ADDRESS clause is template-homed at
  `contracts/preset/index.ts:930–932` with the owner-ruling comment — CONFIRMED; "Traveler" the string
  correctly appears nowhere in templates (seeder-only).
- **Not run**: `pnpm check`/`pnpm test` (design review, zero tree mutations; the tree carried a
  known-hot verify:push in flight per the workboard — re-running the battery from this seat would be
  contention, and no code claim here depends on a gate verdict).

## 5. Unconfirmed / low-priority (explicitly NOT findings)

- Whether any OTHER member-owned persona path beyond anchor/active hits the owner-scoped-read class
  (the handoff review's own open question, its :335). I swept the compose persona reads:
  `resolveUserPublics` scopes by the persona's own owner (correct); `verifyPersonaOwned` is the check
  itself; macro-names/roster-avatars are membership-class (correct); world-info persona-books load
  unscoped-by-owner (write-gated at attach — appears correct, not fully traced through the attach
  verbs). Nothing else found; not exhaustively proven across all 28 domains.
- The first-authed-request dialog FLASH (seed in flight while `persona.list` returns `[]`) — reasoned
  from the fire-and-forget `void` at lifecycle.ts:346, not reproduced live; dies with R3 regardless.
- ST first-run details are training-knowledge, not repo receipts (no ST checkout exists to verify
  against; D49 forbids a cold re-audit and the owner's ask was comparative, answered at that grade).
