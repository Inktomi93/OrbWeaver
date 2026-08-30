// The Configuration WELCOME — CONTENT with no member selected (config-rail-spec.md §2 C-8). Never null:
// a designed teaching frame plus one slot per registered collection, drawn from the contract fields the
// group band uses (`label` · `icon` · `useCount` · `create`) plus the two the band does NOT carry —
// `blurb` and `usePreview` — so a fourth collection appears in both places from ONE door row.
//
// ═══ VARIANT C · "THE HEARTH" (program #102, owner-picked 2026-08-16) ═══════════════════════════════
//
// WHAT IT REPLACED, and why (measured on the live app 2026-08-16, before):
//   - the pane is 917px wide; the welcome rendered in a 595px `mx-auto max-w-prose` column — 65% of the
//     pane used, ~160px of dead void down each side.
//   - the three launcher cards stopped at ~y=420 in a 752px pane: ~380px of void below the last card.
//   - the ramp topped out at the `Heading level={2}` title step. `--text-display` and `--text-headline`
//     existed in tokens.json and appeared NOWHERE on this surface.
//   - three boxed peer cards in a 2-track auto-fit grid, three collections: a permanent empty cell (#99
//     item 7). The old header called that "not a tuning problem", and it was right — see THE SHAPE below.
// So: no centre cap, a `cols="lead"` split, and the full six-step ramp, one step per role —
// display (masthead) · headline (the built library's name) · title (a not-yet-built library's name) ·
// body (the teaching line) · label (chips + the door) · micro (kickers, gloss).
//
// THE SHAPE IS THE FIX FOR #99, not a re-tuned grid. The hole was the symptom of forcing THREE
// collections into ONE even grid; the answer is to stop treating them as three equals. The library you
// have actually BUILT leads at focal weight with its real contents on display, and the ones you have not
// started sit one glance below at an honest, quiet pitch. There is no even grid left to have a hole in.
//
// THE ASSIGNMENT IS CONTENT-STATE-DRIVEN, NEVER HARDCODED to tags: `count > 0` puts a collection in the
// lead column, `0`/`undefined` puts it in the rail. When regex and world-info fill up they become leads
// too, and the rail empties itself. Nothing here names a collection.
//
// ═══ THE RULING FORK THIS BUILD SITS ON (stated, not smuggled) ══════════════════════════════════════
//
// This file's OWN header used to rule out the parent knowing every collection's count: "that switch needs
// every collection's count AT THE PARENT, and a count is an OWNER-supplied hook — reading N of them in a
// loop is exactly the rules-of-hooks violation the one-child-per-contribution shape exists to avoid."
// The Hearth needs a per-collection content verdict, so the ruling and the pick collide.
//
// THE MECHANISM IS PRESERVED, THE SYMPTOM IS SATISFIED. There is still no count loop at the parent and
// still no hook called outside a fixed position: each collection gets TWO component instances, one per
// column, each calling its own hooks unconditionally, and exactly one of them renders (the other returns
// null on its own verdict). Two instances is not two reads — both are cache-first hooks over the SAME
// query key the roster band already loaded, so the second instance costs a cache hit and no request.
// A parent `.map` calling `collection.useCount?.()` would have needed a rules-of-hooks lint suppression,
// which is a banned escape hatch here; this shape needs none.
//
// ═══ THE RULED ANATOMY — PRESERVED, NOT RE-LEVELLED ═════════════════════════════════════════════════
//
// POPULATED (the lead column) is a LAUNCHER, promoted to a hero: icon + name + blurb + its real contents
// + one door. It keeps shedding the count and the create verb (owner ruling 2026-08-08, C7 arm 2 — the
// roster band carries both, beside the rows they act on). The 2026-08-08 trim is HONORED: this pane does
// not restate the band, and the promotion is paid for with `preview` — content the collapsed band does
// NOT carry — rather than with a display-scale numeral.
//
// AND THE GRAMMAR IS NOW TRUE 3/3 (side-eye 2026-08-19 P1-2). "A hero has a preview" was a promise the
// surface kept for exactly one library: on the owner's real corpus all three collections have count>0, so
// all three landed in the lead column, and regex + world-info drew 106px hollow shells beside the tag
// hero's 198px census. Both now declare a `preview` of their own (recency · attachment), so the split
// promises nothing it cannot pay for. `BuiltLibrary` still renders the wall only when there is one, because
// a future contribution may still honestly decline.
//
// EMPTY (the rail) keeps COUNT(0) + CREATE. That is the 2026-08-03 "genuinely good teaching state"
// verdict, which was the cold-first-timer test: at zero the verb is the onboarding next step, not a
// restatement, and it is the verb that survived the 2026-08-08 P2 triple-home finding (the band's `+`
// stays, the LIST group's dashed box lost its button). `undefined` takes the SAME arm as zero — the slot
// sheds only what it KNOWS is duplicated, so a future contribution with no count hook keeps the only way
// into an empty library.
//
// AND THE EMPTY SLOT IS NOT A BOX (CD1). A not-yet-built grouping is a name + a count + a verb under a
// kicker, never a border+radius+bg — which is also byte-consistent with the ruled `interactive={false}`
// empty card that emitted no role and no box.
//
// ═══ ONE FOCAL, AT EVERY CORPUS STATE (CD3) ═════════════════════════════════════════════════════════
//
// Exactly one element may carry the accent stripe and the rationed glow at rest. The lead column's
// children ARE the built libraries in canonical order, so `first:` is the whole verdict — DOM order, no
// parent census, and a second built library renders as a quiet island rather than a second focal. Accent
// stays well under the 10% ceiling: a stripe and a ::before glow, no fill, and the create verbs are
// `secondary`, never primary.
//
// ═══ DEVIATIONS FROM THE MOCKUP, with receipts ══════════════════════════════════════════════════════
//
// NO `kicker-lead` "CONFIGURATION" over the masthead. The mock draws one (`config-c-hearth.html:194`),
// and it is drawn beside a roster whose own head already says "Configuration" — measured on the approved
// 1280×800 PNG the two sit on the same line, 328px apart, and the rail's active tooltip is a third. That
// is the IA duplication the density spec excludes and #104 trimmed; the ramp does not need it (the micro
// step is carried by the rail's kicker and the chip counts). The masthead keeps `level={2}`, unchanged —
// this changes the skin, not the document outline.
//
// ONE VOICE, NOT TWO (the surviving half of the original deviation from empty-states.html frame 2): the
// mock switches the teaching copy on "are all counts zero". That switch is the parent census this file
// still does not do, and the sentence is never wrong for either reader.

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { Icon } from "@orb/ui/icons";
import { Grid, Row, Section, Stack, Surface } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { CollectionContribution, ContributorRegistry } from "#lib";
import { goToCollection } from "#state";
import { CONFIG_WELCOME } from "../lib/config-copy.ts";
import { orderCollections } from "../lib/order-collections.ts";

