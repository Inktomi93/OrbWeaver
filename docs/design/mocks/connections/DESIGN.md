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
| `list.html` | A 870px list · B the row menu · C confirmed remove · D 486px · E the copy this set does not otherwise draw · F the delta | whether a list of user-owned rows inside a settings body collides with shell anatomy; where the three no-defaults actions live |
| `editor.html` | A 870px default · B Advanced expanded · C Diagnostics expanded · D+E 486px · F the grouped picker + the subscription arm · G the delta | whether the editor fits the settings body at 486px with the context panel open; the `modelListed: false` copy; the read-only-with-per-field-Override shape of "Endpoint quirks"; the inferred-kind verdict; the grouped provider picker |
| `model-roles.html` | A 870px six rows · B the inline background refusal · C 486px · D the status dot · E the delta | what the per-role status dot means with badges + reachability; the renamed Utility row and its three requirement badges; the two arms of the persisted-resolve readout |

**870 and 486 are taken as given** from §13 step 3b — the measured settings-body widths with the context panel
closed and open. This set renders at them; it does not re-derive them.

**These are `--file` mocks, not Design Canvas sources.** Each is a standalone page with an inline `<style>`
block and no template syntax, so `pnpm snap --file docs/design/mocks/connections/<name>.html --viewport WxH [--full]` renders it and the whole instrument battery (`--design-audit`, `--contrast`, `--mobile`, a keyboard
walk) drives it exactly as it would a live route. All three render with zero console messages and zero page
errors. Excluded from biome with the rest of `docs/design/mocks` — a drawing's inline-style density is the
point.

## 1. What only a render answered (§5.3a's own list)

**Does the editor fit the settings body at 486px with the context panel open? YES — by construction, not by
squeezing.** The editor is one column at both widths and the disclosure tiers do the work: the default state is
three fields and one verdict line at 870 AND at 486, because the two heavy tiers are collapsed and collapsing is
width-independent. Exactly three things reflow (`editor.html`, the note under Board E): the resolved-fact ROW
stacks (mono key on its own line, value + source, a right-aligned Override line); the two-up transport pair goes
one-up at its `flex: 1 1 240px` crossover of 498px of content, which 486 is already below; and the capability
badge rail truncates with an "…and N more it can't serve" line. The tier count badge shortens
(`3 fields overridden` → `3 overridden`) so the tier header holds chevron + title + badge on one line.

**Does a list of user-owned rows inside a settings body collide with shell anatomy? NO, under four rules**
(`list.html`, the note under Board A): the row is flat inside the section — no card-in-a-card, no leading
selection stripe, both of which are LIST-PANE anatomy and read as a second nav inside a settings body; the
section header owns exactly one action and the row owns exactly one, so there are never two competing trailing
actions on a line; the row's only inline control is the background switch, because the Model-roles refusal sends
users here to find it; and nothing in the row links out to another shelf.

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

**The inferred-kind verdict is a SENTENCE with an inline change control**, never a bare select: a "what is this
model for?" combobox asks the user a question the system already has an opinion about, and the three options are
unguessable before you see the guess. The gloss under it discloses that nothing else on the page depends on the
guess, so being wrong here is cheap.

**The grouped provider picker** is the four `auth` kinds, because that grouping answers the question the user is
actually asking — *what am I about to be asked for*: a key, a URL, a sign-in, or nothing. Nine built-in rows in
four groups; a plugin provider joins the group its own `auth` names, so a fifth heading can never appear by
accident. An unavailable row renders DISABLED with its reason as the gloss, never hidden.

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
7. **The resolve readout has TWO arms** — see §3.

## 3. The resolve readout: two arms, keyed on draft-vs-persisted (orchestrator ruling, 2026-09-20)

- Steady state (the picker's selection equals the persisted read): **"A turn uses {X}."** — the string that
  ships at `connections-roles-section.tsx:97`.
- Divergence (draft ≠ persisted): **"Not applied yet — a turn still uses {X}."** — §5.3a's string, in the info
  colour.

**The condition is draft-vs-persisted, NOT request-in-flight**, and that is load-bearing.
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
| `This connection doesn't allow background work — turn it on to use it here.` + `allow background work on this connection` | `model-roles.html` B |
| `Use this connection for everything it can serve` | `list.html` B |
| `Add another model on this key` | `list.html` B |
| `Saved keys` + `used by 3 connections · replace · revoke` | `list.html` A |
| `3 fields overridden` (the `declared_overrides_measured` home — a row badge, NEVER the turn stream) | `list.html` A, D · `editor.html` A, B, C |
| `running on <your connection · model>` | `list.html` E |
| `showing what **chat · OpenRouter · Claude Opus 5** honours ▾` | `list.html` E |
| `pictures you make here live in this room` | `list.html` E |
| `Can't reach <host> — the server may be down.` (`endpoint-unreachable`, was `engine-down`) | `list.html` E · `editor.html` C · `model-roles.html` A |

**Deliberately absent, and each for a stated reason:**

- **No `api` control anywhere.** `showsApiControl` is `apis.length > 1` and after `1911bbcdd` retired the
  `responses` api every built-in provider lists exactly one. Absent by DATA, not by omission.
- **No prefetch status.** §8.3's per-row `downloading/ready/failed` line was STRUCK by owner ruling; the
  prefetch tier gets no status surface.
- **No per-chat or per-room connection override, anywhere in the set.** F20: a room never binds a connection and
  neither does an rpg game.

## 5. Premise notes — where §5.3a's citations are stale on today's tree

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
