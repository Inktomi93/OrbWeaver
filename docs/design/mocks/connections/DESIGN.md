---
kind: design
status: active
updated: 2026-09-20
---

# The Connections pane — the step-3b mocks

> **What this is.** The three drawings `docs/design/orbweaver-inference-package.md` §13 step **3b** requires
> BEFORE step 4 freezes the schema and step 9 builds the client. §5.3a is the spec and its copy is law; the
> layout here is the proposal. A drawing is never law — where a mock and a ruling disagree, the ruling wins.

| File | Boards | What it decides |
| - | - | - |
| `list.html` | A 870px list · B the row menu · C confirmed remove · D 486px · E the copy this set does not otherwise draw · F the delta | whether a list of user-owned rows inside a settings body collides with shell anatomy; where the three no-defaults actions live; the row's primary activation vs its overflow menu |
| `editor.html` | A 870px default · B Advanced expanded · C Diagnostics expanded · D/E/F 486px (default · Advanced · **Diagnostics**) · G the grouped picker + the subscription arm · H the delta | whether the editor fits the settings body at 486px with the context panel open; the `modelListed: false` copy; the read-only-with-per-field-Override shape of "Endpoint quirks"; the inferred-kind verdict; the grouped provider picker |
| `model-roles.html` | A 870px six rows · B the inline background refusal · C 486px · D the status dot · E the delta | what the per-role status dot means with badges + reachability; the renamed Utility row and its three requirement badges; the four arms of the persisted-resolve readout |

**870 and 486 are taken as given** from §13 step 3b — the measured settings-body widths with the context panel
closed and open. This set renders at them; it does not re-derive them.

**These are `--file` mocks, not Design Canvas sources.** Each is a standalone page with an inline `<style>`
block and no template syntax, so `pnpm snap --file docs/design/mocks/connections/<name>.html --viewport WxH [--full]` renders it and the whole instrument battery (`--design-audit`, `--contrast`, `--mobile`, a keyboard
walk) drives it exactly as it would a live route. All three render with zero console messages and zero page
errors. Excluded from biome with the rest of `docs/design/mocks` — a drawing's inline-style density is the
point.

## 1. What only a render answered (§5.3a's own list)

**Does the editor fit the settings body at 486px with the context panel open? YES — by construction, not by
squeezing, and MEASURED (zero horizontal bleed and zero unplanned scroll in all eight body frames, at both
widths, probe proven against a planted 900px control).** The editor is one column at both widths and the
disclosure tiers do the work: the default state is **four fields** and one verdict line at 870 AND at 486,
because the two heavy tiers are collapsed and collapsing is width-independent.

**FIVE things reflow, each of them now DRAWN** (`editor.html`, the note under Board F — an earlier revision of
this document claimed three, counted two of them as one, and left the last two undrawn because Diagnostics was
collapsed in BOTH 486 boards, i.e. the tier holding the editor's two widest elements was answered by CSS no
board exercised):

1. the resolved-fact ROW stacks — mono key on its own line, value + source, a right-aligned Override line
   (Board E);
2. the EXTRAS key/value pair stacks, which is why the grid labels each field in place at 486 instead of carrying
   column headers — a column header cannot survive a column that stacks (Board F);
3. the two-up transport pair goes one-up at its `flex: 1 1 240px` crossover of **490px of content**, which 486
   is already below (Board F). The number is SWEPT, not point-sampled: 900→380px in 4px steps, side-by-side down
   to a 532px body, one-up at 528px. It read 498 here before anyone measured it;
4. the capability badge rail truncates **greens first** — what the connection CAN do, then "…and N more it
   can't serve" (Board D);
5. the tier count badge shortens (`3 fields overridden` → `3 overridden`) so the tier header holds chevron +
   title + badge on one line.

**A collapsed tier keeps its kicker summary at 486**, abbreviated (`vLLM · 127.0.0.1:8000` rather than the 870
form with the model), truncating rather than pushing, and dropped on a tier that carries a count badge — the
badge is the denser summary. 486 is the width WITH the context panel open, i.e. where a user is comparing this
pane against a room; a collapsed tier that is a bare word and a chevron is exactly the wrong thing there.