export interface ConfigWelcomeProps {
  readonly collections: ContributorRegistry<CollectionContribution>;
}

/** The CD3 focal, on the FIRST built library only (see the header). The glow rides a ::before at the
 *  island's edge and the stripe an ::after inside it — `design-audit-checks.ts` classifies a chromatic
 *  glow on an element's OWN box-shadow as the generated-UI tell, and a pseudo-element is the sanctioned
 *  carrier. Neither ever sits behind reading text. `rounded-(--radius-card)` mirrors the form-tier island
 *  radius the Card resolves from `tiers.css`, so the halo tracks the edge it is a halo for; the literal
 *  `rounded-card` utility is the ELEVATED-family step the density A1 arm reserves for the sealed package.
 *  The stripe is an overlay rather than home's inline `border-inline-start`, because a border WIDTH cannot
 *  be gated on `first:` and the whole CD3 verdict here is DOM order.
 *
 *  THE RESTING GLOW IS 60%, NOT 30% (side-eye 2026-08-19, "under maximal the CD3 single-focal collapses").
 *
 *  THE ARITHMETIC, SOURCE-PINNED. `--shadow-glow` is `0 0 0 1px oklch(from var(--color-primary) … / 0.4)`
 *  plus an 18px bloom at 0.18 (`packages/ui/src/styles/theme.css`), so a pseudo at `opacity-30` painted its
 *  ring at an effective **0.12** alpha of the accent — the exact number the review measured. Meanwhile
 *  `appearance.enableThemeColorization` retints `--color-border` to `color-mix(… primary 22% …)`
 *  (`client/src/styles/globals.css`), so under that arm EVERY sibling island's 1px border carries **0.22**
 *  of the accent. The focal's halo was the WEAKEST accent on a grid it is supposed to be the only carrier
 *  of, and CD3's "exactly one element carries the accent at rest" became arm-conditional.
 *
 *  60% puts the ring at 0.24 — over the siblings' 0.22 on the colorized arm and unchanged in KIND on the
 *  plain one, where the borders are neutral and the focal was never in doubt. It is ONE unconditional
 *  value rather than a `[data-theme-colorization]` variant on purpose: an arm-conditional focal is what the
 *  finding is about, and a treatment that only holds on one appearance arm is the same defect rewritten.
 *  Hover still steps up (0.75), and the accent stays far under the 10% ceiling — this is a 1px ring plus a
 *  bloom on ONE island, with no fill anywhere on the surface. */
