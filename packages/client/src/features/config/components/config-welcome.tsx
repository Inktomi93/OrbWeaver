// The Configuration WELCOME — CONTENT with nothing active and no member selected (config-rail-spec.md §2
// C-8). Never null: a designed teaching frame plus one slot per registered collection, drawn from the
// contract fields the group band uses (`label` · `icon` · `useCount` · `create`) plus the two the band does
// NOT carry — the group's `description` and the collection's `preview` — so a fourth collection appears in
// both places from ONE door row (a `collection` config group, config-revamp-design.md §3.1).
//
// ═══ WHEN THIS PANE IS REACHED, AS OF #925 ══════════════════════════════════════════════════════════
//
// The ARRIVAL DEFAULT (owner amendment 2026-09-02, `config-list-surface.tsx`'s `useConfigArrivalDefault`)
// makes the first group active on arrival, so this is no longer the pane a reader LANDS on: it is the pane
// they come BACK to — the shell's mobile Back, a rail bounce, an arrival with the LIST pane collapsed. That
// is a change of traffic, not of purpose, and it is why the surface keeps its full teaching anatomy.
//
// ═══ VARIANT C · "THE HEARTH" (program #102, owner-picked 2026-08-16) ═══════════════════════════════
//
// WHAT IT REPLACED, and why (measured on the live app 2026-08-16, before):
//   - the pane is 917px wide; the welcome rendered in a 595px `mx-auto max-w-prose` column — 65% of the
//     pane used, ~160px of dead void down each side.
//   - the three launcher cards stopped at ~y=420 in a 752px pane: ~380px of void below the last card.
//   - the ramp topped out at the `Heading level={2}` title step. `--text-display` and `--text-headline`
//     existed in tokens.json and appeared NOWHERE on this surface.
// So: no centre cap, and the full six-step ramp, one step per role — display (masthead) · headline (a
// library's name) · body (the teaching line) · label (chips + the door) · micro (kickers, gloss).
//
// ═══ THE STATUS PARTITION IS DEAD (owner ruling 2026-09-02, #925 + #1043) ═══════════════════════════
//
// THIS PANE USED TO BE A TWO-COLUMN SPLIT: libraries with `count > 0` led in a `cols="lead"` track, and the
// ones at zero sat in a rail under a `<Section kicker="Not built yet">` band. The owner read that band on
// the regex slot as "the regex FEATURE isn't ready yet despite being finished" (#1043, 2026-09-01) — the
// words conflated the user's LIBRARY-CONTENT state with the app's FEATURE-BUILD state, and the ruling is
// that the CONTENT-side status region DIES: feature status belongs to the LIST (a genuinely unbuilt group is
// a greyed row there, whose CONTENT is the coming-soon body), and this pane says nothing about it.
//
// SO THE SPLIT WENT WITH THE BAND, because the split had no other job: `cols="lead"` + the two `:has()`
// collapse rules + the hide-while-settling census existed ONLY to segregate "not built" from "built". One
// auto-fit grid of equal slots, in canonical `(shelf, order, id)` order, is the whole layout now, and a
// collection's population changes what its slot SAYS, never where the surface files it.
//
// THE TWO RULED ANATOMIES SURVIVE INTACT as the slot's two arms — neither was ever about status:
//  · POPULATED keeps shedding the count and the create verb (owner ruling 2026-08-08, C7 arm 2 — the list
//    band carries both, beside the rows they act on) and pays for its promotion with `preview`: content the
//    collapsed band does NOT carry. Its affordance is the DOOR.
//  · EMPTY keeps COUNT(0) + CREATE (the 2026-08-03 "genuinely good teaching state" verdict, the cold
//    first-timer test): at zero the verb is the onboarding next step, not a restatement. `undefined` takes
//    the same arm — the slot sheds only what it KNOWS is duplicated, so a contribution with no count hook
//    keeps the only way into an empty library. And the empty arm is NOT A BOX (CD1): a name, a count and a
//    verb, never a border+radius+bg.
//
// WHAT DID *NOT* DIE WITH THE SPLIT: THE SETTLING CENSUS. Two `:has()` rules were about the TRACK COUNT
// (collapse to one column when a side is empty) and they went with the columns; `HIDE_WHILE_SETTLING` plus
// the zero-box `data-config-settling` marker is a different claim — the pane's FIRST paint of the hearth is
// its final geometry — and it is still load-bearing, because a slot whose count lands late swaps its arm
// (a create verb becomes a chip wall and a door) and that grows its row. Measured before, on the old split,
// as an 0.0283 CLS residue; the mechanism is unchanged and so is the CT that measures the browser's own
// layout-shift score across the counts landing.
//
// ═══ ONE FOCAL, AT EVERY CORPUS STATE (CD3) ═════════════════════════════════════════════════════════
//
// Exactly one element may carry the accent stripe and the rationed glow at rest, and it is the FIRST
// POPULATED slot. That used to be `first:` — true only while the lead column held populated slots alone.
// With one mixed grid the verdict is spelled as a sibling fact instead: every populated card carries the
// halo, and a populated card that HAS a populated sibling before it turns its own off. Still DOM order,
// still no parent census, still resolved in CSS over rendered DOM. Accent stays far under the 10% ceiling: a
// 1px ring and a bloom on ONE island, no fill, and every create verb is `secondary`, never primary.
//
// ═══ THE RULING FORK THIS BUILD SITS ON (stated, not smuggled) ══════════════════════════════════════
//
// This file's OWN header used to rule out the parent knowing every collection's count: "that switch needs
// every collection's count AT THE PARENT, and a count is an OWNER-supplied hook — reading N of them in a
// loop is exactly the rules-of-hooks violation the one-child-per-contribution shape exists to avoid."
// THE MECHANISM IS PRESERVED, THE SYMPTOM IS SATISFIED: the per-collection verdict lives in a CHILD, one
// instance per collection, whose hooks are called unconditionally in a fixed position. (It took TWO
// instances per collection while the two arms were two components in two columns; one grid needs one.)
//
// ═══ DEVIATIONS FROM THE MOCKUP, with receipts ══════════════════════════════════════════════════════
//
// NO `kicker-lead` "CONFIGURATION" over the masthead. The mock draws one (`config-c-hearth.html:194`),
// and it is drawn beside a list whose own head already says "Configuration" — measured on the approved
// 1280×800 PNG the two sit on the same line, 328px apart, and the rail's active tooltip is a third. That
// is the IA duplication the density spec excludes and #104 trimmed; the ramp does not need it.
//
// ONE VOICE, NOT TWO (the surviving half of the original deviation from empty-states.html frame 2): the
// mock switches the teaching copy on "are all counts zero". That switch is the parent census this file
// still does not do, and the sentence is never wrong for either reader.

