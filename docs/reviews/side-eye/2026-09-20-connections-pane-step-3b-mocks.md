---
kind: review
status: active
updated: 2026-09-20
---

# The Connections pane step-3b mocks — driven review (lane cb-mocks-sideeye)

**Verdict: SHIP WITH FIXES.** The three mocks are the best-argued drawing set this repo has produced —
every §5.3a copy string renders as real text, the 486 fit claim survives measurement, the status dot is
genuinely colour-independent, and the delta boards are exactly the shape step 9 needs. But the render
falsifies four of the set's own written claims, and three defects would ship into step 9 unnoticed
because they are invisible in source and unremarkable at a glance.

Subject: `docs/design/mocks/connections/{list,editor,model-roles}.html` + `DESIGN.md` at `782fef299338`.
Spec: `docs/design/orbweaver-inference-package.md` §5.3a (read in full) and §13 step 3b.

---

## 0. Per-target verdicts (FOCUSED review, brief's rank order)

| # | The brief's question | Verdict | Receipt |
| - | - | - | - |
| 1 | Does the editor fit at 486 with the context panel open? | **YES, measured.** Zero horizontal bleed and zero unplanned scroll in all 7 body frames at both widths. The crossover is real but is **490px of content (528–532px body), not 498** | `cb-editor-fit` eval + `cb-editor-crossover` sweep 900→380px in 4px steps |
| 2 | Do user-owned rows inside a settings body collide with shell anatomy? | **NO — the four rules hold and the row does not read as a second nav.** But Saved-key rows reuse the connection-row anatomy exactly, and the row has no primary activation (see F4, F7) | `cb-mocks-sideeye-list-full` Board A · `cb-list-kbd` |
| 3 | The per-role status dot — is colour the only channel? | **NO, it is not. PASS.** Every state carries a plain-words `aria-label` (`Running` / `Set, but not running` / `Not set`) AND a sentence beside it. I walked all six rows with the dot mentally removed and every state is still decidable | `cb-roles-map` surface map · Board A/B renders |
| 4 | Is every §5.3a copy string present verbatim, none described? | **YES. 42/42 present in rendered innerText**, audited against the renders not the table. ONE table row is wrong (F10) | `cb-mocks-sideeye-copy.sh` over `--text` of all three mocks |
| 5 | The two-arm readout — both visible and distinguishable? | **Both arms render and are distinguishable (muted vs info-blue, 8.45:1 / 7.44:1). But there are FOUR grammars, not two** (F3) | `cb-roles-contrast` · `model-roles.html:171,175,181,201` |
| 6 | Tap targets, focus, names, contrast, empty states, the disabled reason, refusal-plus-repair | **Mixed.** Contrast is excellent everywhere. Focus ring is perfect. Tap targets fail the coarse floor across the board (F2). Accessible names fail in two specific places (F1, F5). The refusal-plus-repair pair is FINE (§4) | below |

---

## 1. Findings, ranked

### F1 · P1 — Fourteen buttons all named "Override", four all named "Reset"

**What.** The Advanced tier's resolved-fact rows each carry an `Override` (or `Reset`) button whose
accessible name is exactly that word. The keyboard walk hears, in order:
`Override · Reset · Override · Override · Reset · Override · Override · Override · Reset · Override`.

**Why it hurts.** Sam cannot tell which field any of them overrides. This is the tier §5.3a designed
specifically so a user can see "the resolved value, where it came from, can I change it" per field —
and per-field is precisely the information the name drops. It is also the one place in the set that
gets this wrong: the extras trash buttons are named `Remove the top_k field` / `Remove the stream
field`, and the list kebabs are named `More actions for OpenRouter · Claude Opus 5`. The set already
knows how to do this.

**Fix.** `aria-label="Override prefill"` / `aria-label="Reset strictJson"`, or make each fact row a
`role="group"` with `aria-labelledby` pointing at its mono key so the button inherits context.

**Receipt.** `cb-editor-map` surface map rows 24–37 (`role=button[name="Override"] >> nth=0..10`);
`cb-editor-kbd` focus walk, 16 stops.
Run: `reports/runs/snap/agent-a028ab6f703f51f79-3446659-2026-09-20T17-43-03-279Z/run.json`.

### F2 · P1 (touch) — Every interactive control in the set is below the coarse-pointer floor

**What.** Measured under real `pointer: coarse` emulation, `tap-affected` is 100% of candidates in both
mocks that have real controls:

| Mock | candidates | affected | worst short side |
| - | - | - | - |
| `list.html` | 14 | 14 | **32px** (all four row kebabs) · 34px (Add connection, Done, Cancel, Remove) |
| `editor.html` | 41 | 41 | **18px** (the `change ▾` control) · 27–28px (12+22 Override/Reset) · 34px (extras trash) |
| `model-roles.html` | 0 | — | nothing tappable exists to measure (see F8) |

**Why it hurts.** On the list the kebab is the ONLY door to Edit, Remove and both survivability actions
(DESIGN.md §2.2 moved them there on purpose). A 32×32 target for the single entry point to every
consequential act on a connection is the worst place in the pane to be under floor.

