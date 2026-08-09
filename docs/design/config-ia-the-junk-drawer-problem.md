# Config IA — the junk-drawer problem, and the tag model that falls out of it

> **Status: DESIGN THINKING, owner-driven (2026-08-08, live app tour). No build. No lane.** Captured
> verbatim from the owner touring the Configuration surface and reacting. This doc exists so the
> diagnosis and the resolution are not lost — the docs situation is thin and this thinking was earned
> by touring, not by planning. It is the *why* and the *direction*; it is not a build spec. Where a
> question is still open it says so.

---

## 0. The trigger

The owner opened **Configuration** (rail section: Tags / Regex Scripts / World Info) and it "made my
brain itch." Touring it live produced a full diagnosis. The screens that drove it:

- Config landing, nothing selected: the LEFT list shows Tags/Regex/World-Info with counts + create
  buttons; the RIGHT "The parts every chat is built from" card shows the **same three** again with
  descriptions + create buttons. "New book" appears **three times** on one screen (left band `+`,
  left empty-slot button, right card button).
- A tag selected, CONTEXT pane opened: the far-right pane reads **"Nothing to attach — a tag applies
  wherever you put it… its usage across your library is on the left."** A pane apologizing for its
  own existence.

---

## 1. The root: Config is a junk drawer

**Config feels bad because it is defined by EXCLUSION, not by a concept.** The owner's own words for
what he wanted it to be: *"the place where things that don't get a full nav rail live."* That is the
anti-pattern. A home defined by "everything else" can never feel like one home for one concept,
because it is the home for **no** concept. It is the single place in a "one home per concept" shop
that violates the law at the meta level — which is why it itches worse than the other overlaps
(Chats-vs-Characters, Settings-vs-Config): those each own a concept and merely overlap at the edges;
Config owns nothing, so it can only ever feel like a shelf.

**Corollary — the fix is not "make the config screen prettier."** The fix is to ask, per item in the
drawer: *does this even belong here, or did it get filed here because it had no rail?* Once the drawer
is sorted by concept, the screen problem dissolves.

## 2. The two tests for "does this belong in a section?"

Both emerged from the tour and both are keepers:

### 2.1 The "can it fill CONTEXT?" test

The shell anatomy is **RAIL | LIST | CONTENT | CONTEXT** (context follows content; §14 shell law). A
concept that genuinely belongs in a section fills all of it: a *character* → the roster (LIST) → the
card (CONTENT) → its attached books/personas (CONTEXT). A **tag** fills LIST (the list of tags) and
CONTENT (a small editor) and then **CONTEXT is dead** — "Nothing to attach." **A concept that cannot
honestly fill CONTEXT does not belong in a section**; forcing it in produces a pane narrating its own
emptiness. Tags fail this test. World-info and regex might pass it (see §5).

### 2.2 The "thing vs facet" test (the sharper one)

- A **thing** is an authored object you own and visit (a character, a preset, a world-book, a regex
  script). Things earn homes.
- A **facet** is a property *of* things, cross-cutting many of them (a tag). Facets do **not** get a
  destination — they live **on** the things they touch and are seen **through** overview surfaces.

Tags are the only pure **facet** in the Config drawer. That is exactly why they itched worst, and why
they are the first thing to move out.

## 3. The tag model (fully designed by the tour — this is the load-bearing output)

A tag is a **facet of the things it applies to** (chats, characters, personas, presets, books). It
has **four jobs**, and each belongs in a different home. Getting them into one section was the
mistake.

| Job | Where it lives | Status today |
| - | - | - |
| **Apply** a tag to a thing | on the thing (character/chat/persona/etc.) | EXISTS |
| **Filter / group** a library by tag | in that library's list (the cross-cutting view) | EXISTS (`groupByTag` in the character library) |
| **Edit ONE** tag (name, colour, folder-type, merge, delete) | **in place** — a popover summoned from any tag chip, and from the filter picker | the editor EXISTS and is GOOD (see §4); it is in the WRONG HOME (a config section) |
| **Understand the WHOLE** tag landscape (taxonomy, usage stats, sprawl, bulk cleanup) | **Corpus** (the "understand your body of content" surface) — an OVERVIEW, not an admin chore | not built as such; today it is the config list, in the wrong FRAME (see §4.2) |

**Consequences of this model:**

- **Tags leave the nav rail entirely.** They were never a destination-concept; they are a facet with
  four jobs, each now homed where it belongs. The dead CONTEXT pane cannot exist once tags are not
  forced into a section.
- **The tag's home is the tag itself.** You edit a tag *in place*, from any chip, anywhere it
  appears — the one-home rule taken literally: the concept IS its home; you don't drive to a DMV for
  it. (Precedent shape: the app already puts affordances on the thing, not on a management screen.)
- **There is still ONE legitimate list of all tags — but it is an OVERVIEW, not an admin section.**
  See §4.2.

## 4. Two facts the tour corrected

### 4.1 The tag editor is already good — the power exists, it is just buried

The tag CONTENT editor (seen live) already has: **Name · Background colour · Text colour · Folder
type** ("whether this label also groups the library, and whether it opens by default") · **hide-chip
toggle** (still filters) · **Merge into…** · **Delete**. So "tags as colours" and "tags as folders" —
the two capabilities the owner *wished* for — are **already built.** The problem was never missing
power; it was that the power is buried in a junk-drawer section nobody visits, wearing a shell two
panes too big for it. **Do not rebuild the tag editor — relocate it** (into the in-place popover of
§3).

### 4.2 The same list changes MEANING with its FRAME

The identical list of 28 tags:

- In **Config**, it reads "administer these knobs" — a chore, a DMV, nothing to *do*. Useless-feeling.
- In **Corpus**, it reads "here is the skeleton of how your whole library is organised" — a **map**.
  Useful. What's load-bearing, where the sprawl is, which tags carry the taxonomy vs the \~20 one-use
  orphans. **Bulk cleanup falls out naturally** because you can finally see everything at once.

The list did not need to *do* more; it needed to live where seeing it *means* something. Corpus's job
is "understand your body of content," and tags are how that body is shaped — so a tag bird's-eye is
literally a corpus-level insight. (Confirm what Corpus holds today before committing the home — the
*instinct* is right regardless: the tag overview needs an **overview** frame, not a **config** frame.)

## 5. The rest of the drawer — apply the two tests

Sort every remaining Config resident by §2:

- **Tags** — a FACET, fails the CONTEXT test. **Leaves the rail** per §3. (Decided by the tour.)
- **Regex scripts** — a THING (authored object with a real editor + a live debugger context). Likely
  **passes** the CONTEXT test (a script → its body → the pipeline-debugger/where-it-runs context).
  May earn a home, or live under a "text pipeline" concept. **Open.**
- **World-Info books** — a THING you author *and* attach; a book has entries, entries have context.
  Likely **passes**. May be its own section or live attached to characters (books attach to
  characters). **Open.**
- **Presets** — already ruled standalone (C5). Not in scope here.

**The sorting key, stated once:** *facets leave (they live on things + get overviews in Corpus);
things stay only if they can honestly fill CONTEXT.* Anything that can't fill CONTEXT is either a
facet in disguise or a modal/utility, never a section.

## 6. The two naming/overlap itches (adjacent, recorded so they aren't re-derived)

### 6.1 Config vs Settings — a NAMING collision, maybe not a concept collision

"Configuration" and "Settings" are literal synonyms, so two of them itch by construction. But they
may own genuinely different concepts: **Settings = how the app BEHAVES** (connections, theme, admin,
defaults); **this "Config" pile = reusable CONTENT you author and attach** (scripts, books). If that
is the real line, the concepts are fine and **the NAME is the bug** — the config teaching copy
already calls it *"the parts every chat is built from,"* not "configuration." Whatever survives §5
wants a name that says *stuff you make* (Parts / Library / Building Blocks), not a synonym for the
knobs screen. **Open — depends on what survives §5.**

### 6.2 Chats vs Characters — a "library vs activity" axis

They overlap because you **browse** them the same way (two lists of cards you pick from). The
distinction that would resolve it: **characters are things you OWN (a library); chats are things you
are DOING (activity).** If the rail expressed that split cleanly the itch would ease. The board
already carries a parked "chars+chats one-glyph rail merge" owner item — this is the same itch. **A
separate axis from the Config problem; recorded so it isn't conflated with it.**

## 7. What is NOT decided here (honest boundary)

- The final home for **regex** and **world-info** (§5 open) — needs the CONTEXT test run against each
  with a populated surface, and a look at what "Corpus" and the character library can absorb.
- Whether **Config survives at all** as a (renamed) home for the *things* half, or fully dissolves.
- The **build** — none of this is a lane. It is the direction to build *toward* when Config is
  actually reworked. Start from this doc's conclusions instead of re-touring.

## 8. One-line summary for the board

**Config is a junk drawer (a home defined by exclusion). Sort it by thing-vs-facet: tags are a facet
— they leave the rail, their editor becomes an in-place popover, their bird's-eye lives in Corpus,
and the dead CONTEXT pane dies with the section. Regex/world-info are things — run the CONTEXT test on
each before deciding their home. "Config vs Settings" is a naming collision to resolve after the sort.**

## 9. Addendum (2026-08-09 — templates-in-settings finding + the registry lever)

Owner asked whether templates still live in Settings (memory of "a bunch in there"). Looked with
own eyes — the honest picture, so it isn't re-chased:

- **Prose / prompt-assembly templates: D132 is DONE.** They live ONLY in PRESETS —
  `features/preset/` (`TemplatesTab` `preset-structure-tabs.tsx:200`, `TemplateDrillIn`, the
  prompt-assembly templated markers). Zero prose templates in the settings feature.
- **What's still "in Settings" is the IMAGERY templates — a DIFFERENT concept, not a D132 leftover.**
  Contract `contracts/src/settings/index.ts:668` (`imagery.templates`: character/face/scenario/
  background + caption slots); UI is a chat-feature CONTRIBUTION the settings host renders
  (`features/chat/components/imagery-templates-section.tsx`, per `chat-behavior-pane.tsx:6`). These
  are image-generation prompt templates (imagery config), legitimately settings-homed — NOT the
  prompt-assembly templates D132 moved.
- **The itch is real but it's IA/naming, not a home violation:** two things called "templates" in
  two homes. Optional fix = rename the imagery side ("Image prompts" / "Portrait prompts") so
  "template" means one thing (Presets). Owner: **fine for now — imagery is functional (ugly), the
  Presets Templates section is getting unwieldy but functional.** Not a lane; a taste call for the
  revamp.

**Owner intent recorded (the direction, not a lane):** the Config panel is likely to be REVAMPED and
things relocated at some point. The thing that makes this cheap is that most surfaces are now
**REGISTRY-BASED** (settings-section contributions, home-tile contributors, the workloads/tuning
registries) — adding, removing, or RELOCATING a section is a registry edit at the composition door,
not a surgical move. So the §7 "when Config is actually reworked" build is de-risked: the sort this
doc prescribes (thing-vs-facet, tags→popover, regex/world-info CONTEXT test) can be executed as
registry re-homings rather than rewrites. Build toward this doc's conclusions when the revamp lands.