const FOCAL_GLOW =
  "first:before:pointer-events-none first:before:absolute first:before:-inset-px first:before:-z-10 first:before:rounded-(--radius-card) first:before:opacity-60 first:before:shadow-glow first:before:transition-opacity first:before:duration-(--motion-base) first:before:ease-out-expo first:before:content-[''] hover:first:before:opacity-75";
const FOCAL_STRIPE =
  "first:after:pointer-events-none first:after:absolute first:after:inset-y-0 first:after:start-0 first:after:w-(--immersive-stripe-width) first:after:rounded-s-(--radius-card) first:after:bg-(--color-speaker) first:after:content-['']";
const FOCAL = `relative isolate ${FOCAL_GLOW} ${FOCAL_STRIPE}`;

/** Each column hides itself when its own verdict produced no children, and the split collapses to ONE
 *  track when either side is empty — otherwise an all-built corpus leaves the 1fr rail as 38% void and an
 *  all-empty one squeezes three invitations into it, which is the exact defect this pass is deleting.
 *  `:has()` is what keeps the verdict per-CHILD (see the header's fork note): the parent asks the DOM what
 *  rendered instead of asking every contribution's hook.
 *
 *  SPELLED AS WHOLE LITERALS, NEVER ASSEMBLED. Tailwind extracts classes by scanning source text, so a
 *  class built from a template literal (`not-has-[${MARK}]:hidden`) is never GENERATED and the rule
 *  silently does not exist — measured here: the rail's band stayed visible on an all-built corpus and the
 *  cold-start rail measured 328px of a 869px pane, with no failing selector anywhere to point at. That is
 *  the same blind spot the density gate declares for computed class strings, and it is why these
 *  assertions are rendered geometry rather than class-list reads. */
const COLLAPSE_WITHOUT_BUILT = "not-has-[[data-config-built]]:@4xl:grid-cols-1";
const COLLAPSE_WITHOUT_UNBUILT = "not-has-[[data-config-unbuilt]]:@4xl:grid-cols-1";
const HIDE_WITHOUT_BUILT = "not-has-[[data-config-built]]:hidden";
const HIDE_WITHOUT_UNBUILT = "not-has-[[data-config-unbuilt]]:hidden";