**No copy is cut at 486.** A row gloss WRAPS; it does not lose its second sentence. An earlier revision of the
set shortened three glosses at this width and stated no rule for it, and the worst of the three dropped
*"Rooms never override this: a turn always runs on the connection of whoever triggered it"* — the F20 sentence
that corrects a false mental model, removed exactly where the user is most likely to be mid-task. If a narrower
width ever forces a cut, the rule is written down first and that sentence is exempt from it.

**Does a list of user-owned rows inside a settings body collide with shell anatomy? NO, under four rules**
(`list.html`, the note under Board A): the row is flat inside the section — no card-in-a-card, no leading
selection stripe, both of which are LIST-PANE anatomy and read as a second nav inside a settings body; the
section header owns exactly one action and the row owns exactly one, so there are never two competing trailing
actions on a line — but the row also carries a row-level PRIMARY, because on a pane whose noun is "things you
edit" the editor must not be the fifth item of an overflow menu: the identity block itself (name + meta) is a
button named `Edit <the connection>`, and `Edit` therefore leaves the kebab. It WRAPS that text rather than
being an `inset: 0` overlay over the row — a stretched link covers the row's own name and meta 100%, so the
thing a user points at stops being the thing under the pointer (measured: `--design-audit --mobile` reported
exactly that as P1 `obscured-target` on the first cut of this fix). The badge rail stays outside the button,
because a badge is a status and not a door; the row's only inline control is the background
switch, because the Model-roles refusal sends users here to find it; and nothing in the row links out to another
shelf.

**Every control inherits the primitives' COARSE-POINTER hit floor, and the set DRAWS it rather than asserting
it.** The visible boxes are the fine-pointer ones (a 32×32 kebab, a 34px button, a 48×32 switch track) because
that is what a mouse user sees. Under a coarse pointer `--spacing-touch-target` resolves to 44px and every
control lifts its hit area to that square through a centred `::before`, exactly as
`packages/ui/src/lib/selection-control.ts`'s `TOUCH_TARGET_PSEUDO` does for every shipped selection control;
form controls carry the floor on their own pointer-conditional box; the Switch track grows to its
pointer-conditional 64×44 (`spacing.switch-track` / `switch-track-height`). Step 9 gets all of this for free by
composing `@orb/ui` primitives — the reason it is written into the drawing is that a mock which silently draws
sub-floor geometry is a mock a builder copies AS GEOMETRY, and the first revision of this set measured 100% of
its candidates below the floor (14/14 on `list`, 41/41 on `editor`, worst short side 18px) with nothing in the
prose to say the real thing would be different. The `@media (pointer: …)` blocks that carry this are the ONLY
media queries in the set; the WIDTH adaptation mechanism is still undecided (see "What the set cannot answer").

**PRODUCT type sits on the ramp.** Badges and tier count badges are `text.micro` at 10.5px, not the 10px they
were drawn at, and the picker's group headings are 10.5px rather than 9.5px. Board chrome — `.plabel`,
`.delta th`, the `today/changed/new` pills, the Board-E mini kickers — keeps its own smaller scale because it is
scaffolding a mock reader looks at, not a surface a user looks at.

**The fit claims depend on a host-installed Geist.** All three files declare `font-family: Geist` with **no
`@font-face`**, so they inherit whatever the host has. On a box with Geist the measurements above are taken in
the right face (`"Claude subscription"` at 100px measures 797.13px in Geist vs 878.28px in Arial); on a box
without it every string is about 10% wider and the 486 claims get correspondingly tighter. Either add a webfont
`@font-face` or read these numbers as conditional on the face — they are stated here rather than discovered by
the next reader.