import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Grid, Row, Stack, Surface } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { CollectionGroupDefinition, ConfigGroupRegistry } from "#state";
import { openConfigTo } from "#state";
import { CONFIG_WELCOME } from "../lib/config-copy.ts";
import { collectionGroups } from "../lib/order-groups.ts";
import { ConfigLibraryGlance } from "./config-library-glance.tsx";

export interface ConfigWelcomeProps {
  readonly groups: ConfigGroupRegistry;
}

/** The CD3 focal (see the header). The glow rides a ::before at the island's edge and the stripe an ::after
 *  inside it — `design-audit-checks.ts` classifies a chromatic glow on an element's OWN box-shadow as the
 *  generated-UI tell, and a pseudo-element is the sanctioned carrier. Neither ever sits behind reading text.
 *  `rounded-(--radius-card)` mirrors the form-tier island radius the Card resolves from `tiers.css`, so the
 *  halo tracks the edge it is a halo for; the literal `rounded-card` utility is the ELEVATED-family step the
 *  density A1 arm reserves for the sealed package. The stripe is an overlay rather than home's inline
 *  `border-inline-start`, because a border WIDTH cannot be gated on a selector.
 *
 *  THE RESTING GLOW IS 60%, NOT 30% (side-eye 2026-08-19, "under maximal the CD3 single-focal collapses").
 *
 *  THE ARITHMETIC, SOURCE-PINNED. `--shadow-glow` is `0 0 0 1px oklch(from var(--color-primary) … / 0.4)`
 *  plus an 18px bloom at 0.18 (`packages/ui/src/styles/theme.css`), so a pseudo at `opacity-30` painted its
 *  ring at an effective **0.12** alpha of the accent — the exact number the review measured. Meanwhile
 *  `appearance.enableThemeColorization` retints `--color-border` to `color-mix(… primary 22% …)`
 *  (`client/src/styles/globals.css`), so under that arm EVERY sibling island's 1px border carries **0.22**
 *  of the accent. The focal's halo was the WEAKEST accent on a grid it is supposed to be the only carrier
 *  of, and CD3's "exactly one element carries the accent at rest" became arm-conditional. 60% puts the ring
 *  at 0.24 — over the siblings' 0.22 on the colorized arm and unchanged in KIND on the plain one. */
