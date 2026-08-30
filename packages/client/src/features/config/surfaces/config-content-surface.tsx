// The Settings CONTENT — in priority: the open collection MEMBER's own editor, MOUNTED in the pane
// (config-rail-spec.md C-7: never a dialog) · the ACTIVE settings group's body (the `sections`
// skimmer over the contributed sections — every settings-shaped group, §6.8 — or the honest placeholder) with the ONE aggregate
// save-status footer below the scroller (SET-SEAMS §3) · the designed welcome, never null.
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

import { Container, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { Fragment, useEffect, useRef } from "react";
import { QueryBoundary, QueryErrorState, useSettingsViewerView } from "#data";
import { SaveStatusHostContext } from "#forms";
import { useFocusOnMount } from "#lib";
import type { ConfigGroupDefinition, ConfigGroupId, ConfigGroupRegistry, KindedSelection } from "#state";
import {
  configAnchorId,
  configSectionNavs,
  isCollectionGroup,
  isPushingGroup,
  setActiveConfigSub,
  useActiveConfigGroup,
  useCollectionSelection,
  useConfigSectionRegistry,
  useConfigSections,
  useConfigTarget,
} from "#state";
import { ConfigGroupPlaceholder } from "../components/config-group-placeholder.tsx";
import { ConfigSaveFooter } from "../components/config-save-footer.tsx";
import { ConfigWelcome } from "../components/config-welcome.tsx";
import { CONFIG_SECTION_LABEL } from "../lib/config-copy.ts";
import { scrollContentToTop, scrollToAnchor } from "../lib/config-jump.ts";
import { computeActiveSub } from "../lib/config-scroll-spy.ts";

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
  useFocusOnMount(contentRef, selection !== null || activeGroup !== null);

  const active = activeGroup === null ? null : groups.get(activeGroup);
  // The active PUSHING group, or `null` when the pane shows the member or the welcome — ONE derivation the
  // region label, the footer and the arm all read.
  const shownGroup = selection === null && active !== null && isPushingGroup(active) ? active : null;
  const showsGroup = shownGroup !== null;

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
  }, [target, groups, sectionRegistry, viewer]);

  // THE SPY, keyed on the active group: the section crossing the spy line lights the LIST row.
  useEffect(() => {
    const container = contentRef.current;
    if (container === null || activeGroup === null) {
      return;
    }
    const prefix = configAnchorId(activeGroup, "");
    let ticking = false;
    const computeActive = (): void => {
      const sub = computeActiveSub(container, prefix);
      if (sub !== null) {
        setActiveConfigSub(sub);
      }
    };
    const onScroll = (): void => {
      if (suppressSpyRef.current || ticking) {
        return;
      }
      ticking = true;
      requestAnimationFrame((): void => {
        ticking = false;
        computeActive();
      });
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    let attempts = 0;
    let raf = 0;
    const initialCompute = (): void => {
      if (container.querySelector(`[id^="${prefix}"]`) === null && attempts++ < MAX_ANCHOR_POLL_FRAMES) {
        raf = requestAnimationFrame(initialCompute);
        return;
      }
      if (!suppressSpyRef.current) {
        computeActive();
      }
    };
    raf = requestAnimationFrame(initialCompute);
    return (): void => {
      cancelAnimationFrame(raf);
      container.removeEventListener("scroll", onScroll);
    };
  }, [activeGroup]);

  const regionLabel = shownGroup === null ? CONFIG_SECTION_LABEL : `${shownGroup.label} settings`;
  return (
    // THE CONTENT PANE OWNS THE SCROLL, once, for every group and member: the shell's own CONTENT region is
    // a bounded flex box with NO overflow, so a member editor taller than the viewport — a 60-entry world
    // book is ~3600px — would simply have its tail unreachable. The footer sits BELOW the scroller and never
    // scrolls away (the settings shell's column, re-homed).
    <Container className="h-full min-h-0">
      <Stack className="h-full min-h-0" gap="row">
        {/* `relative` is LOAD-BEARING (owner dogfood 2026-08-13 — "the settings screen scrolls past the end
            of its results"): Base UI form primitives park `sr-only` boxes at `position:absolute`, and an
            `overflow` scroller only clips descendants whose CONTAINING BLOCK is inside it. THE REGION PADS,
            NOT THE EDITORS (side-eye 2026-08-03 P1): `section` is the mock's editor-pane inset on the token
            scale, and a per-editor inset is the same defect waiting for the next group. */}
        <Stack
          aria-label={regionLabel}
          className="relative h-full min-h-0 flex-1 overflow-y-auto outline-none"
          data-slot="config-content"
          padding="section"
          ref={contentRef}
          role="region"
          tabIndex={-1}
        >
          <ContentArm active={shownGroup} groups={groups} selection={selection} />
        </Stack>
        {showsGroup ? <ConfigSaveFooter /> : null}
      </Stack>
    </Container>
  );
}

interface ContentArmProps {
  readonly groups: ConfigGroupRegistry;
  readonly selection: KindedSelection | null;
  /** The active PUSHING group, or `null` when the pane shows the member or the welcome. */
  readonly active: ConfigGroupDefinition | null;
}

/** The three arms, in priority: the open member's editor · the active group's body · the welcome. */
function ContentArm({ groups, selection, active }: ContentArmProps): ReactNode {
  if (selection !== null) {
    const group = groups.get(selection.kind as ConfigGroupId);
    return (
      <QueryBoundary
        fallback={<Text voice="gloss">Loading…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label={group.label.toLowerCase()} onRetry={retry} />}
      >
        <MemberBody group={group} memberId={selection.memberId} />
      </QueryBoundary>
    );
  }
  if (active !== null) {
    return (
      <SaveStatusHostContext value={true}>
        <GroupBody group={active} />
      </SaveStatusHostContext>
    );
  }
  return <ConfigWelcome groups={groups} />;
}

/** The open member's editor — the owning collection's `detail`, mounted. A selection can only name a
 *  collection group (its rows are the only writers), so the narrowing is a type fact, not a runtime guess. */
function MemberBody({ group, memberId }: { readonly group: ConfigGroupDefinition; readonly memberId: string }): ReactNode {
  if (!isCollectionGroup(group)) {
    return null;
  }
  return <>{group.body.collection.detail({ memberId })}</>;
}

/** The active group's body — reads the definition blind over the §3.1 body union (as amended by §6.8): a
 *  pure `sections` SKIMMER (the host renders the anchor's contributed sections, in door order — the ONLY
 *  render path a settings-shaped group has) or the DECLARED-PLANNED placeholder. Admin needs no extra guard
 *  here — the LIST and the search hide it from non-admin viewers via `when`, and a forced deep link hits the
 *  group's own server-gated error. A `collection` group never reaches here (`isPushingGroup`). */
function GroupBody({ group }: { readonly group: ConfigGroupDefinition }): ReactNode {
  const viewer = useSettingsViewerView();
  const sections = useConfigSections(group.id, viewer);
  if ("placeholder" in group.body) {
    return <ConfigGroupPlaceholder title={group.label} description={group.description} />;
  }
  if (group.body.kind === "collection") {
    return null;
  }
  return (
    <Stack gap="section">
      {sections.map((section) => (
        <Fragment key={section.id}>{section.node}</Fragment>
      ))}
    </Stack>
  );
}