**The honest caveat.** If step 9 renders these through `@orb/ui` `Button size="glyph-*"` / `size="inline"`,
the primitive's pointer-conditional `::after` lifts the hit area to 44–45px and the finding evaporates
(`packages/ui/src/primitives/button/variants.ts:16-20,76-82`). So the real finding is: **the mock draws
sub-floor geometry and says nothing about inheriting the primitive's touch target**, and §13 step 3b
lists `--mobile` as a done-criterion. Either draw the coarse silhouette or write the inheritance down.
The one place DESIGN.md *does* address it ("gives the select a 44px-class hit target across the whole
row", `model-roles.html` note under Board C) is on the one control that is not a real control.

**Receipt.** `cb-list-audit-mobile` (`pointer=coarse`, `tap-candidates=14 tap-judged=14 tap-affected=14`,
`population-verdict=complete`) and `cb-editor-audit-mobile` (`41/41/41`). Corroborated independently by
the keyboard walk's measured boxes: kebab `32x32`, `Add connection` `139x34`, `Override` `68x27`,
`change` `64x18`.
Runs: `reports/runs/snap/agent-a028ab6f703f51f79-3480*`, `-3487*`.

### F3 · P1 — The resolve readout has FOUR grammars; DESIGN.md §3 declares two

**What.** The mock renders four distinct sentence shapes across three CSS classes:

| # | Class | Sentence | Documented? |
| - | - | - | - |
| 1 | `.readout.steady` | `A turn uses {X}.` | yes — the steady arm |
| 2 | `.readout.drift` | `Not applied yet — a turn still uses {X}.` | yes — the divergence arm |
| 3 | `.readout.none` | `Nothing — no connection is set.` (italic) | **no** |
| 4 | `.readout.steady` again | `A turn uses nothing — Can't reach 127.0.0.1:8000 — the server may be down.` | **no** |

**Why it hurts.** Step 9 reads "two arms, keyed on draft≠persisted" and builds two. The unset state and
the unreachable state then fall back to arm 1 or vanish — and the unreachable case is exactly the one
the amber dot depends on ("the readout says why, in one sentence", Board D). Arm 4 also reuses the
STEADY class for a sentence that is not steady, so a fix lane touching `.readout.steady` styling hits
both. And arm 4 reads badly: two stacked em-dash clauses, and "uses nothing" parses for a beat as
"uses \[the thing called] nothing".

**Fix.** Name four arms in DESIGN.md §3 with their conditions; give 3 and 4 their own classes; rewrite
4 as `Set, but not running — can't reach 127.0.0.1:8000.` (which also makes it agree word-for-word with
the dot's own accessible name).

**Receipt.** `model-roles.html:171` (arm 1), `:181` (arm 3 — `readout none`), `:201` (arm 4 on
`readout steady`), `:71` in the Image-embedding row (arm 2). Rendered:
`cb-mocks-sideeye-roles-full.png` Board A rows 1–6.

### F4 · P1 — "Saved keys" renders two destructive ACTIONS as inert metadata text

**What.** `list.html:273` renders §5.3a's string as a single mono span inside `.meta`:

```html
<div class="meta"><span>used by 3 connections · replace · revoke</span></div>
```

`replace` and `revoke` are not buttons, not links, have no focus target, no accessible name and no
hover affordance. The surface map for `list.html` contains **zero** actionable controls in the Saved
keys section. They render in the identical 10.5px mono grey as the connection rows' `OpenRouter ·
anthropic/claude-opus-5` two rows above — i.e. they read as metadata, which is what they are.

**Why it hurts.** Revoking a key is the most consequential act in the section and there is no way to
perform it — for anyone with a mouse, and structurally none at all for a keyboard or screen-reader user.

**This one is a SPEC correction, not just a mock nit.** §5.3a itself writes the actions into the
metadata string — *"'Saved keys' becomes a read-only reuse view ('used by 3 connections · replace ·
revoke')"* — and the render proves that string cannot carry them. A "read-only reuse view" whose two
verbs are revoke and replace is not read-only. §5.3a should be amended to: a count line plus two
explicit actions (row buttons or a kebab, matching the connection row's grammar), and `revoke` needs
a confirm since keys are shared across connections.

**Receipt.** `cb-list-kbd` walk — Board A yields `Add connection → kebab ×4` and then leaves the
section; no Saved-keys stop exists. `list.html:265-284`.

### F5 · P1 — The grouped provider picker has no group semantics, and the headings corrupt the listbox name

**What.** The four group headings are `<div class="pgroup">` with `role: null`, sitting as direct
children of `role="listbox"`. Two consequences, both measured:

1. Non-`option` children of a listbox get folded into the listbox's own accessible name. `--map`
   returns: `listbox "Hosted (key) OpenRouter Anthropic OpenAI Your own server (URL) vLLM LM Studio O…"`.
2. A screen-reader user gets **nine flat options** — the exact "never twelve options flat" outcome
   §5.3a wrote the grouping to prevent. The grouping exists on the visual channel only.

Visually it is also the weakest channel available: the headings are **9.5px** muted
(`oklch(0.74 0.008 65)`) against 13px `weight: 560` foreground rows — and 9.5px is below the ratified
`text.micro` ramp floor of 10.5px.

**Fix.** `role="group"` per section with `aria-label` = the heading (and `aria-hidden` on the visual
heading, or `aria-labelledby` to it); lift the heading to `text.micro`.

**Receipt.** `cb-editor-picker` eval — all four headings `role: null`, `size: "9.5px"`;
`cb-editor-map` line 57 (the flattened listbox name).
Run: `reports/runs/snap/agent-a028ab6f703f51f79-3500*/run.json`.

### F6 · P1 — The Model-roles readout names the connection in MACHINE words, 40px from the same connection named in USER words

**What.** Every row renders `A turn uses openrouter · anthropic/claude-opus-5.` while the picker on the
same line reads `OpenRouter · Claude Opus 5`. The readout uses the provider REGISTRY id and the raw
model id; the control beside it uses the connection's label.

**Why it hurts.** The readout's entire purpose is comparison: *is what a turn uses the same as what I
picked?* — the 2026-08-01 NULL-`roleDefaults`-under-a-Saved-chip incident is the reason it exists at
all. Two vocabularies makes that comparison a translation exercise. It is also the exact class §5.3a's
"Words" paragraph exists to kill: `provider` is a *user-facing label*, not a lowercase registry id.

**The counter-argument, stated.** The label is user-editable, so the machine ids are the honest truth
about what will actually run. Fine — then show `OpenRouter · Claude Opus 5` and put the ids in a title
or a second muted line. Do not make the user diff two spellings.

**Receipt.** `model-roles.html:171` (`<span class="rv">openrouter · anthropic/claude-opus-5</span>`)
beside `:174` (`<span>OpenRouter · Claude Opus 5</span>`). Rendered: Board A rows 1–2,
`cb-mocks-sideeye-roles-full.png`.

### F7 · P2 — A connection row has no primary activation; the only door to the editor is inside an overflow menu

**What.** `.crow` is a plain `<div>`. It is not focusable, not clickable, has no role. The complete tab
order of Board A is `Add connection → kebab → kebab → kebab → kebab`. To edit a connection: hover the
row, find the kebab, open it, skip past two sweep actions, click `Edit`.

**Why it hurts.** On a pane whose noun is "things you edit", editing is three interactions deep and the
two rarest actions sit above it in the menu. DESIGN.md §2.2 argues well that the *sweep* action belongs
in a menu; it never argues that *Edit* does. Alex and Jordan both lose here, and a keyboard user has no
shortcut at all.

**Fix.** Make the row itself the editor door (row `button`/link, or a trailing chevron), and keep the
kebab for the three secondary acts. That also restores DESIGN.md's rule 2 ("the row owns exactly one
\[trailing action]") in spirit — one *trailing* action, plus a row-level primary.

**Receipt.** `cb-list-kbd` 12-stop walk; `list.html:198` (`<div class="crow">`).

### F8 · P2 — Essential renders FOUR fields; §5.3a and DESIGN.md both say three

**What.** Both widths render Provider · Server URL · Model · **Name** inside the open Essential tier.
§5.3a: *"a user who has touched nothing sees three fields and a 'how it's used' line."* DESIGN.md §1
restates it: *"the default state is three fields and one verdict line at 870 AND at 486."* The render
has four.

`Name` is real and useful (it carries the auto-mint + rename gloss). But the claim is the design's own
load-bearing argument for why the tiering works, and it is false as drawn. Either move `Name` below the
Purpose verdict / into Advanced, or amend both documents to "four fields and a verdict line".

**Receipt.** `editor.html:246-249` (870) and `:604` (486). Rendered:
`cb-mocks-sideeye-editor-full.png` Board A.

### F9 · P2 — The 486 arm changes FIVE things, and the two widest elements in the editor are never drawn at 486 at all

**What.** DESIGN.md §1: *"Exactly three things reflow."* Measured, the 486 arm differs in five ways —
and two of the three claimed reflows are asserted rather than rendered.

| # | 486 change | In DESIGN.md's list? | Drawn at 486? |
| - | - | - | - |
| 1 | `.fact` row stacks (`editor.html:134-136`) | yes | yes — Board E |
| 2 | Capability rail truncates to four + `…and 2 more it can't serve` | yes | yes — Board D |
| 3 | Tier count badge `3 fields overridden` → `3 overridden` (`:469` vs `:606`) | yes (as a separate sentence) | yes |
| 4 | **Collapsed-tier kicker summaries are DELETED** (`:467-468` carry `vLLM · 127.0.0.1:8000 · Qwen/Qwen3-32B`; `:617-618` carry nothing) | **no** | yes |
| 5 | **`.xrow` extras key/value pair stacks** (`editor.html:144`) | **no** | **no** |
| — | two-up transport pair goes one-up | yes | **no** |

**Why #4 hurts.** At 486 — the width *with the context panel open*, i.e. where a user is comparing the
pane against a room — a collapsed Essential tier is a bare word and a chevron. No provider, no URL, no
model. Collapsed-tier summaries are the mechanism that makes four tiers navigable; deleting them at the
width where navigation is hardest inverts the intent.

**Why #5 and the transport pair matter.** Diagnostics is collapsed in **both** 486 boards, so the tier
holding the two widest elements in the editor is never rendered narrow anywhere in the set. Its answer
is CSS that no board exercises. I measured the transport pair myself to close the gap (below) but the
extras row at 486 remains undrawn.

**Independent measurement of the one claim I could check.** Sweeping the Board-C body 900→380px in 4px
steps: the `Extra headers` / `Don't send these fields` pair is side-by-side down to a body width of
**532px** and goes one-up at **528px** — a content crossover of **490px**, not DESIGN.md's 498. The
conclusion holds (486 is comfortably below it); the number should be corrected.

**Fix.** Draw a third 486 board with Diagnostics expanded. Keep the collapsed-tier kickers at 486 (they
fit — `vLLM · 127.0.0.1:8000` alone is 22 characters). Correct 498 → 490.

**Receipt.** `cb-editor-crossover` eval (crossover object `{bodyWidthLast2up: 532, bodyWidthFirst1up: 528,
contentAt2up: 490}`); `cb-editor-fit` (7 body frames, zero bleed, zero unplanned scroll);
`editor.html:134-136,144,467-469,606,617-618,650`.

### F10 · P2 — The 486 arm silently DROPS teaching copy, including the one sentence that discharges verify9 M6

**What.** The 486 boards do not reflow the glosses; they shorten them. Three cuts, none stated as a rule:

| Element | 870 | 486 |
| - | - | - |
| Section gloss | "…An unset role does nothing — there is no default model. **Rooms never override this: a turn always runs on the connection of whoever triggered it.**" | first sentence only |
| Image embedding | "A multimodal embedder for searching images directly. **Unset falls back to the captioned-text lens.**" | first sentence only |
| Image generation | "Renders pictures from prompts (the /imagine surface). **Optional — leaving it unset means /imagine says so instead of failing.**" | first clause only |

**Why it hurts.** The F20 sentence is the one that corrects a false mental model ("can a room override
this?") and DESIGN.md's own Board-E delta row calls it out as the deliberate addition, *"because the
section body is where a user forms the expectation"*. Dropping it at the narrower width drops it exactly
where the user is most likely to be mid-task. The other two cuts remove the only statement of what
happens when the role is unset — on the two rows whose dot is most often a grey ring.

**Also contradicted here:** the note under Board C states *"The badge rail is the row's one unbounded
element and it is allowed to wrap rather than truncate, because a requirement the user cannot see is the
exact failure the badges exist to prevent."* At 486 the Image-embedding row's badge rail
(`✓image input ✓1024-wide vectors` at 870) is **absent**, not wrapped.

**Fix.** Either state a rule ("the second sentence of a row gloss is dropped below 560px") and exempt
the F20 sentence, or keep all copy and let it wrap. Restore the 486 badge rail to match the note.

**Receipt.** `model-roles.html:171-201` (870) vs `:334-377` (486). Rendered: `crops/roles-00.png` vs
`crops/roles-02.png`.

### F11 · P2 — A `+0` badge ships in Board A

**What.** `list.html:208` renders `<span class="badge more">+0</span>` after the three role badges on
the OpenRouter row. At 486 the same row correctly reads `Chat · Utility model · +1`.

**Why it hurts.** It is a number the user must read to learn nothing — and DESIGN.md §2.4 says so in
exactly those words about a different badge: *"A tier with nothing in it shows NO badge — a 0 badge is a
number you must read to learn nothing."* The set states the rule and then breaks it two files away.

**Fix.** Suppress `+N` when N is 0.

**Receipt.** `list.html:208`; rendered `crops/list-00.png`, row 1 badge rail.

### F12 · P2 — The editor's capability rail is four red pills out of six on a healthy connection

**What.** "What it can be used for" renders `Chat` `Utility model` in success-green and `Image
generation — no image output` `Text embedding — wrong kind` `Image embedding — wrong kind` `Rerank —
wrong kind` in destructive-red. At 486 it truncates to `Chat · Utility model · Image generation — no
image output · Text embedding — wrong kind · …and 2 more it can't serve` — i.e. the truncation keeps two
reds and hides two reds.

**Why it hurts.** Destructive red means *something is wrong*. Here it means *not applicable* — a normal,
expected property of every chat model in existence. A user opening a perfectly healthy vLLM connection
sees a wall of red and reasonably concludes they have misconfigured something. It also spends the pane's
scarcest colour on its least actionable information; §6/CD3 says one focal element, and this is four.

**Fix.** `quieter: the editor's "What it can be used for" rail — render the can'ts in muted/neutral with
the reason suffix, reserve red for a bound role that has actually broken; and truncate greens-first so
the 486 rail shows what it CAN do plus `…and 4 more it can't serve`.` Receipt for the fix: a
before/after `--shot-of` of the rail at both widths.

**Secondary, same element:** the editor rail signals pass/fail by colour + a `— reason` suffix, while
Model-roles' `Needs:` rail signals it by colour + a `✓`/`✗` glyph. Two grammars for one concept on two
surfaces of the same pane (Nielsen #4). The glyph version is better and already exists — use it in both.

**Receipt.** `editor.html:264-270` (no glyph) vs `model-roles.html:180-184` (`<svg class="bi">` ✓);
rendered `crops/editor-01.png` and `crops/roles-00.png`. Contrast on both is fine (`.badge.no` 6.72:1,
`.badge.ok` 8.27:1) — this is a semantics finding, not a legibility one.

### F13 · P2 — Endpoint quirks renders raw camelCase schema field names, and the stated rationale does not cover them

**What.** The quirks block's key column renders `prefill`, `strictJson`, `effort`, `reasoningKeys`,
`prefillSuppressesThinking`, `rerankPath`, `sleep`.

DESIGN.md's rationale: *"a quirk keeps the server's own \[words] … because the one block whose purpose is
matching a server's documentation must be matchable against it."* That holds for
`prefill: continue-final-message` — §5.3a's own example, and a real wire concept. It does not hold for
`prefillSuppressesThinking` or `reasoningKeys`, which are **our `features` schema's TypeScript property
names**. vLLM's documentation contains no such string, so the matchability argument is falsified by the
very rows it is used to justify.

**Why it hurts.** §5.3a's Words paragraph exists to keep schema vocabulary out of copy
(`declared`/`features`/`extras`/`transport` all get pane names for this reason). This block leaks seven
schema identifiers into the user surface and reasons that it is fine.

**Fix.** Keep the mono column, but display-name the keys that are ours and keep verbatim only the ones
that are the wire's (`prefill`, `rerankPath`, `sleep` arguably). Or keep the identifier and add the
plain-language line the "What this server accepts" block already has.

**This is spec-adjacent.** §5.3a's single worked example is the most readable key in the set, so the
spec never confronts the case. The render does. Worth a §5.3a amendment naming which keys stay raw.

**Receipt.** `crops/editor-02.png`; `editor.html` Board B quirks rows.

### F14 · P3 — Jargon leaks into user copy in three places

- `model-roles.html:26` — *"Eleven consumers ride this slot — memory digests, **the turn arbiter**,
  extraction and image captions."* "Consumers" and "turn arbiter" are not user words, and the count is
  an implementation fact.
- The refusal block: *"Without it, eleven things quietly skip — only **the turn arbiter** degrades where
  you can see it."* Same.
- `editor.html:272` — *"A role you can't fill from here is greyed out in Model roles too, with the same
  reason."* Inverted: what is greyed out in Model roles is a **connection option**, not a role.

**Fix.** `clarify:` those three strings. Suggested: "Several things use this slot — memory digests,
summaries, extraction and image captions." / "This connection is greyed out in Model roles too, with the
same reason."

### F15 · P3 — Placeholder-only labelling on the fields that matter most

The extras rows render as two unlabelled inputs side by side (`top_k` / `40`), and the subscription arm's
token field is placeholder-only (`Paste the token`) under a heading that labels the whole group. The
token field is the one place a user pastes a secret. `cb-editor-map` shows no `textbox` rows at all
(F8/F16), so this is drawn-shape evidence, not measured a11y — but it is what step 9 would copy.

**Fix.** Visible column headers for the extras grid (`Field` / `Value`) or `aria-label` per input; a real
`<label>` on the token field.

---

## 2. Instrument retractions — findings I did NOT file, with the receipt that killed them

Published deliberately: the design-audit's headline numbers on this set are almost entirely artifacts of
how a multi-board mock page is drawn, and a reviewer who forwarded them would have filed 48 false rows.

| Reported | Count | Why it is NOT a finding |
| - | - | - |
| `contrast` P1 | **33** on `list.html` | All carry a `dimmed α0.55 / α0.35 / α0.19` tag. They are Board B's deliberately muted demo rows (`style="opacity:.35"`) and Board C's scrimmed body (`filter:brightness(.55)`). **The same selectors measured on the undimmed Board A instances return 6.58–17.14:1, every one PASS** (`cb-list-contrast`, `cb-roles-contrast`, `cb-editor-contrast` — 23 of 24 targets PASS, the 24th is off-screen, none fail). The set has no contrast problem. |
| `text-over-art` P1 | 13 | All 13 are the same nodes as the `NO VERDICT` block, and the block names the cause: *"10 painted over by `div.dlgscrim`"*. That is Board C's drawn modal scrim. There is no `background-image` anywhere in `list.html` (grep, 0 hits). |
| `obscured-target` P0 + P1 | 3 | Identical cause — `"Add connection"` is behind Board C's `.dlgscrim`. A modal covering what is behind it is the modal working. |
| `nested-card` P3 | 17 | The `.body` board frame is a card (border+radius+shadow) purely so the mock can draw a settings body on a page. In the real pane the settings body is the content track, not a card, so every one of these collapses to a single level. |
| `duplicate-action-door` P3 | 4 | `2x "Add connection"`, `3x "More actions for OpenRouter · Claude Opus 5"` — the same row drawn on several boards. |
| `line-length` P3 / `all-caps-body` P3 | 27 | The mock's own explanatory `.note` prose and `.plabel` board kickers. Not product surface. |
| `border-contrast` P2 | 1 | The picker popover's 1px top border reads 1.19:1 — but the mock's `--color-border: oklch(0.99 0.005 60 / 0.08)` is **byte-identical to `packages/ui/src/styles/theme.css:31`**, i.e. the shipped Hearth token, and the popover's boundary is also carried by a distinct `--color-popover` fill and a `0 16px 44px rgb(0 0 0 / .5)` shadow. Inherited theme property, judged in isolation by the rule. Not a mock defect; worth its own row against the theme if anyone wants it. |
| `off-theme-font` P2 | 2 | The mock declares `Geist` with no `@font-face`. It nonetheless PAINTED in Geist on this box — "Claude subscription" at 100px measures **797.13px in Geist vs 878.28px in Arial/sans-serif** (`cb-list-font`), so the geometry receipts above are taken in the right face. **Caveat worth keeping:** the mock's fit depends on a host-installed Geist. A reader on a machine without it sees a ~10% wider measure and the 486 claims get tighter. Add a webfont `@font-face` or state the dependency. |

**Durable instrument lesson (index line + body for the orchestrator to write, not me):**
`design-audit-on-a-multi-board-mock-page.md` — *"A `--file` mock that draws several boards on one page
produces a design-audit whose P0/P1 set is dominated by the DRAWING: deliberately dimmed demo rows read
as contrast failures (`dimmed α…` tag is the tell), a drawn modal scrim reads as `obscured-target` and
`text-over-art`/NO-VERDICT, the board frame reads as `nested-card`, and repeated boards read as
`duplicate-action-door`. Triage by re-measuring the same selectors on the UNDIMMED board with `--contrast`,
and read the NO VERDICT block's named cause before filing anything. On this set 48 of 93 findings were
drawing artifacts."*

---

## 3. What the renders CONFIRMED — claims that survived attack

1. **The editor fits at 486.** Seven body frames measured: zero elements bleeding past either edge, zero
   descendants with unplanned horizontal scroll, at 870 and 486. The crossover claim is a real range
   property and I swept it rather than point-measuring: 490px content (528–532px body).
2. **The status dot is not a colour-only channel.** `role="img"` + `aria-label` of `Running` /
   `Set, but not running` / `Not set` on every dot, plus a sentence per row. I walked all six Board-A
   rows with the dot removed and every state is decidable from the sentence alone. Board D's own claim
   *"Every state is fully readable with the dot removed"* is true.
3. **Contrast is excellent, everywhere.** 23 measured targets on real elements, range 6.58:1 – 17.14:1,
   AA floor 4.5:1. Including the two readout arms (8.45 steady / 7.44 divergence), all six badge
   variants, every gloss and every field label.
4. **Focus is perfect on every real control.** 28 focus stops across two mocks, `:focus-visible = true`
   at every one, `outline: oklch(0.72 0.175 52) solid 2px` at every one, order = reading order.
5. **All 42 §5.3a copy strings render as real text**, audited against `--text` innerText. None is
   described rather than drawn. The disabled-provider reason and the background refusal both live in the
   option's **accessible name**, not just its paint.
6. **The refusal-stated-twice pair is FINE — I went looking for duplication and it is not.** The picker's
   disabled reason and the row's repair block are sequential, not simultaneous: the popover physically
   overlays the repair block (measured in the Board-B render, the popover clips the block's right edge),
   so a user sees the reason, closes, then sees the repair. DESIGN.md §2.5's argument holds. One polish
   note only: the repair block re-leads with the identical sentence; lead it with the repair
   ("Turn on background work for this connection") and keep the reason as its second line.
7. **The row menu is not clipped.** The builder's `overflow:visible` fix works; the menu escapes the body
   cleanly at both the row and the dialog.
8. **I retract my own first reading of Board B.** In the 4324px-tall `--full` capture the third row's
   text appeared doubled/overlapped and I nearly filed it as a paint defect. Re-shot at a 1000×900
   viewport it renders clean — a tall-capture artifact, not a mock defect.
   (Run `agent-a028ab6f703f51f79-3413764-2026-09-20T17-38-12-785Z`.)

---

## 4. Taste & flow verdict (blunt, per surface)

**`list.html` — looks good; one thing reads wrong.** The flat rows inside a settings section are the
right call and they genuinely do not read as a list pane. The identity block, mono meta line and badge
rail have a clean rhythm, and the 486 stack is a better layout than the 870 one. Two things bother my
eye. First, **"Connections" is printed twice in 60 vertical pixels** — once as the body band title and
once as the section heading. In the real shell the band is shell chrome and the heading is the section,
so it is defensible, but drawn together it reads as a mistake. Second, **"Allow background work" is
spelled out four times down the right edge**, wrapping to two lines each time — the same five words
repeated at every row, in the loudest column position. It makes the pane look like a settings list of
one setting. Put the label in a column header or drop it to an icon-plus-tooltip and keep the words on
the switch's accessible name (which already carries them).

**`editor.html` — this is the best surface in the set.** It reads like a document, not a form. The tier
rhythm works, the collapsed summaries are the right idea, and the fact-row grammar (mono key / value /
source / one action) is genuinely elegant — I would steal it. Two things degrade it. The **red wall** in
the capability rail (F12) is the first thing your eye lands on in the Purpose tier and it says "broken"
about a healthy connection. And the **quirks key column** (F13) reads like someone pasted a TypeScript
interface into the UI — seven camelCase identifiers in a row is the one place the pane looks like
SillyTavern's API drawer, which is the exact thing §5.3a opens by saying it must not be.

**`model-roles.html` — clean, and the row grammar is right.** Dot / label / gloss / badges / readout /
picker is a good five-part row and it survives the 486 stack. The `Needs:` rail with ✓/✗ glyphs is the
best small pattern in the whole set. What flows weird: **the readout and the picker say the same thing in
two different languages** (F6), so the eye bounces between them instead of comparing them. And the row is
tall — at 870 the Utility row is five stacked lines, so six rows is a long scroll for six decisions.

**One-home check (§13 IA).** One real violation: **`Allow background work` now has three homes** — the
connection row's inline switch, the editor's Purpose tier, and the Model-roles refusal block's repair
switch. DESIGN.md's rule 3 justifies the row's copy by "a user who lands here from that refusal must find
it without opening an editor" — but the refusal already carries its own switch, so that journey never
happens. Drop the row's switch; keep the badge (`Background work off`) as the row's read-only signal, and
keep the two switches that sit where the decision is made. Otherwise: no other duplicated affordance, no
concept with two editors, no control far from its effect. The three no-defaults actions each have exactly
one home. Saved keys and Connections are correctly separated.

**Cold-read test.** A first-timer landing on `list.html` can name what the surface is for and what to do
first — `Add connection` is unmissable and the lede sentence is good. One snag: **Saved-key rows and
connection rows are visually identical** (same `.crow` class, same bold name, same mono meta), 20px apart
under two headings, so a cold reader has to read the headings to know they are different kinds of object.
Give the key rows a different anatomy — a key glyph, or a compact two-column layout.

---

## 5. ARIA-navigability recommendations (first-class, exact)

| Element | Today | Fix |
| - | - | - |
| Advanced fact rows' `Override` / `Reset` (14 + 4) | accessible name is the bare verb | `aria-label="Override prefill"`, or `role="group" aria-labelledby="<key id>"` on each `.fact` row |
| Provider picker group headings ×4 | `<div class="pgroup">`, `role: null`, inside `role="listbox"` | `role="group"` + `aria-label="Hosted (key)"`; mark the visual heading `aria-hidden="true"` so the listbox name stops swallowing it |
| Provider picker listbox | accessible name is the flattened contents of every option and heading | fix follows from the row above; add an explicit `aria-label="Provider"` |
| Saved keys `replace` / `revoke` | inert `<span>` inside a mono meta line | real `<button>`s with names `Replace the OpenRouter "work" key` / `Revoke the OpenRouter "work" key`; `revoke` opens the house `ConfirmDialog` |
| Connection row | `<div>`, not focusable | row-level `<button>` or link named `Edit OpenRouter · Claude Opus 5`, or a named trailing chevron |
| Extras key/value inputs | no name, placeholder only on the empty row | `aria-label="Field name"` / `aria-label="Field value"` per row, or a visible two-column header |
| Subscription token field | placeholder `Paste the token` only | a real `<label for>`; it is a secret field and deserves the strongest labelling in the pane |
| `change ▾` (inferred kind) | accessible name `change` | `aria-label="Change what this model is for"`; `aria-expanded` when it opens a menu |
| `Copy` (setup-token) | accessible name `Copy` | `aria-label="Copy the claude setup-token command"` |
| Disclosure tier headers ×4 | `<div class="tierhead">` with `cursor:pointer` | `<button aria-expanded>` — see §6, this is the set's central mechanism and it has no a11y contract |
| Switches (list row, editor, refusal) | `role="img"` + `aria-label` | `role="switch"` + `aria-checked`, keyboard-operable — see §6 |
| Page | no `<main>` | mock scaffolding; the real pane inherits the shell's landmark |

---

## 6. What the mocks structurally CANNOT answer (stated coverage gaps, not findings)

Every interactive element except `<button>`s is drawn as a styled `<div>`. That is the right economy for a
drawing, but it means three of §13 step 3b's own done-criteria are only partially discharged and step 9
must not read silence here as a decision:

1. **Focus order through the editor is unmeasured.** The Tab walk reaches 4 of Board A's affordances and
   zero of its fields. Provider, Server URL, Model, Name and all four tier headers are not focusable.
2. **The disclosure tiers — the mechanism §5.3a specifies — have no a11y contract in the set.** No
   `aria-expanded`, no button role, no keyboard operation. This is the single most likely thing to be
   copied verbatim.
3. **The switches are `role="img"`.** Non-operable, no `aria-checked`, absent from the tab order. So "is
   the row's switch in the right focus position" is unanswered, and `model-roles.html` has **zero**
   tappable candidates, which is why its `--mobile` arm measured nothing (`tap-candidates=0`,
   `population-verdict=complete` — an honest zero over an empty population, not a clean result).
4. **The adaptation MECHANISM is undecided.** The three mocks contain **zero `@media` and zero
   `@container` rules** (grep: 0 hits across all three). The 870/486 arms are two hand-authored boards
   plus six `.body.w486 …` override rules. House law (`§0` reading-surface / container model) requires
   `@container`; the mock decides the two end states and says nothing about the container name or the
   breakpoint. Name them in DESIGN.md before step 9 picks one.
5. **Diagnostics at 486 is never drawn** (F9) — its two widest elements are covered by CSS no board
   exercises.
6. **Appearance / theme arms are N/A by instrument contract.** `--theme` and `--appearance*` refuse on
   `--file` (`FILE REFUSED  --theme shims the app's settings response; a static file makes no such
   request`), and the mocks carry no `prefers-color-scheme` / `prefers-contrast` / `prefers-reduced-motion`
   block, so a light or high-contrast arm would be byte-identical. The mocks hardcode the Hearth dark
   values. **A light-theme reading of this pane is therefore entirely unproven** and is owed on the built
   pane at step 9.

---

## 7. Spec corrections owed to §5.3a (more valuable than the mock nits)

1. **"Saved keys … read-only reuse view ('used by 3 connections · replace · revoke')"** — the parenthetical
   bundles two consequential verbs into a metadata string, and the render proves the string cannot carry
   them (F4). Respell as a count line plus two explicit actions; `revoke` needs a confirm.
2. **"a user who has touched nothing sees three fields and a 'how it's used' line"** — the field set the
   same paragraph specifies (provider · key-or-URL · model) plus the `label` the next paragraph mandates
   is four fields (F8). Say four, or tier `label` down.
3. **"Endpoint quirks … each field showing its resolved value + source"** with `prefill:
   continue-final-message` as the worked example — the example is the most readable key in the set; the
   other six are our own camelCase schema identifiers and the "matchable against the server's
   documentation" rationale does not reach them (F13). Name which keys stay raw.
4. **The two-arm readout** — §5.3a specifies the divergence sentence and DESIGN.md §3 adds the steady one.
   The surface actually needs four (F3): unset and unreachable are real states with real sentences.
5. **"the task-requirement badges"** — §5.3a puts them in the Purpose tier without saying how a *cannot
   serve* verdict is signalled. The mock chose destructive-red for "not applicable" (F12). A one-line
   ruling is owed, and it should not be red.

## 8. DESIGN.md corrections owed

- §1: "Exactly three things reflow" → five, two of them never drawn (F9).
- §1: the crossover is 490px of content, not 498 (measured).
- §1 / §4: "the default state is three fields and one verdict line" → four fields (F8).
- §4 copy table: `allow background work on this connection` is listed as rendered in `model-roles.html`
  B. It is not — it appears only inside Board E's delta table as a quotation of §5.3a. The rendered
  label is the better, subject-bearing `Allow background work on Claude subscription · Opus`. Reclassify
  the row as DELIBERATE-WITH-CITE rather than verbatim.
- §2.4's own rule ("a 0 badge is a number you must read to learn nothing") is broken by `+0` in
  `list.html:208` (F11).
- §1's "the connection row badge and the tier badge are one sentence in two places" is false at 486:
  the row keeps `3 fields overridden`, the tier shortens to `3 overridden`.
- Board C's note ("the badge rail … is allowed to wrap rather than truncate") is contradicted by the 486
  board, where the rail is absent (F10).

---

## 9. The single biggest opportunity

**Give the connection row a primary activation and the capability rail a quieter voice.** Those two
changes turn the editor from "a thing you reach through a menu, that greets you with four red badges"
into "the thing this pane is about." Everything else in the set is already at a standard I would ship.

---

## 10. Instrument coverage table

| # | Instrument | Status |
| - | - | - |
| 1 | `pnpm snap --file` render, `--full` + per-board viewport | **RAN** — 3 full-page shots + targeted board shots. Runs `…-3400176-…`, `…-3400988-…`, `…-3401626-…`, `…-3413764-…` |
| 2 | `--design-audit` desktop | **RAN** — `list` at 1400×1000 and 1400×4400 (`population-verdict=complete`, 93 findings, 48 triaged as drawing artifacts); `model-roles`; `editor` |
| 3 | `--design-audit --mobile` (coarse pointer) | **RAN** — all three; `list` 14/14 tap-affected, `editor` 41/41, `model-roles` 0 candidates. `pointer=coarse` confirmed on the RESULT line |
| 4 | `--contrast` on real (undimmed) elements | **RAN** — 24 targets across 3 mocks, 23 verdicts all PASS (6.58–17.14:1), 1 off-screen NO VERDICT |
| 5 | `--map` (selector/accessible-name atlas) | **RAN** — all three; this is where F1, F5 and the switch/field gaps came from |
| 6 | Keyboard walk (`--key Tab` × N + focus `--eval`) | **RAN** — 16 stops on `editor`, 12 on `list`. `fv=true` and a 2px ember outline at every stop |
| 7 | Overflow / fit census at both widths | **RAN** — `cb-editor-fit`: 7 frames, 0 bleed, 0 unplanned scroll |
| 8 | Width-sweep for the stated crossover (range property) | **RAN** — 900→380px in 4px steps; crossover 532/528px body, 490px content |
| 9 | Copy-string audit against rendered innerText | **RAN** — 42/42 present; `cb-mocks-sideeye-copy.sh` over `--text` |
| 10 | Typeface-fidelity probe | **RAN** — `cb-list-font`; Geist resolved (797.13 vs 878.28px control) |
| 11 | The PNGs, actually read | **RAN** — 5 list strips, 9 editor strips, 5 roles strips, plus 1 re-shot board |
| 12 | Appearance presets (`--appearance-preset`) | **SKIPPED — instrument refuses on `--file`** (a static file makes no settings request). N/A for a mock |
| 13 | Theme arms (`--theme Light` / `none`) | **SKIPPED — instrument refuses on `--file`**, receipt quoted in §6.6. The light-theme reading of this pane is owed at step 9 |
| 14 | `--motion` / `--perf` / `__orb` | **SKIPPED — no motion, no app bridge.** Three static documents; `document.fonts.size=0`, no `@media`, no transitions under review |
| 15 | `--lighthouse` | **SKIPPED — axe over a board-collage page would report the collage**, the same false class §2 documents for design-audit. Owed on the built pane |
| 16 | `--matrix` | **SKIPPED — requires `--isolated`/`--dirty`/`--ref`**; not available for `--file` |
| 17 | Pane-state arms (list collapsed / context hidden) | **N/A** — the mock simulates exactly the two pane states §5.3a names (870 closed, 486 open) as fixed frames |
| 18 | Retained-section inventory (`--map --include-hidden`) | **N/A** — no React Activity; `dom-retained-hidden=8` is the mock's own `<style>`/head nodes |