/** THE OTHER HALF OF THE FIRST-PAINT FIX (side-eye 2026-08-19 P3 — the 0.0283 CLS residue the in-flight
 *  guard left behind, reproduced here at 0.0289 and root-caused).
 *
 *  THE GUARD WAS PER-CHILD AND THE GEOMETRY IS PER-PANE. `UnbuiltLibrary` correctly refuses to paint a slot
 *  whose own count is still in flight; but the TRACK COUNT above is a `:has()` verdict over what the other
 *  children rendered, so a corpus where ONE count lands a frame before the others paints the hero across the
 *  whole 843px pane (no `[data-config-unbuilt]` yet ⇒ collapse to one column) and then reflows it into the
 *  482px lead track when the rail arrives. Measured, from the browser's own layout-shift sources: the hero's
 *  door row 843→482.75px and every preview chip 577→127px on x. In production all three counts ride ONE
 *  batched response, which is why this is a RESIDUE rather than the original 541px slide — it needs the
 *  three cache writes to land in two paints instead of one, which they intermittently do (3 of 5 runs).
 *
 *  SO THE PANE WAITS FOR THE WHOLE VERDICT, and it does it WITHOUT the parent count census the file header
 *  rules out: a settling child renders a zero-box MARKER instead of nothing, and one `:has()` on the grid
 *  stands the whole hearth down until no marker is left. The census stays in CSS over rendered DOM, every
 *  hook stays unconditional and in a fixed position, and the reader's FIRST paint of the hearth is its final
 *  geometry — which is the whole claim the in-flight guard was making. */
const HIDE_WHILE_SETTLING = "has-[[data-config-settling]]:hidden";

export function ConfigWelcome({ collections }: ConfigWelcomeProps): ReactElement {
  const ordered = orderCollections(collections);
  return (
    // FORM tier (UI-Density-Law.md §3.1): a landing surface you act from, the home precedent. Scoped to
    // the WELCOME and not to the whole CONTENT region on purpose — the region also hosts the member
    // editors, and form tier resolves `--radius-card` where an un-tiered card resolves `--radius-base`, so
    // tiering the region would restyle every editor island in a pass that is not about them. `<Surface>`
    // is `display: contents`, so nothing in the pane's height chain moves.
    <Surface tier="form">
      {/* NO PADDING OF ITS OWN: the CONTENT region pads itself (config-content-surface), and the welcome's
          old `p-block` was the reason the editors' missing inset read as deliberate. Pinned by a computed
          four-side zero in the roster CT. */}
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
          <Text className="max-w-(--reading-measure)" voice="reading">
            {CONFIG_WELCOME.teaching}
          </Text>
        </Stack>
        {/* `items-start` (mock `.hearth-grid{align-items:start}`): grid's default `stretch` would make the
            rail as tall as the lead column and hang its last invitation in dead space. */}
        <Grid
          className={`items-start ${HIDE_WHILE_SETTLING} ${COLLAPSE_WITHOUT_BUILT} ${COLLAPSE_WITHOUT_UNBUILT}`}
          cols="lead"
          data-slot="config-hearth"
          gap="gutter"
        >
          {/* `min-w-0` IS THE SPLIT (the home hearth's P1-1, paid for once already): a grid TRACK CHILD is
              `min-width:auto`, so the track is floored at its content's min-content width and a chip wall's
              longest unbreakable run would silently override the declared ratio. */}
          <Stack className={`min-w-0 ${HIDE_WITHOUT_BUILT}`} gap="section">
            {ordered.map((collection) => (
              <BuiltLibrary collection={collection} key={collection.id} />
            ))}
          </Stack>
          <Stack className={`min-w-0 ${HIDE_WITHOUT_UNBUILT}`} gap="section">
            {/* `<Section kicker>` is the sanctioned CD1 band anatomy (caps micro + a hairline to the edge)
                — the replacement for a box over a read-only grouping. `level={2}` makes it a PEER of the
                masthead in the outline rather than a child of nothing. */}
            <Section aria-label="Not built yet" kicker="Not built yet" level={2}>
              {/* auto-FIT, which COLLAPSES a track holding no item — so N invitations tile with no hole at
                  any count or width, in the narrow rail (1 across) and across the full pane when the lead
                  column is empty (the cold first run, where all three land here). */}
              <Grid cols="auto" gap="section">
                {ordered.map((collection) => (
                  <UnbuiltLibrary collection={collection} key={collection.id} />
                ))}
              </Grid>
            </Section>
          </Stack>
        </Grid>
      </Stack>
    </Surface>
  );
}