const FOCAL_GLOW =
  "before:pointer-events-none before:absolute before:-inset-px before:-z-10 before:rounded-(--radius-card) before:opacity-60 before:shadow-glow before:transition-opacity before:duration-(--motion-base) before:ease-out-expo before:content-[''] hover:before:opacity-75";
const FOCAL_STRIPE =
  "after:pointer-events-none after:absolute after:inset-y-0 after:start-0 after:w-(--immersive-stripe-width) after:rounded-s-(--radius-card) after:bg-(--color-speaker) after:content-['']";
/** THE SECOND POPULATED ISLAND ONWARD IS NOT A FOCAL (CD3). Spelled as a SIBLING variant rather than as
 *  `first:` because the grid is now mixed: the first CHILD may be an empty slot, and a `first:`-gated halo
 *  would then belong to nobody. `[[data-config-populated]~&]` reads "this card, preceded by a populated
 *  sibling" — DOM order, one static literal, no parent census. Spelled as a WHOLE literal, never assembled:
 *  Tailwind extracts classes by scanning source text, so a class built from a template literal is never
 *  GENERATED and the rule silently does not exist (measured once already on this surface).
 *
 *  THE STRIPE STANDS DOWN BY WIDTH, NOT BY `display:none` (measured, this pass): a `display:none` pseudo
 *  still reports its DECLARED width to `getComputedStyle` — computed values, not used values — so a
 *  `hidden`-suppressed stripe reads as a painted 3px stripe to the rendered CT and to any other pixel-level
 *  reader, which is a green over a surface with four focals. `w-0` states the suppression in the property
 *  the reader actually measures. */
const FOCAL_NOT_FIRST = "[[data-config-populated]~&]:before:opacity-0 [[data-config-populated]~&]:after:w-0";
const FOCAL = `relative isolate ${FOCAL_GLOW} ${FOCAL_STRIPE} ${FOCAL_NOT_FIRST}`;

/** THE PANE WAITS FOR THE WHOLE VERDICT (side-eye 2026-08-19 P3 — the 0.0283 CLS residue, root-caused). A
 *  slot whose count has not landed cannot know which arm it is, and swapping arms after paint grows the
 *  slot's row: the create verb becomes a chip wall plus a door. So a settling child renders a zero-box
 *  MARKER instead of a slot, and ONE `:has()` on the grid stands the whole hearth down until no marker is
 *  left. The census stays in CSS over rendered DOM, every hook stays unconditional and in a fixed position,
 *  and the reader's first paint of the hearth is its final geometry. Spelled as a whole literal for the
 *  reason `FOCAL_NOT_FIRST` is. */
const HIDE_WHILE_SETTLING = "has-[[data-config-settling]]:hidden";

