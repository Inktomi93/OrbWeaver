// settings-shell-surface — the settings overlay's body: a left nav (category/subcategory rows) with a
// fuzzy search above it, and a right column that mounts only the active category's pane.
//
// THIN HOST (client-architecture-lockdown.md §8, M6.1): the pane if-ladder is GONE — `SettingsPane` reads
// `useSettingsPaneRegistry().get(active).body` blind over the §5.3 body union. The `SettingsViewerView` a
// `when` predicate consumes comes from `#data`'s `useSettingsViewerView()` (its ONE derivation home), and
// the host runs it at nav/search/pane-filter time — pane DEFS never touch `#data` for this.
//
// The `useSettingsPaneRegistry` read + the `settings-pane-completeness` gate keep the host blind: it never
// imports a pane body.
//
// Active-tracking is a SELECTION × SCROLL-SPY hybrid: the active category is pure selection (nav click or
// search jump); within that pane the active subcategory tracks scroll (a passive, rAF-throttled listener
// lights the last section past the spy line), suppressed while a programmatic jump is in flight. A deep
// link may name a SUBCATEGORY (`openSettingsTo(category, subId)`, SET-SEAMS §10 Q4), which lands on that
// section's anchor via the same jump path.
//
// SET-SEAMS §5.2: contributed sections arrive on ONE door-assembled registry the host reads for NAV +
// SEARCH (each pane's own `subcategories` ⊕ the navs contributed at its anchor — the retired `make*Pane`
// factories used to merge this); the pane's own surface renders them at the position IT owns. §3: the host
// is also the ONE aggregate save-status footer for the sections that report into it.
//
// NARROW ARM = PUSH-DETAIL (side-eye 2026-08-01, P0). Below the `@md` container step the two columns do NOT
// stack: the nav list takes the whole pane, selecting a section PUSHES the pane over it with a back row, and
// back returns to the list — the house mobile master/detail flow. The stacked arm it replaces gave the
// content a 60px window (nav scrollHeight 1042 + content scrollHeight 4415 inside a 740px viewport), with
// the pane's first control off-screen at y=754. This is CONTAINER-queried, not viewport-queried: a feature
// is never viewport-aware (`no-raw-matchmedia`; the shell owns the one @media), and the columns are already
// sized off this container. The wide split is untouched.

import { Button } from "@orb/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList, CommandStatus } from "@orb/ui/command";
import { ChevronLeft, Icon } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { scrollBehavior } from "@orb/ui/lib";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode, RefObject } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import { useSettingsViewerView } from "#data";
import { SaveStatusHostContext } from "#forms";
import { useFocusOnMount } from "#lib";
import type { SettingsCategoryId, SettingsPaneDefinition, SettingsSubcategory } from "#state";
import {
  SETTINGS_GROUPS,
  settingsAnchorId,
  settingsSectionNavs,
  useErroredSaveSections,
  useSettingsPaneRegistry,
  useSettingsSectionRegistry,
  useSettingsSections,
  useSettingsSubTarget,
  useSettingsTarget,
} from "#state";
import { SettingsPanePlaceholder } from "../components/settings-pane-placeholder.tsx";
import { SettingsSaveFooter } from "../components/settings-save-footer.tsx";
import { SETTINGS_GROUP_LABELS } from "../lib/settings-nav-model.ts";
import { afterPaint, computeActiveSub, flashAnchor } from "../lib/settings-scroll-spy.ts";
import type { SettingsSearchEntry } from "../lib/settings-search.ts";
import { buildSettingsSearchEntries } from "../lib/settings-search.ts";

/** Narrow the shell store's typed `settingsCategory` deep-link to the tuple (defensive against a stale
 *  persisted/cross-version value; the type already guarantees a live category, but `null` still routes
 *  through here). */
function isCategoryId(v: SettingsCategoryId | null): v is SettingsCategoryId {
  return v !== null;
}

/** The category ids for one group, in the registry's declared order. */
function categoryIdsForGroup(panes: readonly SettingsPaneDefinition[], group: (typeof SETTINGS_GROUPS)[number]): readonly SettingsPaneDefinition[] {
  return panes.filter((pane) => pane.group === group);
}

/** Suppress the scroll-spy for the duration of a programmatic jump so smooth-scroll can't flicker the nav.
 *  Re-arms on the container's `scrollend`, with a wall-clock fallback for a jump that never scrolls. */