/** A library you have BUILT — the launcher, promoted to a hero. Its own component so each collection's
 *  hooks are called unconditionally, once, in a fixed position (the `TrailWidget`/`HomeTile` shape), and
 *  so the content verdict stays a per-child fact (the header's fork note).
 *
 *  ═══ THE SECOND RULING FORK, STATED (side-eye 2026-08-19 P3 · owner-pre-ruled arm 3) ═══════════════
 *
 *  THIS FILE'S OWN HEADER USED TO RULE THE ISLAND *IS* THE CONTROL: "shedding the count and the verb left
 *  the old populated card with no click target, no tab stop and no focus ring" (side-eye 2026-08-08 P1), so
 *  the card took `interactive` (role=button) and "THE ACCESSIBLE NAME IS THE CARD'S OWN CONTENT (label +
 *  blurb + the wall), never an `aria-label` verb". Both halves were right about their own defect. Together
 *  they produced a **~45-word button name** — a screen-reader user hears the entire chip census recited
 *  before the word "button" — which DEFEATS the exposure the content-as-name half was protecting: content
 *  read as one atomic label is not content a reader can navigate, skim, or leave.
 *
 *  SATISFY THE NEW SYMPTOM, PRESERVE THE OLD MECHANISM. The island is now a NAMED REGION: the collection's
 *  name is a real `h3` (it can be, now that it is not inside a button), the chip census is ordinary content
 *  in the accessibility tree rather than fragments of a label, and the DOOR IS A REAL BUTTON whose whole
 *  accessible name is "Open Tags →". Every affordance the 2026-08-08 finding demanded still exists — a
 *  click target, a tab stop, the house focus ring — it is just carried by a control instead of by an island,
 *  and the 2026-08-08 trim ruling (no count numeral, no create verb on a populated launcher) is untouched.
 *  The card keeps a mirroring `onClick` so a pointer user can still hit anywhere on the island; that is a
 *  CONVENIENCE, never the addressable control, which is why it is not paired with a key handler or a role.
 *
 *  `goToCollection` is the same intent every cross-surface "manage it over there" door fires; selection
 *  stays the roster's. Both doors call it, so a click on the button (which bubbles) is idempotent. */