**`modelListed: false`** renders §5.3a's sentence verbatim, as a persistent warning notice UNDER the Model field
— where the decision was made — with a "Check the list again" action inside the notice. It ships today as a
subtitle clause on the list row (`typed model id — sent as-is`); the mock keeps a short badge on the row (`Model
not in list`) and gives the full sentence one home, in the editor.

**"Endpoint quirks" is read-only with one Override per field**, and it shares ONE row grammar with "What this
server accepts": mono key · resolved value + source line · one Override button. An overridden row changes
colour, restates the value it replaced in the source line, and swaps Override for Reset — the thing you
overrode is never hidden by the override. The two blocks differ in vocabulary on purpose: capability gets plain
words (`window` → *context window*), a quirk keeps the server's own (`prefill: continue-final-message`),
because the one block whose purpose is matching a server's documentation must be matchable against it.

**But that rationale reaches the VALUE, not the KEY — the rule is now stated exactly.** A quirk key stays RAW
only when that exact string is the wire's; otherwise it is written in plain words and the wire's string stays
where it always was, in the value. An earlier revision rendered seven raw camelCase identifiers
(`prefillSuppressesThinking`, `reasoningKeys`, `rerankPath`, `strictJson`, …) and justified them with
matchability — which those exact rows falsify, since they are our own `features` schema's TypeScript property
names and no server's documentation contains them. So `prefill` survives verbatim (it is §5.3a's worked example
and a real wire technique) over its unchanged `continue-final-message`; `reasoningKeys` becomes **reasoning
fields** over its unchanged `reasoning, reasoning_content`, which is the string a reader actually greps a
server's docs for. Nothing matchable was lost and seven schema identifiers left the user surface — which is what
§5.3a's Words paragraph asks for (`declared`/`features`/`extras`/`transport` all get pane names for the same
reason). **§5.3a is owed a one-line amendment naming this rule**, because its single worked example is the most
readable key in the set and the spec therefore never confronts the case.

**The inferred-kind verdict is a SENTENCE with an inline change control**, never a bare select: a "what is this
model for?" combobox asks the user a question the system already has an opinion about, and the three options are
unguessable before you see the guess. The gloss under it discloses that nothing else on the page depends on the
guess, so being wrong here is cheap.

**The grouped provider picker** is the four `auth` kinds, because that grouping answers the question the user is
actually asking — *what am I about to be asked for*: a key, a URL, a sign-in, or nothing. Nine built-in rows in
four groups; a plugin provider joins the group its own `auth` names, so a fifth heading can never appear by
accident. An unavailable row renders DISABLED with its reason as the gloss, never hidden.

**The editor's capability rail signals *can't serve* in MUTED, never in destructive red, and with the same
✓/✗ glyph grammar the Model-roles `Needs:` rail already uses.** Destructive red means *something is wrong*; a
chat model that cannot embed is not wrong, it is a normal property of every chat model in existence. The first
revision drew four red pills out of six on a healthy connection, which is a wall of red about nothing
actionable and spends the pane's scarcest colour on its least actionable information. Red stays reserved for a
BOUND role that has actually broken. The 486 truncation keeps the greens and summarises the rest for the same
reason — hiding two of four reds while showing the other two taught nothing. **§5.3a is owed a one-line ruling
here too**: it puts the task-requirement badges in the Purpose tier without saying how a *cannot serve* verdict
is signalled, and it should not be red.

**The per-role status dot has ONE axis: would a turn run** (`model-roles.html` Board D). Green = running; amber =
set but not running, with the cause in the readout sentence; a grey RING = not set (a ring, not a red disc,
because an unset optional role is a choice). A failed requirement is deliberately NOT the dot — a bound model
that can't read images still runs, and two of the Utility slot's three consumers work; colouring the dot for
that would say the role is broken when it is partly working, and could not say which part. Every state is fully
readable with the dot removed.

## 2. Decisions this set makes that §5.3a left open

1. **Task badges on a connection row use the ROLE labels.** `task` is SEALED, so the badge text is the
   Model-roles label. Today's shipped row renders `{task}` raw (`summarize`, `generateImage`, `imageEmbed`) —
   a vocabulary defect, fixed in step 9. The rail caps at two roles + `+N` at 486 and keeps the non-role badges
   (`3 fields overridden`, `Model not in list`), which carry a condition rather than a capability.