export function ConfigWelcome({ groups }: ConfigWelcomeProps): ReactElement {
  const ordered = collectionGroups(groups);
  return (
    // FORM tier (UI-Density-Law.md §3.1): a landing surface you act from, the home precedent. Scoped to
    // the WELCOME and not to the whole CONTENT region on purpose — the region also hosts the member
    // editors, and form tier resolves `--radius-card` where an un-tiered card resolves `--radius-base`, so
    // tiering the region would restyle every editor island in a pass that is not about them. `<Surface>`
    // is `display: contents`, so nothing in the pane's height chain moves.
    <Surface tier="form">
      {/* NO PADDING OF ITS OWN: the CONTENT region pads itself (config-content-surface), and the welcome's
          old `p-block` was the reason the editors' missing inset read as deliberate. Pinned by a computed
          four-side zero in the list CT. */}
      <Stack className="w-full" data-slot="config-welcome" gap="section">
        <Stack gap="tight">
          {/* THE STRINGS ARE `config-copy`'s, not this file's, since the mobile LIST grew a teaching header
              of its own — one frame spoken by two panes (see that module's header). */}
          <Heading level={2} voice="masthead">
            {CONFIG_WELCOME.title}
          </Heading>
          {/* ONE SENTENCE TRUE FOR BOTH READERS (side-eye 2026-08-03 P2; #104 item 3 took the em-dash).
              At the READING step and capped on the PARAGRAPH, never on the page — a measure belongs to
              the line, and capping the page is what put 160px of void down each side of this pane. */}
          <Text className="max-w-(--reading-measure-prose)" voice="reading">
            {CONFIG_WELCOME.teaching}
          </Text>
        </Stack>
        {/* auto-FIT, which COLLAPSES a track holding no item — so N slots tile with no hole at any count and
            at any width, in a narrow pane (1 across) and across the full one. `items-start` (mock
            `.hearth-grid{align-items:start}`): grid's default `stretch` would make every slot as tall as the
            tallest and hang the short ones' actions in dead space. */}
        <Grid className={`items-start ${HIDE_WHILE_SETTLING}`} cols="auto" data-slot="config-hearth" gap="gutter">
          {/* KEYED BY THE GROUP, and that key is LOAD-BEARING beyond list reconciliation (#1203): a
              launcher calls the contribution's OPTIONAL hooks, so two libraries sharing one fiber would
              change the hook count mid-fiber and crash the app. The seam states the law
              (`collection-contracts.ts`, `useCount`); this map has always satisfied it. */}
          {ordered.map((group) => (
            <CollectionLauncher group={group} key={group.id} />
          ))}
        </Grid>
      </Stack>
    </Surface>
  );
}

/** ONE library's slot. Its own component so each collection's hooks are called unconditionally, once, in a
 *  fixed position (the `TrailWidget`/`HomeTile` shape) and so the population verdict stays a per-child fact
 *  — the header's fork note. The two arms below are the two RULED anatomies, not two statuses.
 *
 *  ═══ THE SECOND RULING FORK, STATED (side-eye 2026-08-19 P3 · owner-pre-ruled arm 3) ═══════════════
 *
 *  THIS FILE'S OWN HEADER USED TO RULE THE ISLAND *IS* THE CONTROL: "shedding the count and the verb left
 *  the old populated card with no click target, no tab stop and no focus ring" (side-eye 2026-08-08 P1), so
 *  the card took `interactive` (role=button) and "THE ACCESSIBLE NAME IS THE CARD'S OWN CONTENT (label +
 *  blurb + the wall), never an `aria-label` verb". Both halves were right about their own defect. Together
 *  they produced a **~45-word button name** — a screen-reader user hears the entire chip census recited
 *  before the word "button" — which DEFEATS the exposure the content-as-name half was protecting.
 *
 *  SATISFY THE NEW SYMPTOM, PRESERVE THE OLD MECHANISM. The island is a NAMED REGION: the collection's name
 *  is a real `h3`, the chip census is ordinary content in the accessibility tree rather than fragments of a
 *  label, and the DOOR IS A REAL BUTTON whose whole accessible name is "Open Tags →". Every affordance the
 *  2026-08-08 finding demanded still exists — a click target, a tab stop, the house focus ring — carried by
 *  a control instead of by an island. The card keeps a mirroring `onClick` so a pointer user can hit
 *  anywhere on the island; that is a CONVENIENCE, never the addressable control, which is why it is not
 *  paired with a key handler or a role. */