function BuiltLibrary({ collection }: { readonly collection: CollectionContribution }): ReactNode {
  const visible = collection.useVisible?.() ?? true;
  const count = collection.useCount?.();
  const entries = collection.preview?.useEntries();
  if (!visible || count === undefined || count === 0) {
    return null;
  }
  const shown = entries ?? [];
  const remainder = count - shown.length;
  const open = (): void => goToCollection(collection.id);
  // A DETAIL THAT IS THE SAME ON EVERY CHIP IS NOT A DATUM (side-eye 2026-08-19 P2-2). The regex library
  // ranks by recency, so a library authored in one sitting printed twelve chips all reading "yesterday" —
  // the ugliest block on the surface, and a column of one repeated value reads as a rendering bug rather
  // than as information. The rank itself stays (the kicker still says what ordered the wall); only the
  // per-chip echo of it goes, and the names carry the glance alone.
  //
  // THE HOST DECIDES THIS, NOT THE CONTRIBUTION, because it is a property of the RENDERED WALL — how much
  // the twelve values it drew actually differ — which no owner can know from inside its own ranking. It
  // holds for any collection: a tag wall whose totals vary keeps every detail, and the same wall on a
  // library where they do not would drop them.
  //
  // ">1 CHIP" IS PART OF THE RULE, not an off-by-one: with a single chip there is no repetition to be
  // about, and its datum is that member's own fact rather than a column of noise. (Stated as a deviation
  // from the brief's bare "distinct ≤ 1", which would have silently deleted the detail from every
  // one-member preview.)
  const details = new Set(shown.map((entry) => entry.detail));
  const showDetail = shown.length <= 1 || details.size > 1;
  return (
    // `data-collection` is the per-card hook the CTs address (a caller `data-slot` is silently overwritten
    // — `Card` writes `card-root` AFTER `{...props}`); `data-config-built` is the column's own `:has()`
    // marker, deliberately a SECOND attribute so the marker cannot be confused with the identity.
    // `role=region` + `aria-label` is the ADDRESSABLE IDENTITY the ARIA sweep asked for (the welcome's three
    // cards were map-dom-fallbacks): naming a region does not replace its content the way naming a button
    // does, so the blurb and the census stay reachable — the whole point of the fork above.
    <Card aria-label={collection.label} className={FOCAL} data-collection={collection.id} data-config-built={collection.id} onClick={open} role="region">
      <Stack gap="row">
        <Row align="center" gap="field">
          <Icon icon={collection.icon} size="sm" />
          {/* The HEADLINE step AND a real `h3` — legal now that the island is not a button (a heading inside
              one is not addressable by AT, which is why this used to be a `Text as="span"`). The `focal`
              voice still carries the type half of CD3. */}
          <Heading level={3} voice="focal">
            {collection.label}
          </Heading>
        </Row>
        {/* CAPPED ON THE PARAGRAPH, like the masthead (side-eye 2026-08-19 P3: 161ch latent). A measure
            belongs to the line — the lead column is 1.55fr of a 917px pane and grows with it.
            …AND READ AT THE PROSE STEP (side-eye 2026-08-19 P3, the second pass). A blurb is this surface's
            TEACHING sentence — what a library is for, read by someone who has not built it — and it was set
            at the gloss voice's own 10.5px micro step, the footnote step. `prose` is the house statement for
            exactly that ("this text is sentences, not a label"): it lifts the step and relaxes the leading
            and changes nothing else, so the blurb is still unmistakably the gloss voice. */}
        <Text className="max-w-(--reading-measure)" prose={true} voice="gloss">
          {collection.blurb}
        </Text>
        {shown.length === 0 ? null : (
          // WHAT IS ACTUALLY IN IT — the half that pays for the promotion (see the contract's `preview`).
          // A collection that declares no preview simply skips this and reads as name + blurb + door.
          <Stack gap="field">
            {/* THE RANK IS THE CONTRIBUTION'S WORD, not the host's (side-eye 2026-08-19 P1-2). This was a
                hardcoded "Most used", which was true of the one library that had a preview and became a lie
                the moment two more declared one: regex ranks by recency, world-info by attachment. */}
            <Text as="span" voice="kicker">
              {collection.preview?.label}
            </Text>
            <Row className="flex-wrap" gap="tight">
              {/* KEYED ON THE MEMBER'S OWN ID (side-eye 2026-08-19 P1-1). This keyed on `entry.label`, and
                  the owner's corpus has two books with the same name — so the surface logged React's
                  duplicate-key error on every visit, the wall's membership was reconciliation's to decide,
                  and `+N more` went on deriving the remainder from `shown.length`. The contract carries the
                  id for exactly this. */}
              {shown.map((entry) => (
                <Badge intent="neutral" key={entry.id} tone="soft">
                  {entry.label}
                  {showDetail ? (
                    <Text as="span" voice="datum">
                      {entry.detail}
                    </Text>
                  ) : null}
                </Badge>
              ))}
              {/* The remainder is derived from the COUNT, never from a second query — which is also what
                  keeps the wall honestly a glance: it says how much of the library it is not showing. */}
              {remainder > 0 ? (
                <Badge intent="neutral" tone="ghost">
                  +{remainder} more
                </Badge>
              ) : null}
            </Row>
          </Stack>
        )}
        {/* THE DOOR SAYS SO AT REST (side-eye 2026-08-08 P2) — and as of the fork above it IS the control,
            so the resting affordance and the operable one are the same object instead of a text line inside
            a 45-word button. `secondary`, never primary: CD3 rations the accent to the focal stripe, and the
            rail's create verbs are secondary for the same reason. The TEXT arrow is the same one every other
            "All chats →" affordance uses (the `@orb/ui/icons` export list is a curated seal). */}
        <Row className="border-border border-t pt-row">
          <Button intent="secondary" onClick={open} size="sm" type="button">
            Open {collection.label} →
          </Button>
        </Row>
      </Stack>
    </Card>
  );
}

