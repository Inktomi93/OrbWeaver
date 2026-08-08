# `{{note}}` — original intent & classification archaeology

**Status:** INVESTIGATION ONLY. No fix recommended. The owner rules once he has the intent.
**Question:** `{{note}}` is a silent-total-payload-LOSS carrier structurally identical to `wiFormat`'s
`{{entry}}` — yet `{{entry}}` is a hard write-refusal (`FORMAT_STRING_CARRIER_TOKENS`, owner ruling
2026-08-02) while `{{note}}` is warn-never-block. What was `{{note}}` originally meant to do, why was
warn-never-block chosen, and is the divergence from `{{entry}}` a deliberate design distinction or a
stale-classification oversight?

**One-line answer:** `{{note}}` was load-bearing from birth (it carries the injection's ENTIRE payload,
never cosmetic). Warn-never-block was NOT a considered "note-loss is acceptable" decision — it was a
**mechanical inheritance** of the `{{input}}`/`requiredMacros` precedent applied uniformly to every
pre-substitution token in one commit (S1b, 2026-08-01), under §6's blanket "required-macro lints, never
blocks" philosophy. The `{{entry}}` carrier-block ruling one day later (2026-08-02) drew the line
"format-string carriers block / PROSE-1 `requiredMacros` stay a lint" — a line that was clean at the
time **because the note frames were still prose slots, not format strings**. The 2026-08-07 re-home
moved the note frames into the SAME Templates tab as `wiFormat` and re-badged them `kind:"format"`, but
touched **nothing** about the write-refusal classification. The divergence is therefore best read as a
**stale classification the re-home never re-examined** — with the important caveat that two code
comments written at/after the re-home *assert* the distinction is deliberate, while giving a
distinguishing rationale that is factually FALSE for `{{note}}`. See §4 for that fork.

---

## 1. The token's job — what a note DOES

`{{note}}` is the caller-supplied PRE-SUBSTITUTION payload of the two injection-frame slots. It is the
injection's own content — never cosmetic, never voice guidance.

- **Definition (slot table):** `packages/contracts/src/chat/prose.ts:257-282`
  - `chat.injection.systemNote` — `text: "[Note from system: {{note}}]"`, `requiredMacros: ["{{note}}"]`
    (`:263-265`). Fires on "Any system-role injection the model can't deliver as a real system row
    (the `TURNS_FLOOR` default)" (`:268`) — i.e. the DEFAULT for most models.
  - `chat.injection.userNote` — `text: "[Note from user: {{note}}]"`, `requiredMacros: ["{{note}}"]`
    (`:276-278`). Fires on "Every user-role injection — author's note, host steering, a prefix-adjacent
    re-framed injection" (`:281`).
  - Header, `:33-39`: "`{{note}}` = the injection's own content … dropping `{{note}}` drops the
    injection's whole payload."

- **Resolution + consumption:** `packages/server/src/domain/chat/assembly/injections.ts`
  - `frameInjection` (`:51-60`) calls
    `resolveProseText("chat.injection.systemNote" | "chat.injection.userNote", prose, { note: trimmed })`
    where `trimmed` is the injection's macro-resolved content.
  - Both the BUILD render (`renderInjection`, `:35-37`) and the SHAPE splice
    (`spliceInChatInjections`, `:195`) route through this one `frameInjection`.

- **The purpose of the FRAME:** the demoted-system frame is "the demotion's honesty — the reader sees it
  is a system note" (`chat/prose.ts:261-262`); the user frame "keeps the model from reading it as
  dialogue" (`:275`). A system-authority injection the resolved model can't take as a real system row
  demotes to a USER wire row wearing `[Note from system: …]` (`injections.ts:80-97`, `:106-121`). This is
  the default path (`TURNS_FLOOR`), so these frames carry real host/author steering on ordinary turns.

- **What the payload is:** author's note, host steering, a prefix-adjacent re-framed injection, and every
  demoted system instruction. Load-bearing operator/authoring content.

- **What happens if the token is absent/unresolved (the LOSS mechanism — SOURCE-PINNED):**
  `spliceProseTokens` (`packages/contracts/src/prose-slot/index.ts:299-308`) does
  `out.replace(tokenRe(name), () => value)`. If the resolved frame text contains **no** `{{note}}`, the
  replace matches nothing and returns the frame **verbatim** — the injection content (`trimmed`) is
  **never placed**. The wire then carries an empty wrapper (`[Note from user: ]`) and the injection's
  entire payload is silently gone. This is confirmed by tracing `frameInjection` → `resolveProseText`
  → `resolveProse` (returns the override text, `prose-slot:267-272`) → `spliceProseTokens`. There is no
  fallback that re-appends the content. **This is the total-loss property the question asserts, and it is
  real.**