function CollectionLauncher({ group }: { readonly group: CollectionGroupDefinition }): ReactNode {
  const collection = group.body.collection;
  // A BUILD fact, not a read: whether a contribution declares a count hook at all is fixed at the door, so
  // this branch cannot change across renders (the `CollectionImportTrigger` discipline) and the hooks below
  // it are still called unconditionally.
  const declaresCount = collection.useCount !== undefined;
  const visible = collection.useVisible?.() ?? true;
  const count = collection.useCount?.();
  const entries = collection.preview?.useEntries();
  const create = collection.create.useRun();
  if (!visible) {
    return null;
  }
  // THE IN-FLIGHT ARM IS NEITHER ARM (see `HIDE_WHILE_SETTLING`): a settling count is not a verdict, and
  // `hidden` is the ATTRIBUTE, so the marker has no box, no track and no accessibility-tree presence — it
  // exists only to be seen by one `:has()` on the grid. A collection that declares NO count hook is the
  // opposite case and must not be swallowed by it: its count is permanently unknown, never SETTLING, and
  // the 2026-08-03 ruling keeps its create verb rather than silently losing the only way into the library.
  if (declaresCount && count === undefined) {
    return <span data-config-settling="" hidden={true} />;
  }
  if (count !== undefined && count > 0) {
    const open = (): void => openConfigTo(group.id);
    return (
      // `data-collection` is the per-card hook the CTs address (a caller `data-slot` is silently overwritten
      // — `Card` writes `card-root` AFTER `{...props}`); `data-config-populated` is the CD3 sibling verdict's
      // own marker, deliberately a SECOND attribute so it cannot be confused with the identity. It says
      // POPULATED, not "built" (#1043): what it reports is the reader's library, never the app's readiness.
      // `role=region` + `aria-label` is the ADDRESSABLE IDENTITY the ARIA sweep asked for: naming a region
      // does not replace its content the way naming a button does, so the blurb and the census stay
      // reachable — the whole point of the fork above.
      <Card aria-label={group.label} className={FOCAL} data-collection={group.id} data-config-populated={group.id} onClick={open} role="region">
        <Stack gap="row">
          <ConfigLibraryGlance count={count} entries={entries ?? []} group={group} level={3} />
          {/* THE DOOR SAYS SO AT REST (side-eye 2026-08-08 P2) — and as of the fork above it IS the control,
              so the resting affordance and the operable one are the same object instead of a text line inside
              a 45-word button. `secondary`, never primary: CD3 rations the accent to the focal stripe, and the
              create verbs are secondary for the same reason. The TEXT arrow is the same one every other
              "All chats →" affordance uses (the `@orb/ui/icons` export list is a curated seal). */}
          <Row className="border-border border-t pt-row">
            <Button intent="secondary" onClick={open} size="sm" type="button">
              Open {group.label} →
            </Button>
          </Row>
        </Stack>
      </Card>
    );
  }
  return (
    // The EMPTY arm — no box (CD1), the count it knows, and the create verb. `undefined` prints no numeral
    // rather than a zero it does not know, and still offers the verb: a library whose count never lands must
    // not lose the only way into it.
    <Stack data-collection={group.id} data-config-empty={group.id} gap="row">
      <Row align="center" gap="field">
        {/* The TITLE step, and a real `h3` under the masthead: unlike the populated island this slot is
            inert, so the name carries document structure rather than only weight. */}
        <Heading level={3}>{group.label}</Heading>
        {/* AND IT SAYS ZERO — every populated band carries its count, so the one library with nothing in it
            must not be the one that declines to say how much, or "empty" and "the count has not landed" are
            indistinguishable at the moment the number is the point. */}
        {count === undefined ? null : (
          <Text as="span" className="ms-auto" voice="datum">
            {count}
          </Text>
        )}
      </Row>
      {/* Capped on the paragraph AND read at the prose step — the masthead's rule (side-eye 2026-08-19 P3,
          both passes). This slot's blurb is the one a cold first-timer reads. */}
      <Text className="max-w-(--reading-measure-prose)" prose={true} voice="gloss">
        {group.description}
      </Text>
      {/* THE VERB IS A BUTTON (side-eye 2026-08-06 P2). At `ghost` it was transparent, borderless and
          full-bleed, so the invitation read as a third line of copy. `secondary` is the house's non-primary
          chrome, and the `Row` keeps it intrinsically sized (a `Stack` child stretches to the slot's full
          width, which is what made it read as a stripe rather than a control). */}
      <Row>
        <Button intent="secondary" onClick={create} size="sm" type="button">
          {collection.create.label}
        </Button>
      </Row>
    </Stack>
  );
}
