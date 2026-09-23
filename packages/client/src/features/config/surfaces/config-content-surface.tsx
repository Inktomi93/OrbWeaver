// The Settings CONTENT — in priority: the open collection MEMBER's own editor, MOUNTED in the pane
// (C-7: never a dialog) · the ACTIVE settings group's body (the `sections`
// skimmer over the contributed sections — every settings-shaped group, §6.8 — or the honest placeholder) with the ONE aggregate
// save-status footer below the scroller (SET-SEAMS §3) · an ACTIVE collection's own landing · the section's
// teaching frame, never null.
//
// THE COLLECTION LANDING (#1099 F5, extended by #925's species contract) is what makes a collection band a
// DOOR rather than a caption: activating a library used to have nowhere to go at zero, and at any other
// population it fell through to the four-library WELCOME — a pane that talks about every library except by
// name the one the reader just opened. It now answers for ITS library at every population, out of the
// contribution's own declared fields (`label` · `description` · `insights` · `emptyText` · `create`) plus one
// host sentence about where the members are, so it invents no copy for any library and a new collection gets
// its landing for free. `components/config-collection-landing.tsx` states the three arms.
//
// The host routes by KIND and renders whatever the owning definition hands back — it never learns what a
// member IS or what a section writes. The registry is door-frozen and a selection can only be written by a
// rendered group, so `get(kind)` cannot miss.
//
// ACTIVE-TRACKING IS A SELECTION × SCROLL-SPY HYBRID (the retired settings shell's mechanism, re-homed
// verbatim): the active group is pure selection (a LIST click or a deep link); within it the current
// subcategory tracks scroll (a passive, rAF-throttled listener lights the last section past the spy line),
// suppressed while a programmatic jump is in flight. A deep link may name a SUBCATEGORY
// (`openConfigTo(group, subId)`), which lands on that section's anchor via the same jump path; a
// group-only link lands at the top AND names the first section current (#549: the deep link IS a selection,
// so it runs the selection's landing — the spy's own initial compute against a still-mounting body used to
// light the LAST section).

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useEffect, useId, useState } from "react";
import { MemberDrillHeader, QueryBoundary } from "#components";
import { QueryErrorState, useSettingsViewerView } from "#data";
import { SaveStatusHostContext } from "#forms";
import { useFocusOnMount } from "#lib";
import type { CollectionGroupDefinition, ConfigGroupDefinition, ConfigGroupId, ConfigGroupRegistry, KindedSelection } from "#state";
import {
  clearCollectionSelection,
  configSectionNavs,
  isCollectionGroup,
  isPlaceholderGroup,
  rendersOwnBody,
  setActiveConfigSub,
  setConfigFocus,
  useActiveConfigGroup,
  useCollectionSelection,
  useConfigSectionRegistry,
  useConfigSections,
  useConfigTarget,
} from "#state";
import { ConfigCollectionLanding } from "../components/config-collection-landing.tsx";
import { ConfigGroupPlaceholder } from "../components/config-group-placeholder.tsx";
import { ConfigPaneGlance } from "../components/config-pane-glance.tsx";
import { ConfigSaveFooter } from "../components/config-save-footer.tsx";
import { SettingsUnreadableGate } from "../components/settings-unreadable-notice.tsx";
import { useConfigScrollSpy } from "../hooks/use-config-scroll-spy.ts";
import { CONFIG_SECTION_LABEL, CONFIG_WELCOME } from "../lib/config-copy.ts";
import { scrollContentToTop, scrollToAnchor } from "../lib/config-jump.ts";

export interface ConfigContentSurfaceProps {
  readonly groups: ConfigGroupRegistry;
}