2. **The three no-defaults actions live in a row MENU**, not as row buttons. The sweep action writes up to six
   bindings and is the pane's most consequential and least frequent act; a button on every row makes the loudest
   affordance the rarest one. The menu also gives the action room for the gloss that NAMES the roles it will
   write — the undo is knowable before the click, which matters when there is no default to fall back to.
   **`Edit` is NOT in that menu.** The row itself is the editor door (a `button` WRAPPING the identity block's
   name and meta, named `Edit <the connection>`), so the menu holds only the three acts that are not "open
   this thing": the two survivability actions and Remove. Putting the editor three interactions deep — hover the
   row, find the kebab, open it, skip past two rare actions — is what the menu's own argument does NOT justify.
3. **Confirmed remove keeps the house `ConfirmDialog`; only its description changes** — the ROLE COUNT and
   names, plus the fact the credential survives. An earlier draft of Board C put the confirm inline in the row;
   naming the roles in the description answers the same objection without replacing a shared primitive.
4. **The Advanced tier's count badge reads `3 fields overridden`** — §5.3a's own
   `declared_overrides_measured` string, so the connection row badge and the tier badge are one sentence in two
   places. Diagnostics reads `2 set`, because extras and a transport map are additions, not overrides of
   anything. A tier with nothing in it shows NO badge — a `0` badge is a number you must read to learn nothing.
5. **The background refusal is stated twice and they are not duplicates.** In the picker it is the option's
   disabled reason (which `bindRefusal` already returns); in the row it is the REPAIR — the same sentence plus
   the switch that resolves it, because §5.3a makes the slot the first enforcement point and a refusal with no
   adjacent remedy sends the user hunting for a switch nobody named.
6. **A refusal and a partial do not merge.** Background-work-off blocks the binding; a missing `image input`
   clause is legal and skips one of three consumers. One warning for both would make a fixable block look
   unfixable.
7. **"Saved keys" carries two real CONTROLS, and the count is the only thing left in the meta line.** §5.3a
   writes the verbs into the reuse string — *"used by 3 connections · replace · revoke"* — and the render proves
   a mono grey span cannot carry them: no focus target, no accessible name, no hover affordance, rendering in
   the identical face as the connection rows' `OpenRouter · anthropic/claude-opus-5` two rows above, i.e. as
   metadata, which is what it is. `Replace` and `Revoke` become buttons NAMED WITH THEIR SUBJECT (`Revoke the
   OpenRouter "work" key`) because in a list of keys the bare verb names nothing, and `Revoke` opens the house
   `ConfirmDialog` — a key is shared across connections, so its description names the count the same way Board C
   does for a connection. **§5.3a is owed the correction**: a "read-only reuse view" whose two verbs are
   *replace* and *revoke* is not read-only.
8. **The resolve readout has FOUR arms** — see §3.

## 3. The resolve readout: FOUR arms; the first two keyed on draft-vs-persisted (orchestrator ruling, 2026-09-20)

Two arms were ruled. The render found four, and the two undocumented ones are the states the amber dot and the
grey ring depend on — so step 9 must not build two and let the other two fall back to a sentence that is false.
All four are drawn on `model-roles.html` Board A, each with its own class:

| # | Class | Condition | Sentence |
| - | - | - | - |
| 1 | `.readout.steady` | bound, and a turn would run on it | *A turn uses {X}.* |
| 2 | `.readout.drift` | draft ≠ persisted (info colour) | *Not applied yet — a turn still uses {X}.* |
| 3 | `.readout.none` | nothing bound (italic muted; dot is a ring) | *Nothing — no connection is set.* |
| 4 | `.readout.blocked` | bound, and a turn would NOT reach it (warning colour) | *Set, but not running — can't reach {host}.* |