function beginProgrammaticScroll(contentRef: RefObject<HTMLDivElement | null>, suppressSpyRef: RefObject<boolean>): void {
  suppressSpyRef.current = true;
  const container = contentRef.current;
  const rearm = (): void => {
    suppressSpyRef.current = false;
  };
  container?.addEventListener("scrollend", rearm, { once: true });
  globalThis.setTimeout(rearm, SPY_REARM_FALLBACK_MS);
}

/**
 * Jump to a section anchor inside the pane column. Switching category remounts the pane, which may SUSPEND
 * on its settings read — under CPU contention the resolve can outlast any frame budget, and the old
 * 20-frame rAF poll silently gave up without ever scrolling (the fuzzy-search jump flake, root-caused
 * 2026-07-24). Observe the pane's DOM until the anchor exists (wall-clock-bounded) instead of guessing
 * frames. Module-scope (refs threaded in) so no effect ever takes it as a dependency — D54 bans manual memo,
 * and an in-component definition would re-arm the deep-link effect every render.
 */
function scrollToAnchor(categoryId: SettingsCategoryId, subId: string, contentRef: RefObject<HTMLDivElement | null>, suppressSpyRef: RefObject<boolean>): void {
  beginProgrammaticScroll(contentRef, suppressSpyRef);
  const anchorId = settingsAnchorId(categoryId, subId);
  const container = contentRef.current;
  if (container === null) {
    return;
  }
  const find = (): HTMLElement | null => container.querySelector<HTMLElement>(`#${CSS.escape(anchorId)}`);
  const existing = find();
  if (existing !== null) {
    afterPaint((): void => flashAnchor(existing));
    return;
  }
  let done = false;
  const finish = (target: HTMLElement | null): void => {
    if (done) {
      return;
    }
    done = true;
    observer.disconnect();
    globalThis.clearTimeout(timer);
    if (target !== null) {
      afterPaint((): void => flashAnchor(target));
    }
  };
  const observer = new MutationObserver((): void => {
    const target = find();
    if (target !== null) {
      finish(target);
    }
  });
  const timer = globalThis.setTimeout((): void => finish(null), ANCHOR_WAIT_MS);
  observer.observe(container, { childList: true, subtree: true });
}

/** The settings overlay body: nav (search + grouped category/subcategory rows) on the left, the active
 *  pane on the right. */