export function ConfigContentSurface({ groups }: ConfigContentSurfaceProps): ReactElement {
  const selection = useCollectionSelection();
  const activeGroup = useActiveConfigGroup();
  // THE SPY AND ITS TWO REFS (`hooks/use-config-scroll-spy.ts`): the pane's scroller, and the
  // programmatic-jump window that silences the spy while `config-jump.ts` is moving it. Both are borrowed
  // back here — one for the JSX `ref`, both for the landing effect below — which is why the hook returns
  // them rather than taking them (its header carries that reasoning).
  const { contentRef, suppressSpyRef } = useConfigScrollSpy(activeGroup);
  const target = useConfigTarget();
  const sectionRegistry = useConfigSectionRegistry();
  const viewer = useSettingsViewerView();
  // THIS PANE STANDS DOWN WHEN NOTHING IS OPEN (side-eye 2026-08-19 ARIA): with nothing selected the LIST is
  // the surface the reader arrived for, and the moment a member or a group IS open this pane is where they
  // asked to be, so it takes focus. Which pane wins has to be a DECISION, not effect-order roulette.
  //
  // …AND AN ACTIVE GROUP IS NO LONGER EVIDENCE THAT THE READER ASKED FOR ONE (#925 ruling 4). A group is
  // active from the first frame now, by the host's own arrival default — and on a rail BOUNCE the previous
  // visit's group is still active — so "a group is open ⇒ this pane is where they asked to be" would hand
  // CONTENT the section's arrival focus on every entrance, which is precisely the defect the 2026-08-19
  // finding fixed, re-created by a different route. What still means "they asked" is an open MEMBER: a
  // member is only ever selected by an explicit act (a LIST row, a create verb, a search hit), and its
  // editor is the thing that act was for. A group without one leaves focus on the LIST — the map is what
  // a reader entering a section arrived to read, and it says where they are.
  useFocusOnMount(contentRef, selection !== null);

  const active = activeGroup === null ? null : groups.get(activeGroup);
  // The active group that RENDERS ITS OWN BODY, or `null` when the pane shows the member or the teaching frame — ONE derivation the
  // region label, the footer and the arm all read.
  const shownGroup = selection === null && active !== null && rendersOwnBody(active) ? active : null;
  const showsGroup = shownGroup !== null;
  // The ACTIVE collection with nothing open — the arm the zero-member band selects into (F5). Derived here
  // beside `shownGroup` so the two arms are one decision, and passed down rather than re-derived.
  const landedCollection = selection === null && active !== null && isCollectionGroup(active) ? active : null;

  // LAND A DEEP LINK / A LIST CLICK THE WAY A CLICK LANDS (#549; SET-SEAMS §10 Q4 for the SUB arm). Keyed on
  // the TARGET (its nonce changes per request), never on `active`, so a later user switch can't re-fire a
  // stale jump. `viewer` is a dependency on purpose: a cold link to a `when`-gated group resolves while the
  // non-suspense `sessions.me` probe is in flight, and the landing must re-apply once visibility GROWS.
  useEffect((): void => {
    if (target === null) {
      return;
    }
    const group = groups.get(target.group);
    if (!(group.when?.(viewer) ?? true)) {
      return;
    }
    if (target.sub === null) {
      const first = configSectionNavs(sectionRegistry, group.id, viewer)[0]?.id ?? null;
      setActiveConfigSub(first);
      scrollContentToTop(contentRef, suppressSpyRef);
      return;
    }
    scrollToAnchor(target.group, target.sub, contentRef, suppressSpyRef);
    // A SETTING-level landing also teaches: the focused-row seam gets the leaf so the context pane opens
    // on its lesson (VS Code's per-setting URL, #866 S3 — the search hit and `openConfigTo(g, s, leaf)`).
    if (target.setting !== null) {
      setConfigFocus({ group: target.group, sub: target.sub, setting: target.setting });
    }
    // The two refs are DECLARED now that they arrive from the spy hook rather than being minted here: they
    // are stable identities, so naming them re-fires nothing, and the alternative is a suppression.
  }, [target, groups, sectionRegistry, viewer, contentRef, suppressSpyRef]);

  const regionLabel = shownGroup === null ? CONFIG_SECTION_LABEL : `${shownGroup.label} settings`;
  return (
    // THE CONTENT PANE OWNS THE SCROLL, once, for every group and member: the shell's own CONTENT region is
    // a bounded flex box with NO overflow, so a member editor taller than the viewport — a 60-entry world
    // book is ~3600px — would simply have its tail unreachable. The footer sits BELOW the scroller and never
    // scrolls away (the settings shell's column, re-homed).
    <Container className="h-full min-h-0">
      {/* ONE GOVERNED INLINE GRID FOR THE COLUMN (#1099 F25 / N52). The footer was a bare SIBLING of the
          padded scroller, so the only save receipt on the surface rendered 24px OUTSIDE the content
          column — the reader's eye is on the control they just moved, and the answer arrived off-grid at
          the bottom-left corner. The INLINE inset is now declared ONCE, on the column both
          children live in, so neither child re-spells the measure and they cannot drift apart again. The
          BLOCK inset stays INSIDE the scroller on purpose: it is scroll EXTENT, which the jump and the
          scroll-spy read — hoisting it shortened the scrollable tail and a distant section-row click
          landed on an intermediate section (caught by that CT, not by the eye). */}
      <Stack className="h-full min-h-0 px-section" data-slot="config-pane" gap="row">
        {/* `relative` is LOAD-BEARING (owner dogfood 2026-08-13 — "the settings screen scrolls past the end
            of its results"): Base UI form primitives park `sr-only` boxes at `position:absolute`, and an
            `overflow` scroller only clips descendants whose CONTAINING BLOCK is inside it. THE COLUMN PADS,
            NOT THE EDITORS (side-eye 2026-08-03 P1, as amended by #1099 F25): `section` is the mock's
            editor-pane inset on the token scale, and a per-editor inset is the same defect waiting for the
            next group. The INLINE half of that inset now belongs to the column above (so the receipt shares
            it); this box keeps the block half, which is scroll geometry and nobody else's. */}
        <Stack
          aria-label={regionLabel}
          className="relative h-full min-h-0 flex-1 overflow-y-auto overscroll-contain py-section outline-none"
          data-slot="config-content"
          ref={contentRef}
          role="region"
          tabIndex={-1}
        >
          <ContentArm active={shownGroup} collection={landedCollection} groups={groups} selection={selection} />
        </Stack>
        {showsGroup ? <ConfigSaveFooter /> : null}
      </Stack>
    </Container>
  );
}