/** A library you have NOT built yet — a quiet slot in the rail, count(0) + create, no box (CD1). Its own
 *  component for the same reason {@link BuiltLibrary} is: unconditional hooks in a fixed position, and a
 *  per-child verdict. Exactly one of the two renders for any collection at any count, so the pane's
 *  membership never depends on which arm is asked. */
function UnbuiltLibrary({ collection }: { readonly collection: CollectionContribution }): ReactNode {
  // A BUILD fact, not a read: whether a contribution declares a count hook at all is fixed at the door, so
  // this branch cannot change across renders (the `CollectionImportTrigger` discipline) and the hook below
  // it is still called unconditionally.
  const declaresCount = collection.useCount !== undefined;
  const visible = collection.useVisible?.() ?? true;
  const count = collection.useCount?.();
  const create = collection.create.useRun();
  if (!visible) {
    return null;
  }
  // THE IN-FLIGHT ARM IS NEITHER COLUMN (snap `--isolated` on the real corpus, 2026-08-17): while the
  // counts are settling every collection reads as not-built, so the surface first painted a rail-only
  // one-column layout and then SLID `[data-slot=config-hearth]` 541px sideways when the tag count landed
  // and the lead column appeared — an unexpected 0.073 CLS on the pane's own first paint. A settling count
  // is not a verdict, so it renders no slot.
  //
  // IT RENDERS A ZERO-BOX MARKER RATHER THAN `null` (2026-08-19, the 0.0283 residue — the whole mechanism is
  // in `HIDE_WHILE_SETTLING` above). `hidden` is the ATTRIBUTE, so the marker has no box, no track and no
  // accessibility-tree presence; it exists only to be seen by one `:has()` on the grid. It rides
  // `UnbuiltLibrary` because this component is already the one that computes "my count has not landed" —
  // a second component to carry the marker would be a second home for one verdict.
  //
  // A collection that declares NO count hook is the opposite case and must NOT be swallowed by it: its
  // count is permanently unknown — never SETTLING — and the 2026-08-03 ruling keeps its create verb rather
  // than silently losing the only way into an empty library. That is what `declaresCount` separates.
  if (declaresCount && count === undefined) {
    return <span data-config-settling="" hidden={true} />;
  }
  if (count !== undefined && count > 0) {
    return null;
  }
  return (
    <Stack data-collection={collection.id} data-config-unbuilt={collection.id} gap="row">
      <Row align="center" gap="field">
        <Icon icon={collection.icon} size="sm" />
        {/* The TITLE step, and a real `h3` under the band's `h2`: unlike the hero this slot is inert, so
            the name can carry document structure instead of only weight. */}
        <Heading level={3}>{collection.label}</Heading>
        {/* AND IT SAYS ZERO — every populated band carries its count, so the one library with nothing in
            it must not be the one that declines to say how much, or "empty" and "the count has not landed"
            are indistinguishable at the moment the number is the point. `undefined` prints nothing rather
            than a zero it does not know. */}
        {count === undefined ? null : (
          <Text as="span" className="ms-auto" voice="datum">
            {count}
          </Text>
        )}
      </Row>
      {/* Capped on the paragraph AND read at the prose step — the hero's rule and the masthead's (side-eye
          2026-08-19 P3, both passes). This slot's blurb is the one a cold first-timer reads. */}
      <Text className="max-w-(--reading-measure)" prose={true} voice="gloss">
        {collection.blurb}
      </Text>
      {/* THE VERB IS A BUTTON (side-eye 2026-08-06 P2). At `ghost` it was transparent, borderless and
          full-bleed, so the invitation read as a third line of copy. `secondary` is the house's
          non-primary chrome, and the `Row` keeps it intrinsically sized (a `Stack` child stretches to the
          slot's full width, which is what made it read as a stripe rather than a control). */}
      <Row>
        <Button intent="secondary" onClick={create} size="sm" type="button">
          {collection.create.label}
        </Button>
      </Row>
    </Stack>
  );
}