export function SettingsShell(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  const registry = useSettingsPaneRegistry();
  const panes = registry.list();
  const sectionRegistry = useSettingsSectionRegistry();

  // The ONE `when` projection (non-suspense — gating must never block a pane from painting), shared by the
  // pane filter, the section filter, and the search index.
  const viewer = useSettingsViewerView();
  const visiblePanes = panes.filter((pane) => pane.when?.(viewer) ?? true);
  const visibleIds = new Set(visiblePanes.map((p) => p.id));

  // A pane's nav rows: its OWN subcategories ⊕ the navs contributed at its anchor, in declared registry
  // order — the merge the retired pane factories did, now done once here off the one section registry.
  const subcategoriesFor = (pane: SettingsPaneDefinition): readonly SettingsSubcategory[] => [
    ...(pane.subcategories ?? []),
    ...settingsSectionNavs(sectionRegistry, pane.id, viewer),
  ];

  // Landing at the TOP of a pane IS landing on its first section, so the nav says so immediately instead of
  // waiting for the scroll-spy: a category-level select suppresses the spy for the duration of its
  // programmatic scroll, which left the whole nav with no current row for up to `SPY_REARM_FALLBACK_MS`.
  const firstSubIdOf = (id: SettingsCategoryId): string | null => subcategoriesFor(registry.get(id))[0]?.id ?? null;

  // The failing sections' nav rows (§3): the aggregate footer is read-only, so the LOCATION of a failure is
  // carried by a marker on the section's own nav row (and its own inline retry at its anchor).
  const erroredSectionIds = useErroredSaveSections();
  const erroredSubIds = new Set(erroredSectionIds.filter((id) => sectionRegistry.has(id)).map((id) => sectionRegistry.get(id).nav.id));

  // A cross-feature deep-link can request a specific pane via the shell store's `settingsCategory` seam;
  // honor it as the initial pane and whenever it changes (a `when`-hidden target falls back to the default).
  const targetCategory = useSettingsTarget();
  const targetSub = useSettingsSubTarget();
  const targetSatisfiable = isCategoryId(targetCategory) && visibleIds.has(targetCategory);
  const initialCategory: SettingsCategoryId = targetSatisfiable ? targetCategory : DEFAULT_CATEGORY;
  const [active, setActive] = useState<SettingsCategoryId>(initialCategory);
  // Adjust state during render (never a setState-in-effect cascade) when the deep-link target changes OR when
  // an as-yet-UNSATISFIED target becomes satisfiable — the latter is the deep-link-to-when-gated-pane race:
  // a cold `openSettings('admin')` resolves `active` while the non-suspense sessions.me probe is in flight
  // (isAdmin false → 'admin' not yet in visibleIds), so we must re-apply once the probe resolves and
  // visibility GROWS, not only when the target string itself changes. Keying the "seen" latch on
  // (target, satisfiable) re-fires exactly then, and never again once applied (satisfiable stays true).
  const [seen, setSeen] = useState<{ readonly target: SettingsCategoryId | null; readonly satisfiable: boolean; readonly sub: string | null }>({
    target: targetCategory,
    satisfiable: targetSatisfiable,
    sub: targetSub,
  });
  const [activeSub, setActiveSub] = useState<string | null>((targetSatisfiable ? targetSub : null) ?? firstSubIdOf(initialCategory));
  // The narrow arm's PUSH state — `true` = the detail (pane) is over the nav list. Meaningless at/above the
  // `@md` container step, where both columns paint regardless, so it needs no reset on resize: a user who
  // widens the window sees the split they always saw, and one who narrows it lands on the pane they last
  // opened (with the back row that gets them out). A deep link opens PUSHED — it named a destination.
  const [pushed, setPushed] = useState(targetSatisfiable);
  // A SUB-level deep link (`openSettingsTo(category, subId)`, §10 Q4) rides the SAME latch: the pane and the
  // selected sub resolve here, in render; only the SCROLL is deferred (the anchor exists after the pane has
  // mounted — the effect below waits for it), so no state is ever set from an effect.
  if (targetCategory !== seen.target || targetSatisfiable !== seen.satisfiable || targetSub !== seen.sub) {
    setSeen({ target: targetCategory, satisfiable: targetSatisfiable, sub: targetSub });
    if (targetSatisfiable) {
      setActive(targetCategory);
      setActiveSub(targetSub ?? firstSubIdOf(targetCategory));
      setPushed(true);
    }
  }
  const [query, setQuery] = useState("");
  const hasQuery = query.trim() !== "";
  // Suppresses the scroll-spy for the duration of a programmatic jump so smooth-scroll can't flicker the nav; a ref, never state.
  const suppressSpyRef = useRef(false);

  const searchEntries = buildSettingsSearchEntries(registry, (id) => visibleIds.has(id as SettingsCategoryId), subcategoriesFor);

  // Land a SUB-level deep link once the pane has mounted (§10 Q4) — `scrollToAnchor` observes the pane's DOM
  // until the anchor exists. Keyed on the TARGET (never on `active`), so a later user pane-switch can't
  // re-fire a stale jump. The jump helpers are module-scope over the two refs, so the deps are the deep-link
  // target alone — exactly what they were when `scrollToAnchor` was a ref-only manual-memo callback.
  useEffect((): void => {
    if (!(targetSatisfiable && targetSub !== null)) {
      return;
    }
    scrollToAnchor(targetCategory, targetSub, contentRef, suppressSpyRef);
  }, [targetCategory, targetSub, targetSatisfiable]);

  /** Scroll the pane column back to its top — deferred a frame like every other programmatic scroll here
   *  (see {@link afterPaint}). */
  const scrollContentToTop = (): void => {
    beginProgrammaticScroll(contentRef, suppressSpyRef);
    afterPaint((): void => contentRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() }));
  };

  const selectCategory = (id: SettingsCategoryId): void => {
    setActive(id);
    // Landing at the top of the pane IS landing on its first section — say so, instead of leaving the nav
    // with no current row until the suppressed spy re-arms.
    setActiveSub(firstSubIdOf(id));
    setPushed(true);
    scrollContentToTop();
  };

  const selectSub = (id: SettingsCategoryId, subId: string): void => {
    setActive(id);
    setActiveSub(subId);
    setPushed(true);
    scrollToAnchor(id, subId, contentRef, suppressSpyRef);
  };

  /** Jump to a REPORTING section by its contribution id — the aggregate footer's "take me to the failure"
   *  (§3: the footer never retries, it only locates). A `surface`-mode pane may report a save status under
   *  an id that is NOT a section contribution (Connections → Model roles), so the footer asks first and
   *  omits its locator rather than offering a button that silently no-ops. */
  const canJumpToSection = (sectionId: string): boolean => sectionRegistry.has(sectionId);
  const jumpToSection = (sectionId: string): void => {
    if (!canJumpToSection(sectionId)) {
      return;
    }
    const contribution = sectionRegistry.get(sectionId);
    selectSub(contribution.anchor, contribution.nav.id);
  };

  const jumpToEntry = (entry: SettingsSearchEntry): void => {
    const categoryId = entry.categoryId as SettingsCategoryId;
    setActive(categoryId);
    setActiveSub(entry.subId ?? firstSubIdOf(categoryId));
    setQuery("");
    setPushed(true);
    if (entry.subId === null) {
      scrollContentToTop();
    } else {
      scrollToAnchor(categoryId, entry.subId, contentRef, suppressSpyRef);
    }
  };

  useEffect(() => {
    const container = contentRef.current;
    if (container === null) {
      return;
    }
    const prefix = settingsAnchorId(active, "");
    let ticking = false;
    const computeActive = (): void => {
      const sub = computeActiveSub(container, prefix);
      if (sub !== null) {
        setActiveSub(sub);
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
  }, [active]);

  const activePane = registry.get(active);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none h-full">
      <Container className="h-full">
        <Stack className="h-full min-h-0" gap="section">
          <Stack role="search" aria-label="Settings search">
            <Command label="Search settings">
              <CommandInput aria-label="Search settings" onValueChange={setQuery} placeholder="Search settings…" value={query} />
              {hasQuery ? (
                <CommandList className="max-h-(--container-cq-sm)">
                  <CommandStatus />
                  <CommandEmpty>{`No settings match “${query.trim()}”.`}</CommandEmpty>
                  {searchEntries.map((entry) => (
                    <CommandItem key={entry.id} keywords={[...entry.keywords]} onSelect={(): void => jumpToEntry(entry)} value={entry.id}>
                      <Text>{entry.label}</Text>
                      {entry.label === entry.categoryLabel ? null : <Text voice="gloss">{entry.categoryLabel}</Text>}
                    </CommandItem>
                  ))}
                </CommandList>
              ) : null}
            </Command>
          </Stack>

          {/* PUSH-DETAIL, not a stack: below `@md` exactly ONE of the two columns paints, so each gets the
              whole pane instead of splitting a phone's height into two unusable windows. Above it both
              paint and the `@max-md:` arms are inert — the wide split is unchanged. */}
          <Row align="stretch" className="min-h-0 flex-1" gap="section">
            <Stack
              role="navigation"
              aria-label="Settings sections"
              className={`relative w-(--width-sidebar-sm) min-h-0 shrink-0 overflow-y-auto @max-md:w-full ${pushed ? "@max-md:hidden" : ""}`}
              gap="section"
            >
              {SETTINGS_GROUPS.map((group) => (
                <Stack key={group} gap="row">
                  <Text voice="kicker">{SETTINGS_GROUP_LABELS[group]}</Text>
                  {categoryIdsForGroup(visiblePanes, group).map((pane) => {
                    const isActive = active === pane.id;
                    const subs = subcategoriesFor(pane);
                    return (
                      <Stack key={pane.id} gap="field">
                        {/* A pane WITH sections is a disclosure GROUP, not a nav leaf: it expands
                            (`aria-expanded`) and its children carry the one "you are here" marker. A pane
                            with no sections IS the leaf, so it keeps `aria-current` itself. Two
                            `aria-current` rows for one location was the side-eye a11y defect. */}
                        <ListRow
                          clickable={true}
                          leading={<Icon icon={pane.icon} size="sm" />}
                          onClick={(): void => selectCategory(pane.id)}
                          title={pane.label}
                          {...(subs.length > 0 ? { expanded: isActive } : { selected: isActive })}
                        />
                        {isActive && subs.length > 0 ? (
                          <Stack className="ps-(--spacing-section)" gap="field">
                            {subs.map((sub) => (
                              // The nav row renders `navLabel` when the section declares one — a name too long
                              // for the 220px column is ABBREVIATED here, never renamed at its heading. The
                              // full `label` rides `fullTitle` so hovering recovers it.
                              <ListRow
                                key={sub.id}
                                clickable={true}
                                {...(erroredSubIds.has(sub.id) ? { meta: SAVE_FAILED_MARKER } : {})}
                                fullTitle={sub.label}
                                onClick={(): void => selectSub(pane.id, sub.id)}
                                selected={activeSub === sub.id}
                                title={sub.navLabel ?? sub.label}
                              />
                            ))}
                          </Stack>
                        ) : null}
                      </Stack>
                    );
                  })}
                </Stack>
              ))}
            </Stack>

            <Stack className={`min-h-0 flex-1 ${pushed ? "" : "@max-md:hidden"}`} gap="row">
              {/* The pushed detail's way out. Narrow-only (`@md:hidden`), and it names the pane it is
                  leaving so the back row doubles as the detail's title — at this width the nav that
                  otherwise carries that fact is off-screen. */}
              <Row className="@md:hidden" gap="field">
                <Button aria-label="Back to settings sections" intent="ghost" onClick={(): void => setPushed(false)} size="icon" type="button">
                  <Icon icon={ChevronLeft} size="sm" />
                </Button>
                <Text voice="kicker">{activePane.label}</Text>
              </Row>
              {/* `relative` is LOAD-BEARING, not decoration (owner dogfood 2026-08-13 — "the settings screen
                  scrolls past the end of its results"). Base UI form primitives park `sr-only` boxes at
                  `position:absolute` (NumberField's bounds announcer, Switch/Checkbox's hidden input) — 35 of
                  them in the Appearance pane alone. An `overflow` scroller only clips descendants whose
                  CONTAINING BLOCK is inside it, so with a static scroller every one of those boxes resolved
                  its containing block up to the modal popup and added its static position — thousands of px
                  down a scrolled pane — to the POPUP's scrollable area. Measured live at 1920×1080: popup
                  clientHeight 1014 / scrollHeight 2900, i.e. 1886px of empty card below the last row. */}
              <Stack ref={contentRef} role="region" aria-label={`${activePane.label} settings`} className="relative min-h-0 flex-1 overflow-y-auto">
                <SaveStatusHostContext value={true}>
                  <SettingsPane pane={activePane} />
                </SaveStatusHostContext>
              </Stack>
              <SettingsSaveFooter canJumpToSection={canJumpToSection} onJumpToSection={jumpToSection} />
            </Stack>
          </Row>
        </Stack>
      </Container>
    </Stack>
  );
}