interface ContentArmProps {
  readonly groups: ConfigGroupRegistry;
  readonly selection: KindedSelection | null;
  /** The active PUSHING group, or `null` when the pane shows the member or the teaching frame. */
  readonly active: ConfigGroupDefinition | null;
  /** The active COLLECTION with no member open — the state its own landing answers for (#925). */
  readonly collection: CollectionGroupDefinition | null;
}

/** The four arms, in priority: the open member's editor · the active group's body · an ACTIVE collection's
 *  own landing · the teaching frame (nothing active at all). */
function ContentArm({ groups, selection, active, collection }: ContentArmProps): ReactNode {
  if (selection !== null) {
    const group = groups.get(selection.kind as ConfigGroupId);
    return (
      <Stack data-slot="config-member-frame" gap="block">
        {/* THE DRILL ROW IS THE MEMBER SURFACE'S (#1747, §3.4) — see `CollectionDrillExit` below for why,
            and for why the host still draws the EXIT while the member's own read is in flight.
            THE ERROR ARM IS THE BATTERY, UNWRAPPED, and that is gate law rather than a preference:
            `render-error-via-battery` requires that arrow to be `QueryErrorState`-rooted, so the exit
            cannot ride along there the way it rides the fallback. It costs nothing the reader needs — the
            battery's own Retry is the verb for a failed read, the LIST band is still on screen at every
            desktop width, and the phone's topbar carries its own Back. */}
        <QueryBoundary
          fallback={
            <Stack gap="block">
              <CollectionDrillExit group={group} />
              <Text voice="gloss">Loading…</Text>
            </Stack>
          }
          renderError={(_error, retry): ReactElement => <QueryErrorState label={group.label.toLowerCase()} onRetry={retry} />}
        >
          <MemberBody group={group} memberId={selection.memberId} />
        </QueryBoundary>
      </Stack>
    );
  }
  if (active !== null) {
    return (
      <SaveStatusHostContext value={true}>
        {/* #1716: the gate is transparent while `user_settings.config` reads fine. When it does not, the
            whole pane is showing schema defaults and every section's save is refused server-side, so the
            gate states that ONCE here (never per section) and stands every autosave driver below it down.
            It wraps the SECTION-BODY arm only — the MEMBER arm above is a preset/world-book/theme editor,
            whose own stored blob is a different row with its own verdict. */}
        <SettingsUnreadableGate>
          <GroupBody group={active} />
        </SettingsUnreadableGate>
      </SaveStatusHostContext>
    );
  }
  if (collection !== null) {
    // KEYED BY THE COLLECTION (#1203 P0). A `CollectionContribution` declares OPTIONAL hooks (`useCount`,
    // `insights.useInsights`), so its hook SET is a property of the contribution — a library with facts to
    // state declares one and its neighbour may not. Without a key React reuses ONE fiber for every library, so a
    // switch changed the hook count mid-fiber and threw "Rendered fewer/more hooks than expected" straight
    // past every route boundary: the whole shell white-screened, reload-only. The key is the correct
    // identity statement — a different library is a different component instance, not the same one with new
    // props — and it is what makes "unconditional in a fixed position" true for each contribution's own
    // fiber. The seam states this law for every future host (`collection-contracts.ts`, `useCount`).
    return <ConfigCollectionLanding group={collection} key={collection.id} />;
  }
  // NOTHING ACTIVE — the ONE state left after the Hearth retired (#1210). The arrival default makes a group
  // active before the first paint and a phone never paints CONTENT unpushed, so this arm is reached only by
  // an explicit `clearActiveConfigGroup` (the shell's mobile Back, a rail bounce). It is the section's own
  // teaching frame and nothing else: the retired welcome's launcher grid was a second, unreachable rendering
  // of the LIST's own collections shelf. The copy is `config-copy`'s, shared with the phone's frame, so the
  // two panes cannot drift into two openings for one surface.
  return (
    <Stack data-slot="config-teaching-frame" gap="tight">
      <Heading level={2} voice="masthead">
        {CONFIG_WELCOME.title}
      </Heading>
      <Text className="max-w-(--reading-measure-prose)" voice="reading">
        {CONFIG_WELCOME.teaching}
      </Text>
    </Stack>
  );
}