**Conclusion for §1:** `{{note}}` was load-bearing from its first commit. It is not, and never was,
cosmetic. Dropping it drops 100% of the injected payload while still shipping the frame — the same class
of failure as `wiFormat` dropping `{{entry}}`.

---

## 2. Why warn-never-block was chosen — the ORIGINAL reasoning

### 2.1 Where the classification was set — S1b, mechanically, by precedent

Commit **`49616a67b`** `feat(prose): PROSE-1 S1b — the inline stragglers onto the registry`
(**2026-08-01 14:12:15 -0600**) introduced `{{note}}`. It was the ONLY commit to touch `{{note}}` in
`chat/prose.ts` / `injections.ts` (`git log -S'{{note}}'` on those paths returns exactly this sha).

The commit message states the reasoning verbatim:

> "The token rides `requiredMacros` (the `{{input}}` precedent) so the S2 editor warns a host who deletes
> it; `macros` stays `"none"` because the engine genuinely never runs."

So warn-never-block was chosen **because that is what `requiredMacros` already did for `{{input}}`** — it
was applied uniformly to every pre-substitution token in the commit (`{{name}}` and `{{note}}` alike), not
because anyone assessed that a lost note is an acceptable outcome. At this point the slots were
`home:"user"` — ordinary prose slots.

### 2.2 The governing philosophy — §6, "required-macro lints, never blocks"

`docs/design/prose-1-spec.md`:

- §6 intro, `:41`: "§6 is the mitigation (required-macro lints, never blocks) and is not optional."
- §6.3 "Voice-lock drift guards", `:351-357`: "`requiredMacros` on the slot def, rendered as a WARN in
  the editor footer — **never a block, never a server-side rejection.**"

**Critical:** §6.3's entire rationale is about **VOICE-LOCK DRIFT (weakening prose), not payload loss.**
Its three worked examples are:
- `impersonateNudge` dropping `{{user}}`/`{{char}}` → "impersonation may bleed" (`:355`);
- `guidedActions.*` dropping `{{input}}` → a lint that "EXISTS already" and is "generalized, not
  invented" (`:356`);
- `RPG_CARD_TEACH` / `RPG_CYOA_TEACH` dropping `:::card` / `:::choices` → "silently un-renders the
  feature" (`:357`).

`{{note}}` is **not mentioned anywhere in §6.3.** The spec never contemplated a total-payload-loss carrier
under `requiredMacros`. The token fell under the warn-never-block umbrella by class membership
(`requiredMacros`), not by a decision specific to it.