Arm 4 repeats the dot's own accessible name word for word, which is what makes the amber dot decidable without
colour. It is deliberately **not** `.readout.steady`: the first revision put it there, so a fix lane restyling
the steady arm would silently have restyled the one arm that is the opposite of steady. Its wording changed too
— it read *"A turn uses nothing — Can't reach … — the server may be down."*, two stacked em-dash clauses in
which *"uses nothing"* parses for a beat as *uses \[the thing called] nothing*.

**{X} is the connection's LABEL, in the user's words** — the same string the picker 40px away shows. The first
revision rendered `openrouter · anthropic/claude-opus-5` beside a picker reading `OpenRouter · Claude Opus 5`:
the registry id and the raw model id against the label. The readout's entire job is COMPARISON (*is what a turn
uses the same as what I picked?*), and two vocabularies make that a translation exercise; it is also the exact
class §5.3a's Words paragraph exists to kill, since `provider` is a user-facing label and not a lowercase
registry id. The counter-argument — that the label is user-editable, so the ids are the honest truth about what
will run — does not survive §5.3a's own rule for labels: `label` auto-mints `<provider> · <model>` and is
**collision-suffixed**, so it identifies exactly one connection by construction. The machine ids stay where a
person goes when they want them, the editor's Essential tier. The value is therefore rendered in the UI face,
not mono; only arm 4's value (a host) is a machine string and keeps mono.

**The condition on arms 1–2 is draft-vs-persisted, NOT request-in-flight**, and that is load-bearing.
`tests/client/data/_ct-stories.tsx:690-696` documents the `createEntityMutation` `echo` seam on exactly this
pair: a `busDriven` write reconciles through the bus, so between its 200 and the bus tick the read still serves
the PRE-write row, and a surface computing its honesty from that read "calls a persisted selection unsaved for
as long as the tick is missing". `echo` closes that window without inventing a second truth source. The flat
"A turn uses {X}." was therefore not a simplification — it makes no divergence claim, so it cannot lie during
the window. §5.3a's sentence exists for the 2026-08-01 incident (two hours of a NULL `roleDefaults` under a
"Saved" chip), and with `echo` in place the divergence claim is safe again. Both arms, condition labelled.

## 4. Copy inventory — every §5.3a string, and the board that renders it

§13 step 3b: *"every §5.3a copy string exists in the mock, none says 'the pane says so'."*

| String (verbatim) | Rendered in |
| - | - |
| `This looks like a **chat & writing** model — change ▾` + *Chat & writing* / *Search vectors* / *Reranking search results* | `editor.html` A, D |
| `This model id wasn't in <host>'s list. It'll be sent as-is; if the server doesn't have it, turns will fail.` | `editor.html` A, D |
| `What this server accepts` · `Endpoint quirks` · `Extra request fields` · `Request & response shaping` | `editor.html` A (kickers), B, C |
| `prefill: continue-final-message` — from the vLLM provider row | `editor.html` B, E |
| `Hosted (key)` · `Your own server (URL)` · `Subscription` · `Built-in` | `editor.html` F |
| `The Claude runtime isn't installed on this server.` (the `runtime-missing` cause as a sentence) | `editor.html` F |
| `claude setup-token` + `run this on the machine you use Claude Code on` | `editor.html` F |
| `Utility model — summaries, structured extraction, captions` + `prose` · `structured JSON` · `image input` | `model-roles.html` A, B, C |
| `Not applied yet — a turn still uses …` | `model-roles.html` A, C |
| `This connection doesn't allow background work — turn it on to use it here.` | `model-roles.html` B |
| `allow background work on this connection` | `model-roles.html` B — **DELIBERATE, WITH CITE**: the rendered label is the subject-bearing `Allow background work on Claude subscription · Opus`; §5.3a's subject-less form appears only as a quotation inside Board E's delta table. A switch in a list of connections needs to name the one it writes |
| `Use this connection for everything it can serve` | `list.html` B |
| `Add another model on this key` | `list.html` B |
| `Saved keys` + `used by 3 connections` + the `replace` / `revoke` verbs as NAMED BUTTONS | `list.html` A — **DELIBERATE, WITH CITE**: §5.3a's string is split rather than rendered verbatim, because a metadata span cannot carry two destructive verbs (§2.7). The words survive; the punctuation does not |
| `3 fields overridden` (the `declared_overrides_measured` home — a row badge, NEVER the turn stream) | `list.html` A, D · `editor.html` A, B, C |
| `running on <your connection · model>` | `list.html` E |
| `showing what **chat · OpenRouter · Claude Opus 5** honours ▾` | `list.html` E |
| `pictures you make here live in this room` | `list.html` E |
| `Can't reach <host> — the server may be down.` (`endpoint-unreachable`, was `engine-down`) | `list.html` E · `editor.html` C, F. **No longer `model-roles.html` A** — that row now carries readout arm 4, which states the same cause in the dot's own words (*Set, but not running — can't reach {host}.*) rather than repeating the notice sentence inside a role row |