/**
 * THE EXIT ALONE — what the host draws while the member's own drill row cannot exist (the mock design §3.4).
 *
 * ═══ THE ROW MOVED TO THE MEMBER SURFACE; THE EXIT'S RULING SURVIVED (#1747) ══════════════════════════
 * The boards draw ONE row — `← Back to <library>` · the member's NAME · the member's own verbs — and this
 * host used to draw the Back alone, with the name and the verbs one row lower on the surface's own header.
 * A host `<Heading>` here was tried and printed the name TWICE (two CTs red on a strict-mode
 * `getByRole("heading", {name})`), because all four surfaces already render the member's name as their own
 * `h2`. The name has ONE author, so the whole row went to the party that has it: the surface draws
 * `MemberDrillHeader` out of the `library` this host hands down (`CollectionMemberView`).
 *
 * WHAT DID NOT MOVE is the ruling that put the Back OUTSIDE the suspense boundary: a member surface reads
 * through `useSuspenseQuery`, so a row that only the surface draws is absent for exactly the beat the
 * drilled reader most wants an exit. That ruling survives with a changed INPUT — this Back-only row is the
 * boundary's FALLBACK and its error arm, so precisely one of the two rows paints at any moment and the exit
 * is never missing. It carries the same `data-slot`, because it is the same row in its pending state.
 *
 * NO LIFECYCLE CHROME ON EITHER SPELLING (D212, #271). Delete is the ROW's kebab in every collection, and
 * the fork "the kebab is off-screen while drilled" is answered by this Back — precisely what world info's
 * entry level already does.
 */
function CollectionDrillExit({ group }: { readonly group: ConfigGroupDefinition }): ReactNode {
  if (!isCollectionGroup(group)) {
    return null;
  }
  return <MemberDrillHeader back={{ label: `Back to ${group.label}`, onClick: (): void => clearCollectionSelection() }} />;
}

/** The open member's editor — the owning collection's `detail`, mounted, with the LIBRARY's own label so the
 *  surface can draw its drill row's exit (#1747). A selection can only name a collection group (its rows are
 *  the only writers), so the narrowing is a type fact, not a runtime guess. */
function MemberBody({ group, memberId }: { readonly group: ConfigGroupDefinition; readonly memberId: string }): ReactNode {
  if (!isCollectionGroup(group)) {
    return null;
  }
  return <>{group.body.collection.detail({ memberId, library: group.label })}</>;
}

/** The active group's body — reads the definition blind over the §3.1 body union (as amended by §6.8): a
 *  pure `sections` SKIMMER (the host renders the anchor's contributed sections, in door order — the ONLY
 *  render path a settings-shaped group has) or the DECLARED-PLANNED placeholder. Admin needs no extra guard
 *  here — the LIST and the search hide it from non-admin viewers via `when`, and a forced deep link hits the
 *  group's own server-gated error. A `collection` group never reaches here (`rendersOwnBody`). */
