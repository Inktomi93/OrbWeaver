// The Settings CONTENT — in priority: the open collection MEMBER's own editor, MOUNTED in the pane
// (config-rail-spec.md C-7: never a dialog) · the ACTIVE settings group's body (the `sections`
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
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { MemberDrillHeader } from "#components";
import { QueryBoundary, QueryErrorState, useSettingsViewerView } from "#data";
import { SaveStatusHostContext } from "#forms";
import { useFocusOnMount } from "#lib";
import type { CollectionGroupDefinition, ConfigGroupDefinition, ConfigGroupId, ConfigGroupRegistry, KindedSelection } from "#state";
import {
  clearCollectionSelection,
  configAnchorId,
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
import { ConfigSaveFooter } from "../components/config-save-footer.tsx";
import { SettingsUnreadableGate } from "../components/settings-unreadable-notice.tsx";
import { CONFIG_SECTION_LABEL, CONFIG_WELCOME } from "../lib/config-copy.ts";
import { scrollContentToTop, scrollToAnchor } from "../lib/config-jump.ts";
import { computeActiveSub, computeVisibleSettings } from "../lib/config-scroll-spy.ts";

const MAX_ANCHOR_POLL_FRAMES = 20;

export interface ConfigContentSurfaceProps {
  readonly groups: ConfigGroupRegistry;
}

export function ConfigContentSurface({ groups }: ConfigContentSurfaceProps): ReactElement {
  const contentRef = useRef<HTMLDivElement>(null);
  // Suppresses the scroll-spy for the duration of a programmatic jump so smooth-scroll can't flicker the
  // LIST; a ref, never state.
  const suppressSpyRef = useRef(false);
  const selection = useCollectionSelection();
  const activeGroup = useActiveConfigGroup();
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
  }, [target, groups, sectionRegistry, viewer]);

  // THE SPY, keyed on the active group: the section crossing the spy line lights the LIST row.
  useEffect(() => {
    const container = contentRef.current;
    if (container === null || activeGroup === null) {
      return;
    }
    const prefix = configAnchorId(activeGroup, "");
    let ticking = false;
    let waited = false;
    let tick = 0;
    // ONE PASS, TWO READINGS (#926 contract 4): the section crossing the spy line lights the LIST row, and
    // the rows intersecting the pane's box ARE the teacher's roster. Deriving them from a second observer
    // would let the pane and the LIST disagree about where the reader is by exactly one frame.
    const computeActive = (writeSub: boolean): void => {
      const sub = computeActiveSub(container, prefix);
      // ONE STORE WRITE for one measurement (the store's own tri-state doc carries the argument contract):
      // `undefined` leaves the section alone — either because the pass measured none, or because this tick
      // waited out a jump and the section the jump NAMED outranks the spy's guess (see `waited` below).
      setActiveConfigSub(writeSub && sub !== null ? sub : undefined, computeVisibleSettings(container, prefix));
    };
    // ONE rAF-COALESCED ENTRY POINT for all three triggers below, so a burst (a section resolving while the
    // reader scrolls) still costs one measurement per frame and the teacher cannot flicker per pixel.
    //
    // A SUPPRESSED REQUEST IS HELD, NEVER DROPPED, and that is the whole reason this is a loop (#926,
    // MEASURED as an empty roster in the CT): a jump suppresses the spy for up to `SPY_REARM_FALLBACK_MS`
    // (`config-jump.ts`) and the group's rows mount during exactly that window, so every mutation burst the
    // roster needs lands while suppressed — and after the jump re-arms, nothing fires again until the reader
    // happens to scroll. The LIST's row survived this only because `selectConfigGroup` names its first
    // section outright. Re-queueing on the next frame keeps the mid-flight frames out (which is what
    // suppression is for) while guaranteeing exactly one measurement the moment the jump settles.
    const run = (): void => {
      if (suppressSpyRef.current) {
        waited = true;
        tick = requestAnimationFrame(run);
        return;
      }
      ticking = false;
      // A TICK THAT WAITED OUT A JUMP MEASURES THE ROSTER ONLY. The jump NAMED the section the reader asked
      // for, and re-deriving it from the settled geometry overwrites that answer with the spy's own guess:
      // MEASURED (config-content-surface.ct "a distant section-row click lands on the target") — landing
      // "Effects" scrolls it to the top, which for the last-but-one section is also the scroller's BOTTOM,
      // and `computeActiveSub`'s at-bottom arm then lights "Library". The LIST would lie about where the
      // click just took you. The roster has no such authority to overwrite: nothing else declares it, and
      // what it reports is a pure fact about the settled viewport.
      computeActive(!waited);
      waited = false;
    };
    const schedule = (): void => {
      if (ticking) {
        return;
      }
      ticking = true;
      tick = requestAnimationFrame(run);
    };
    container.addEventListener("scroll", schedule, { passive: true });
    // A SCROLL LISTENER ALONE IS BLIND TO THE TWO OTHER WAYS THE VISIBLE SET CHANGES (#926), and they need
    // DIFFERENT observers because they are different facts:
    //  · the pane RESIZES — the owner's ruling is explicit that the roster's COUNT tracks the viewport, and
    //    a taller pane shows more rows at the same scrollTop. That is the scroller's own box ⇒ ResizeObserver.
    //  · the BODY CHANGES under a still scroller — a section's suspense resolving, the advanced fold opening,
    //    a dependent row appearing. MEASURED (#926 CT, first spelling): a `ResizeObserver` on the scroller
    //    does NOT fire for this, because the scroller is `h-full` and its own box never moves while
    //    scrollHeight grows — the roster stayed EMPTY until the reader's first scroll. So the mutation is
    //    watched as a mutation.
    // Neither is a second INTERSECTION observer: the viewport measurement itself is still the one spy pass.
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    const mutations = new MutationObserver(schedule);
    mutations.observe(container, { childList: true, subtree: true });
    let attempts = 0;
    let raf = 0;
    const initialCompute = (): void => {
      if (container.querySelector(`[id^="${prefix}"]`) === null && attempts++ < MAX_ANCHOR_POLL_FRAMES) {
        raf = requestAnimationFrame(initialCompute);
        return;
      }
      if (!suppressSpyRef.current) {
        computeActive(true);
      }
    };
    raf = requestAnimationFrame(initialCompute);
    return (): void => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(tick);
      resize.disconnect();
      mutations.disconnect();
      container.removeEventListener("scroll", schedule);
    };
  }, [activeGroup]);

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
          className="relative h-full min-h-0 flex-1 overflow-y-auto py-section outline-none"
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
 * THE EXIT ALONE — what the host draws while the member's own drill row cannot exist (DESIGN.md §3.4).
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
 * NO LIFECYCLE CHROME ON EITHER SPELLING (D121(D), #271). Delete is the ROW's kebab in every collection, and
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
              <Text as="span" id={foldLabelId} voice="kicker">
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