**Deliberately absent, and each for a stated reason:**

- **No `api` control anywhere.** `showsApiControl` is `apis.length > 1` and after `1911bbcdd` retired the
  `responses` api every built-in provider lists exactly one. Absent by DATA, not by omission.
- **No prefetch status.** §8.3's per-row `downloading/ready/failed` line was STRUCK by owner ruling; the
  prefetch tier gets no status surface.
- **No per-chat or per-room connection override, anywhere in the set.** F20: a room never binds a connection and
  neither does an rpg game.

## 5. What this set structurally CANNOT answer (stated gaps, not open questions)

Every interactive element except `<button>`s is drawn as a styled `div`. That is the right economy for a
drawing, but it means step 9 must not read silence here as a decision:

1. **The WIDTH adaptation mechanism is undecided.** The three files contain zero `@container` rules and their
   only `@media` queries are the pointer ones §1 describes. The 870/486 arms are hand-authored boards plus a
   handful of `.body.w486 …` overrides. House law (the reading-surface / container model) requires
   `@container`; this set decides the two END STATES and says nothing about the container name or the
   breakpoint. Name them before step 9 picks one.
2. **The disclosure tiers have no a11y contract here.** `.tierhead` is a `div` with `cursor: pointer` — no
   `aria-expanded`, no button role, no keyboard operation. It is the mechanism §5.3a specifies and the single
   most likely thing to be copied verbatim: step 9 owes it `<button aria-expanded>`.
3. **The switches are `role="img"`** — non-operable, no `aria-checked`, absent from the tab order. So "is the
   row's switch in the right focus position" is unanswered, and `model-roles.html` has ZERO tappable
   candidates, which is why its coarse-pointer arm measures an honest empty population rather than a clean
   result. Step 9 owes `role="switch"` + `aria-checked`.
4. **Fields are not focusable**, so focus ORDER through the editor is unmeasured past its buttons. The extras
   grid and the subscription token field are labelled VISUALLY here (a `Field`/`Value` header at 870, per-field
   labels at 486, a `Token` label on the paste input); a real `<label for>` is step 9's.