function GroupBody({ group }: { readonly group: ConfigGroupDefinition }): ReactNode {
  const viewer = useSettingsViewerView();
  // The ONE order contract (`ConfigSectionPartition`, #978 F4) — the pane does NOT re-sort what it is
  // handed, because the LIST paints its map off the same partition and a second sort here is exactly how
  // the two panes drifted. A group with advanced sections and NO declared fold renders them in flow, at
  // the end: same sequence, no disclosure.
  const { primary, advanced } = useConfigSections(group.id, viewer);
  const target = useConfigTarget();
  const fold = group.advancedFold;
  const plain = fold === undefined ? [...primary, ...advanced] : primary;
  const folded = fold === undefined ? [] : advanced;
  // The fold OPENS itself when a landing names one of its sections (a LIST click, a search hit, a deep
  // link — a jump into a closed drawer would scroll to nothing). User toggles win afterwards; keyed on the
  // target nonce so a later manual close is never re-fought by a stale landing. A LANDING open is
  // `instant` (the panel's own auto-open contract): the jump scrolls to the revealed anchor in the same
  // beat, and a height animation under a programmatic scroll moves the target every frame — the spy
  // re-arms onto an intermediate section (measured: the Effects landing lit Sizing on the way).
  const [foldOpen, setFoldOpen] = useState<{ readonly open: boolean; readonly instant: boolean }>({ open: false, instant: false });
  const [seenNonce, setSeenNonce] = useState<number | null>(null);
  const foldIds = useId();
  const foldLabelId = `${foldIds}-fold-label`;
  const foldCaptionId = `${foldIds}-fold-caption`;
  const landingNonce = target !== null && target.group === group.id && folded.some((section) => section.nav.id === target.sub) ? target.nonce : null;
  // Derived-state adjustment DURING render (the React-sanctioned setState-in-render form, never an
  // effect): a fresh landing nonce opens the fold in the SAME commit the jump machinery will observe.
  if (landingNonce !== null && landingNonce !== seenNonce) {
    setSeenNonce(landingNonce);
    setFoldOpen({ open: true, instant: true });
  }
  if (isPlaceholderGroup(group)) {
    return <ConfigGroupPlaceholder title={group.label} description={group.description} />;
  }
  if (isCollectionGroup(group)) {
    return null;
  }
  return (
    <Stack gap="section">
      {/* THE PANE OPENS ON ITS SUBJECT, IN THE SAME REGISTER A LIBRARY DOES (#1839 · side-eye 2026-09-06
          F24). A collection pane opened on `ConfigPaneGlance`'s 20px/600 name and a settings pane opened on
          nothing — its tallest ink was a 16px incidental inside the first section — so the CONTENT column
          had two opening registers depending on which door you came through, and the review's verdict was
          that the INCONSISTENCY had become the defect. One component draws both now, so there is one
          register by construction rather than by two call sites agreeing.
          THE NAME ONLY, NOT THE BLURB: a settings group's `description` is a SEARCH KEYWORD (the field's
          own docstring), not landing prose, and this pane's own arm-discriminator reads its absence.
          IT IS THE `sections` ARM'S ALONE: the placeholder arm draws its own titled body and a collection
          returns above, so neither can double-print the name. */}
      <ConfigPaneGlance blurb={false} group={group} level={2} />
      {plain.map((section) => (
        <Fragment key={section.id}>{section.node}</Fragment>
      ))}
      {fold === undefined || folded.length === 0 ? null : (
        <Collapsible onOpenChange={(open): void => setFoldOpen({ open, instant: false })} open={foldOpen.open}>
          {/* #297's explicit custom arm: the fine-tuning knobs behind ONE named disclosure, collapsed by
              default — the caption names what the knobs ride on ("your changes, on top of <look>"). */}
          {/* The label and the caption are NAMED SEPARATELY (#1099 G5): as bare siblings they concatenated
              into "Customize this lookadvanced · your changes, on top of Hearth" — the browser's real
              computed name, and the trigger resolved only as a DOM path in `snap --map`, i.e. it had no
              stable semantic identity for a primary door. `aria-labelledby` over the two ids joins them
              with a space and keeps every visible word in the name (§13.10 N2). */}
          <CollapsibleTrigger aria-labelledby={fold.caption === undefined ? foldLabelId : `${foldLabelId} ${foldCaptionId}`} size="control">
            <Row align="center" gap="field" className="min-w-0">
              {/* `interactiveKicker`, NOT `kicker` (#1216 class, #1632 item 3): this label IS the visible
                  name of a control, and `kicker` rides `--text-micro` (10.5px), under the 11px functional
                  floor for interactive copy. The voice beside it keeps the tracked instrument register while
                  taking the readable 13px label step — the "Add background" door's landed verdict, applied to
                  the other CollapsibleTrigger of the same shape. */}
              <Text as="span" id={foldLabelId} voice="interactiveKicker">
                {fold.label}
              </Text>
              {fold.caption === undefined ? null : <span id={foldCaptionId}>{fold.caption()}</span>}
            </Row>
          </CollapsibleTrigger>
          <CollapsiblePanel instant={foldOpen.instant}>
            <Stack gap="section">
              {folded.map((section) => (
                <Fragment key={section.id}>{section.node}</Fragment>
              ))}
            </Stack>
          </CollapsiblePanel>
        </Collapsible>
      )}
    </Stack>
  );
}