**The one precedent that IS a total-loss case kept as warn:** the `:::card`/`:::choices` bullet (`:357`)
— "Dropping them silently un-renders the feature" — is warn-never-block. That is the strongest existing
argument that the current `{{note}}` posture is *consistent* rather than *wrong*: the spec already
tolerated one silent-total-un-render on the lint side. (It rides `requiredTokens`, a sibling field, "with
the same warn-never-block posture.")

### 2.3 The problem warn-never-block was solving

Read from §6 intro (`:41`) and the general PROSE-1 mitigation posture: the cost of the whole program is
"every slot is a new thing a host can break," and the mitigation is an **editor-side advisory** so a host
is warned in the field rather than blocked mid-edit or rejected at the server. The design instinct is
"advise, don't refuse" for prose the host authors. `{{note}}` inherited that instinct wholesale.

---

## 3. The `wiFormat` / `{{entry}}` contrast — when & why it became a block

Commit **`5d71e287e`** `feat(preset,contracts): PRESET-1 server seams …` (**2026-08-01 14:36:42 -0600**,
~24 min after S1b) introduced `FORMAT_STRING_CARRIER_TOKENS`. The commit message records the ruling:

> "OWNER GUARD (2026-08-02): `promptConfigWriteSchema` refuses a format string that dropped its CARRIER
> token (`wiFormat` without `{{entry}}`) — at the WRITE boundary only, so a preset already carrying a
> broken wrapper still loads. Blank still means default, and **PROSE-1's `requiredMacros` stays a lint.**"

The reasoning in code (`packages/contracts/src/preset/index.ts:716-730`):

> "CARRIER tokens … A carrier format string WRAPS content, so a non-empty value that drops its token
> renders the wrapper with the content GONE … That write is REFUSED with a message naming the token —
> never accepted and quietly ignored. … **DELIBERATELY DISTINCT from PROSE-1's `requiredMacros** …
> Those are voice guidance whose absence weakens prose (the identity macros in the impersonate nudge);
> **these are carriers whose absence DELETES content.**"

The write-guard itself: `promptConfigWriteSchema` (`:1736-1751`) iterates
`FORMAT_STRING_CARRIER_TOKENS` over **`config.formatStrings` only** (`:1737`). The `config.prose` blob
(where the note frames store) is validated by `proseOverridesSchema` (`:1611`), which has **no carrier
check** — only a per-key over-cap `.catch(undefined)` heal. So a preset write dropping `{{note}}` is
**accepted and persisted; there is no block anywhere.**

**Did the ruling consider `{{note}}`?** At 2026-08-02 the distinction it drew was
**PROSE-1 `requiredMacros` (lint)** vs **format-string carrier (block)**. At that moment the note frames
were `home:"user"` prose slots — squarely on the `requiredMacros`/lint side of the line by class. The
ruling's phrase "PROSE-1's `requiredMacros` stays a lint" *includes* `{{note}}` by class membership, but
`{{note}}` is never named or reasoned about individually. The line was clean **because the note frames
were not yet format strings and not yet in the Templates tab.** The distinguishing rationale offered —
"requiredMacros = voice guidance whose absence WEAKENS prose; carriers = absence DELETES content" — was
true of the `requiredMacros` set as it then stood (`{{input}}`, `{{user}}`/`{{char}}` voice macros) but
is **false of `{{note}}`**, which deletes content exactly like a carrier.

---

## 4. Intentional distinction, or stale-classification oversight? — THE CRUX

### 4.1 The re-home did NOT re-examine the classification

Commit **`269860bcf`** `feat(prose): the turn-wire framings move to the PRESET home and the Templates
tab` (**2026-08-07 09:10:57 -0600**) re-homed the two note frames `user → preset`, minted the
continuation cue, and — decisively — added them to the Templates registry as **`kind:"format"`** rows
sitting in the **same tab as `wiFormat`** (`packages/contracts/src/preset/index.ts:909-924`, each with
`caps: [{ kind: "tokens", tokens: ["{{note}}"] }]`).

The full commit message (quoted in the receipts below) covers storage home, `composeProse`, the third
`TemplateDefId` arm, server assembly, client drill-in, and NO-LEGACY. It says **nothing** about the
carrier-token write-refusal, `FORMAT_STRING_CARRIER_TOKENS`, or whether a now-`format`-badged frame
sharing a tab with `wiFormat` should share its write-refusal. The re-home was about **STORAGE HOME** and
**EDITOR SURFACE**, and it inherited the warn-never-block posture from the `requiredMacros` mechanism the
slots already rode. `FORMAT_STRING_CARRIER_TOKENS` was untouched — and structurally it could not simply
absorb them: that enum keys off `FormatStringKey` (the `formatStrings.*` keys) and its guard fires on the
`formatStrings` field, whereas the note frames store in `promptConfig.prose`. Moving them to the block
side would have been *work*, and there is no evidence the question was raised.

**On the classification question, this is the signature of an oversight, not a decision:** the frames
crossed into `kind:"format"` / the wiFormat tab, and their divergent enforcement posture rode along
unexamined.

### 4.2 BUT — two comments assert the distinction is DELIBERATE (the fork the owner must resolve)

Two comments, written at/after the re-home, explicitly claim the divergence is intentional:

- **`packages/client/src/features/preset/components/template-drill-in.tsx:188-193`:**
  > "A framing's `{{note}}` is its PAYLOAD carrier: an override that drops it renders the wrapper with the
  > injection's content gone, which is the one mistake an author cannot see in the field itself. **It stays
  > a warning, not a refusal — that is the ruled posture for prose `requiredMacros`** … **deliberately
  > unlike `FORMAT_STRING_CARRIER_TOKENS`**, whose write-refusal is a separate owner ruling about format
  > strings."

- **`packages/contracts/src/preset/index.ts:723-729`** (the `FORMAT_STRING_CARRIER_TOKENS` header):
  > "DELIBERATELY DISTINCT from PROSE-1's `requiredMacros` … Those are voice guidance whose absence
  > weakens prose … these are carriers **whose absence DELETES content.**"

**The contradiction inside the deliberate-distinction claim:** the `template-drill-in` comment *admits*
`{{note}}` is a "PAYLOAD carrier" whose loss renders "the wrapper with the injection's content gone" —
i.e. it **DELETES content**, which is precisely the property the `FORMAT_STRING_CARRIER_TOKENS` comment
uses to justify the block and to separate carriers from `requiredMacros`. So `{{note}}` satisfies the
carrier-bucket's own membership test, yet the comment files it under the lint bucket **on the basis of
its STORAGE mechanism** (it rides `requiredMacros`, so it gets `requiredMacros`' posture), not on the
basis of the distinguishing rationale those comments themselves state. The comments assert a deliberate
distinction while describing a fact that dissolves it.

### 4.3 The reconciliation

- **By git history / commit messages:** the warn-never-block posture is an **inheritance**, never a
  decision about `{{note}}` specifically. S1b applied the `{{input}}` precedent uniformly; the 2026-08-02
  carrier ruling drew its line while the note frames were on the far (prose) side of it; the 2026-08-07
  re-home moved them across the `kind:"format"` / Templates-tab boundary without revisiting enforcement.
- **By the code comments:** the current author *believes* it is deliberate — but the stated rationale
  ("requiredMacros weaken prose; carriers delete content") **misclassifies `{{note}}`**, which the same
  comment concedes deletes content.
- **The precedent that WOULD justify keeping it a warn:** §6.3's `:::card`/`:::choices` bullet — a
  silent-total-un-render deliberately left as warn-never-block. If the owner's principle is "authored
  prose is advised, never refused, even when the mistake is total," then `{{note}}` is *consistent* and
  the divergence from `{{entry}}` is a genuine host-prose-vs-format-string distinction.
- **The fact that undercuts it:** the note frames now live in the same tab, wear the same `kind:"format"`
  badge, and carry the same content-deleting failure mode as `wiFormat` — the exact conditions the
  carrier-block ruling was written to catch. The enforcement split now tracks *storage plumbing*
  (`formatStrings` field vs `prose` blob), not any product-visible property of the two tokens.

**Net:** the divergence is a **stale classification that no commit ever deliberately affirmed for
`{{note}}`**, over-narrated after the fact by comments whose own distinguishing rationale `{{note}}`
violates. Whether that staleness should be corrected (block `{{note}}` like `{{entry}}`) or ratified
(the `:::card` precedent — authored prose is advised, never refused) is the owner's call. This document
does not make it.

---

## 5. Receipts

| Claim | Receipt |
| - | - |
| `{{note}}` = injection payload; total loss on drop | `packages/contracts/src/chat/prose.ts:33-39,257-282`; `spliceProseTokens` `packages/contracts/src/prose-slot/index.ts:299-308`; `resolveProseFrom` `:267-272`; `frameInjection` `packages/server/src/domain/chat/assembly/injections.ts:51-60` |
| Frames fire on the DEFAULT path | `chat/prose.ts:268` (`TURNS_FLOOR` default); `injections.ts:80-121` |
| `{{note}}` introduced, warn posture by `{{input}}` precedent | commit `49616a67b` 2026-08-01 14:12:15 -0600 (message quoted §2.1); only sha from `git log -S'{{note}}'` on those paths |
| §6 philosophy "lints, never blocks" | `docs/design/prose-1-spec.md:41` |
| §6.3 warn-never-block; voice-drift rationale; no `{{note}}` | `docs/design/prose-1-spec.md:351-357` |
| `:::card`/`:::choices` = total-loss kept as warn | `docs/design/prose-1-spec.md:357` |
| `{{entry}}` carrier block introduced; "requiredMacros stays a lint" | commit `5d71e287e` 2026-08-01 14:36:42 -0600 (owner ruling dated 2026-08-02; message quoted §3) |
| Carrier reasoning: carriers DELETE, requiredMacros WEAKEN | `packages/contracts/src/preset/index.ts:716-730` |
| Write guard iterates `formatStrings` only; `prose` blob unguarded | `packages/contracts/src/preset/index.ts:1736-1751`; `prose: proseOverridesSchema` `:1611` |
| Re-home to preset + `kind:"format"` Templates rows; silent on classification | commit `269860bcf` 2026-08-07 09:10:57 -0600 (full message quoted §4.1); rows `packages/contracts/src/preset/index.ts:909-924` |
| Comments asserting deliberate distinction | `packages/client/src/features/preset/components/template-drill-in.tsx:188-193`; `packages/contracts/src/preset/index.ts:723-729` |

### Could not trace / out of scope
- I did not exercise `wrapWiFormat`'s exact drop-`{{entry}}` behavior (whether the entry ships unwrapped
  or is fully dropped) — the question takes `{{entry}}`'s block-on-loss as given, and the `{{note}}`
  loss mechanism is source-pinned independently (§1). If the owner wants the two mechanisms proven
  byte-identical, that is a separate trace of `wrapWiFormat`.
- No test asserts a note-frame override dropping `{{note}}`; the loss is proven by code trace, not a
  red test.