// The nav-row marker for a section whose save FAILED (§3) — a short string so it rides ListRow's `meta`
// slot (inside the row's aria-describedby), never a bare icon a screen reader can't read.
const SAVE_FAILED_MARKER = "Save failed";
/** The pane the shell opens on with no deep-link target. */
const DEFAULT_CATEGORY = "appearance";
const MAX_ANCHOR_POLL_FRAMES = 20;
// Wall-clock bound for the anchor-appearance observer (a suspending pane can outlast any frame count
// under contention; frames are not time). Generous — the observer fires the instant the anchor mounts,
// so the bound only matters when the pane never resolves at all.
const ANCHOR_WAIT_MS = 5000;
const SPY_REARM_FALLBACK_MS = 700;

/** The active pane — reads the registry blind over the §5.3 body union: a feature-owned `surface` (which
 *  renders its own anchored sections), a pure `sections` SKIMMER (the host renders the anchor's sections
 *  itself), or the DECLARED-PLANNED placeholder. Admin needs no extra guard here — the nav/search hide it
 *  from non-admin viewers via `when`, and a forced deep-link hits the pane's own server-gated error. */
function SettingsPane({ pane }: { readonly pane: SettingsPaneDefinition }): ReactNode {
  const viewer = useSettingsViewerView();
  const sections = useSettingsSections(pane.id, viewer);
  if ("placeholder" in pane.body) {
    return <SettingsPanePlaceholder title={pane.label} description={pane.description} />;
  }
  if (pane.body.kind === "surface") {
    return pane.body.render();
  }
  return (
    <Stack gap="section">
      {sections.map((section) => (
        <Fragment key={section.id}>{section.node}</Fragment>
      ))}
    </Stack>
  );
}