5. **A light or high-contrast reading is unproven.** `--theme` / `--appearance-*` REFUSE on `--file` ("a static
   file makes no settings request"), and the mocks carry no `prefers-color-scheme` / `prefers-contrast` /
   `prefers-reduced-motion` block, so those arms would be byte-identical. The files hardcode the Hearth dark
   values. The light-theme reading is owed on the BUILT pane at step 9.
6. **A `--design-audit` over these files reports the DRAWING.** A multi-board page produces a P0/P1 set
   dominated by how a mock is drawn: deliberately dimmed demo rows (`opacity: .35`) read as contrast failures
   and carry a `dimmed α…` tag; a drawn modal scrim reads as `obscured-target` and `text-over-art`; the board
   frame reads as `nested-card`; repeated boards read as `duplicate-action-door`; the board prose reads as
   `line-length` / `all-caps-body`. On the 2026-09-20 review 48 of 93 findings were artifacts of exactly this.
   Triage by re-measuring the same selectors on the UNDIMMED board with `--contrast`, and read the NO VERDICT
   block's named cause, before filing anything.

## 6. Corrections this set has taken, and the ones it OWES §5.3a

**Taken 2026-09-20**, after the driven review at `docs/reviews/side-eye/2026-09-20-connections-pane-step-3b-mocks.md`:
every `Override`/`Reset` carries its field as its accessible name (14 + 4 buttons all named the bare verb); the
coarse-pointer hit floor is drawn rather than assumed; the readout's four arms are named and the blocked arm has
its own class and sentence; the readout speaks the picker's vocabulary; Saved keys carries controls instead of
inert verbs; the provider picker has real group semantics and an explicit listbox name; the connection row has a
primary activation; the capability rail stops saying "broken" about a healthy connection; the quirks key column
stops leaking seven schema identifiers; the `+0` badge is gone (§2.4 stated the rule and the set broke it two
files away); the 486 arm neither drops teaching copy nor leaves Diagnostics undrawn; and the crossover number is
the measured 490, not the asserted 498.

**OWED to `docs/design/orbweaver-inference-package.md` §5.3a** — the orchestrator owns those edits; this set
does not make them:

1. *"Saved keys … read-only reuse view ('used by 3 connections · replace · revoke')"* — two consequential verbs
   in a metadata string, which the render proves that string cannot carry. Respell as a count plus two explicit
   actions, and give `revoke` a confirm (keys are shared across connections).
2. *"a user who has touched nothing sees three fields and a 'how it's used' line"* — the field set that
   paragraph specifies plus the `label` the NEXT paragraph mandates is four. Say four, or tier `label` down.
3. **Endpoint quirks** — name which keys stay raw. The spec's single worked example (`prefill:
   continue-final-message`) is the most readable key in the set, so the spec never confronts the six that are
   our own camelCase property names, and its "matchable against the server's documentation" rationale does not
   reach them.
4. **The readout** — §5.3a specifies the divergence sentence only; the surface needs four arms, because unset
   and unreachable are real states with real sentences (§3).
5. **The task-requirement badges** — §5.3a puts them in the Purpose tier without saying how a *cannot serve*
   verdict is signalled. A one-line ruling is owed, and it should not be destructive red.

## 7. Premise notes — where §5.3a's citations are stale on today's tree

Reported to the orchestrator 2026-09-20 and confirmed; it owns the `orbweaver-inference-package.md` edits.

1. **`role-slot-row.tsx:123-152` does not exist.** The readout lives inline in
   `connections-roles-section.tsx:97` and its string is `A turn uses {…}.`, not §5.3a's sentence. Resolved by
   §3 above.
2. **`preset/components/custom-parameters-editor.tsx` (and its `SCOPE_GLOSS:29`) does not exist** — `146f71cd5`
   deleted it. Step 9 **builds** the Extras row editor rather than moving one, so `editor.html` Board C draws
   all three properties explicitly (row identity by id · unfinished rows held through autosave · a per-belt-key
   gloss at AUTHORING time) and the `SCOPE_GLOSS` copy is written fresh from the transport. The belt keys are
   the eight at `packages/contracts/src/inference/features.ts:108`.
3. **`connections-nav.ts`'s two F20-false sentences are already gone** — today's `:41` reads "Rooms never
   override this — a turn always runs on the connection of whoever triggered it." verify9 M6 is discharged.
4. **§13 step 3b's "mocks BEFORE the client is built" is partly overtaken.** `146f71cd5` landed the connection
   list, Saved keys, the Model-roles rows, the grouped picker and `showsApiControl`. So mocks 1 and 3 are drawn
   as a **DIFF** — each has a delta board marking every element `today` / `changed` / `new` — and step 9 gets a
   delta instead of a re-implementation brief. Mock 2 is entirely new: there is no editor for a saved
   connection on the tree, only the one-shot `AddConnectionDialog`.
