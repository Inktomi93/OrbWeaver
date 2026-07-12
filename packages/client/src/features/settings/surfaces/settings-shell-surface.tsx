// settings-shell-surface — the settings overlay's body (ux-flow-revamp J11 · UI-Arch §4.2 region map).
// A left nav (navigation landmark) with the USER/APP group headings + Discord/VS-Code-style category
// rows and, under the active category, indented SUBCATEGORY rows (one per anchored pane section). Above
// the tree sits a fuzzy search (the sealed @orb/ui/command / cmdk engine) that indexes the whole
// SETTINGS_INDEX (categories · subcategories · individual settings, matched over label + keywords) and,
// on a result click, JUMPS to that pane + subcategory anchor with a brief highlight. The right column is
// a labelled region that mounts ONLY the active category's pane (lazy panes).
//
// The route composes this over the `settings` modal slot (home-page.tsx `modals={{settings}}`); the modal
// is the Dialog `xl` variant (modal-slots.tsx + ModalHost's flex-column popup). The surface is the
// containment CONSUMER (§2.1) — its root is a `<Container>`.
//
// ACTIVE-TRACKING MODEL — a SELECTION × SCROLL-SPY hybrid (owner ruling: active subcategory tracks
// scroll). The active CATEGORY is pure selection — the last category the user picked (nav click or a
// search jump) drives which pane mounts + its `aria-current`. WITHIN that pane the active SUBCATEGORY
// tracks SCROLL: a passive, rAF-throttled scroll listener on the pane's scroll container lights the last
// section whose top has crossed the spy line (classic scroll-spy — see the effect below), suppressed
// while a programmatic jump is in flight so a click/search jump wins cleanly. Not an IntersectionObserver
// (a plain scrollTop compare is enough + gives the "short trailing section still wins" behavior); keyed
// on LOCAL `active` state, so it is not the banned shared-selection effect. The jump itself rAF-polls for
// the anchor node (the pane may be suspending on its settings read when switched into from another
// category), then lights the first section at rest.
//
// REAL vs PLACEHOLDER (J11): Appearance + Personas + Tags + Workloads + Connections (the role-slot +
// key-library pane, W10 Panel 1) + System (the APP-tier AppSettings home, Task #37) + Admin are the real
// panes (setting-row / form / list grammar); every other category renders its distinct teaching placeholder
// (SettingsPanePlaceholder). Generation config is NOT here (it is the Presets rail section — the governing
// split).

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandStatus,
} from "@orb/ui/command";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve Icon fine (the character-library-surface.tsx precedent).
import { Icon } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { useSettingsTarget } from "#state";
import { SettingsPanePlaceholder } from "../components/settings-pane-placeholder";
import { scrollBehavior } from "../lib/scroll-behavior";
import { categoryIdsForGroup, SETTINGS_CATEGORIES } from "../lib/settings-nav";
import {
  SETTINGS_CATEGORY_IDS,
  SETTINGS_GROUP_LABELS,
  SETTINGS_GROUPS,
  settingsAnchorId,
} from "../lib/settings-nav-model";
import type { SettingsSearchEntry } from "../lib/settings-search";
import { SETTINGS_SEARCH_ENTRIES } from "../lib/settings-search";
import { AdminSettingsSurface } from "./admin-settings-surface";
import { AppearanceSettingsSurface } from "./appearance-settings-surface";
import { BackupSettingsSurface } from "./backup-settings-surface";
import { ConnectionsSettingsSurface } from "./connections-settings-surface";
import { PersonaSettingsSurface } from "./persona-settings-surface";
import { SystemSettingsSurface } from "./system-settings-surface";
import { TagsSettingsSurface } from "./tags-settings-surface";
import { WorkloadsSettingsSurface } from "./workloads-settings-surface";

// The active-category id — a LOCAL (non-exported) alias derived from the tuple (an exported alias would be
// the types-in-contract leak the nav registry avoids; local is fine).
type CategoryId = (typeof SETTINGS_CATEGORY_IDS)[number];

/** Narrow the shell store's opaque `settingsCategory` deep-link string to a real category id (an unknown id
 *  falls back to the default pane). Keeps the store domain-agnostic — the registry check lives here. */
function isCategoryId(v: string | null): v is CategoryId {
  return v !== null && (SETTINGS_CATEGORY_IDS as readonly string[]).includes(v);
}

/** The settings overlay body: nav (search + grouped category/subcategory rows) on the left, the active
 *  pane on the right. */
export function SettingsShell(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  // ADMIN-GATE (UX honesty — the server's `adminProcedure` is the floor): `adminOnly` categories render
  // in the nav/search only for owner ∪ admin viewers. A plain, NON-suspense read so the shell never
  // blocks on it — while it resolves (or for a plain user) the gated rows simply aren't there.
  const trpc = useTRPC();
  const viewerQuery = useQuery(trpc.sessions.me.queryOptions());
  const isAdminViewer =
    viewerQuery.data?.globalRole === "owner" || viewerQuery.data?.globalRole === "admin";
  const visibleCategory = (id: CategoryId): boolean =>
    SETTINGS_CATEGORIES[id].adminOnly !== true || isAdminViewer;

  // A cross-feature deep-link (e.g. the character editor's "Manage tags") can request a specific pane via the
  // shell store's opaque `settingsCategory` seam; honor it as the initial pane + whenever it changes (an
  // unknown id falls back to the default). Validated here against the registry — the store stays domain-agnostic.
  const targetCategory = useSettingsTarget();
  const [active, setActive] = useState<CategoryId>(() =>
    isCategoryId(targetCategory) ? targetCategory : "appearance",
  );
  // Honor a deep-link when the REQUESTED category changes — React's "adjust state during render on a prop
  // change" pattern (not a setState-in-effect cascade). A user nav click still `setActive`s freely between links.
  const [seenTarget, setSeenTarget] = useState(targetCategory);
  if (targetCategory !== seenTarget) {
    setSeenTarget(targetCategory);
    if (isCategoryId(targetCategory)) {
      setActive(targetCategory);
    }
  }
  // The active subcategory — drives aria-current on the indented rows. Set instantly on a click/search
  // jump AND tracked by the scroll-spy below as the user scrolls the pane. `null` = above the first
  // section (only the category row carries aria-current then).
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const hasQuery = query.trim() !== "";
  // While TRUE, the scroll-spy ignores scroll events — set for the duration of a programmatic (click/
  // search) jump so the smooth-scroll passing over intermediate sections can't flicker the nav through
  // them; re-armed on `scrollend` (+ a timeout fallback). A ref, never state — it must not re-render.
  const suppressSpyRef = useRef(false);

  // Suppress the spy for a programmatic scroll, re-arming when the scroll settles. `scrollend` fires once
  // the browser's smooth scroll lands (Chromium); the timeout is the fallback for engines without it.
  const beginProgrammaticScroll = (): void => {
    suppressSpyRef.current = true;
    const container = contentRef.current;
    const rearm = (): void => {
      suppressSpyRef.current = false;
    };
    container?.addEventListener("scrollend", rearm, { once: true });
    globalThis.setTimeout(rearm, SPY_REARM_FALLBACK_MS);
  };

  // Scroll the active pane's anchor into view with a brief highlight. rAF-polls because switching category
  // remounts the pane (which may suspend on its settings read) — the anchor node isn't in the DOM the
  // frame the click fires. Imperative DOM + a local ref, so this is NOT a shared-selection effect (gate).
  const scrollToAnchor = (categoryId: CategoryId, subId: string): void => {
    beginProgrammaticScroll();
    const anchorId = settingsAnchorId(categoryId, subId);
    let attempts = 0;
    const tick = (): void => {
      const target = contentRef.current?.querySelector<HTMLElement>(`#${CSS.escape(anchorId)}`);
      if (target !== null && target !== undefined) {
        flashAnchor(target);
        return;
      }
      attempts += 1;
      if (attempts < MAX_ANCHOR_POLL_FRAMES) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  };

  const selectCategory = (id: CategoryId): void => {
    setActive(id);
    setActiveSub(null);
    beginProgrammaticScroll();
    contentRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() });
  };

  const selectSub = (id: CategoryId, subId: string): void => {
    setActive(id);
    setActiveSub(subId);
    scrollToAnchor(id, subId);
  };

  // A search result click: switch pane, clear the query (so the tree returns and the user SEES where they
  // landed), and jump to the matched anchor (or the pane top for a category-level hit).
  const jumpToEntry = (entry: SettingsSearchEntry): void => {
    setActive(entry.categoryId);
    setActiveSub(entry.subId);
    setQuery("");
    if (entry.subId === null) {
      beginProgrammaticScroll();
      contentRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() });
    } else {
      scrollToAnchor(entry.categoryId, entry.subId);
    }
  };

  // Scroll-spy (owner ruling — active subcategory tracks scroll): a passive scroll listener on the pane's
  // scroll container picks the LAST section whose top has crossed the spy line (classic scroll-spy — a
  // short section at the very bottom still wins once you scroll to it). rAF-throttled; skipped while a
  // programmatic jump is in flight. Keyed on `active` (LOCAL state, not a store pointer) → not the
  // banned shared-selection effect; the listener re-attaches when the pane changes.
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
    // Light the first section at REST (before any scroll) — rAF-poll until the pane resolves its
    // suspending settings read, then compute once (unless a jump is already steering).
    let attempts = 0;
    let raf = 0;
    const initialCompute = (): void => {
      if (
        container.querySelector(`[id^="${prefix}"]`) === null &&
        attempts++ < MAX_ANCHOR_POLL_FRAMES
      ) {
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

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none h-full">
      <Container className="h-full">
        {/* Vertical: a FULL-WIDTH search bar on top, then the nav | pane row below it (VS-Code grammar).
            Search spans both columns (not tucked in the nav) so it reads as one coherent bar — never a
            column-width orphan — AND the nav's "USER" heading and the pane's first section start at the
            SAME baseline (the search no longer pushes the nav down relative to the pane). */}
        <Stack className="h-full min-h-0" gap="section">
          <Stack role="search" aria-label="Settings search">
            <Command label="Search settings">
              <CommandInput
                aria-label="Search settings"
                onValueChange={setQuery}
                placeholder="Search settings…"
                value={query}
              />
              {hasQuery ? (
                <CommandList className="max-h-(--container-cq-sm)">
                  <CommandStatus />
                  <CommandEmpty>{`No settings match “${query.trim()}”.`}</CommandEmpty>
                  {SETTINGS_SEARCH_ENTRIES.filter((entry) => visibleCategory(entry.categoryId)).map(
                    (entry) => (
                      <CommandItem
                        key={entry.id}
                        keywords={[...entry.keywords]}
                        onSelect={(): void => jumpToEntry(entry)}
                        value={entry.id}
                      >
                        <Text size="body">{entry.label}</Text>
                        {entry.label === entry.categoryLabel ? null : (
                          <Text size="micro" tone="muted">
                            {entry.categoryLabel}
                          </Text>
                        )}
                      </CommandItem>
                    ),
                  )}
                </CommandList>
              ) : null}
            </Command>
          </Stack>

          {/* align="stretch" (the Row default) — each column FILLS the row height so its own `min-h-0
              overflow-y-auto` engages and it scrolls INTERNALLY (side-eye round-3). NARROW-CONTAINER
              reflow (§4b axis 1 — @container, not viewport): below `@md` the columns STACK. */}
          <Row align="stretch" className="min-h-0 flex-1 @max-md:flex-col" gap="section">
            <Stack
              role="navigation"
              aria-label="Settings sections"
              className="w-(--width-sidebar-sm) min-h-0 shrink-0 overflow-y-auto @max-md:max-h-(--container-cq-sm) @max-md:w-full"
              gap="section"
            >
              {SETTINGS_GROUPS.map((group) => (
                <Stack key={group} gap="row">
                  <Text size="micro" weight="semibold" tone="muted" transform="caps">
                    {SETTINGS_GROUP_LABELS[group]}
                  </Text>
                  {categoryIdsForGroup(group)
                    .filter(visibleCategory)
                    .map((id) => {
                      const category = SETTINGS_CATEGORIES[id];
                      const isActive = active === id;
                      const subs = category.subcategories ?? [];
                      return (
                        <Stack key={id} gap="field">
                          <ListRow
                            clickable={true}
                            leading={<Icon icon={category.icon} size="sm" />}
                            onClick={(): void => selectCategory(id)}
                            selected={isActive}
                            title={category.label}
                          />
                          {isActive && subs.length > 0 ? (
                            <Stack className="ps-(--spacing-section)" gap="field">
                              {subs.map((sub) => (
                                <ListRow
                                  key={sub.id}
                                  clickable={true}
                                  onClick={(): void => selectSub(id, sub.id)}
                                  selected={activeSub === sub.id}
                                  title={sub.label}
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

            <Stack
              ref={contentRef}
              role="region"
              aria-label={`${SETTINGS_CATEGORIES[active].label} settings`}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <SettingsPane category={active} />
            </Stack>
          </Row>
        </Stack>
      </Container>
    </Stack>
  );
}

// A brief highlight of the jumped-to anchor: scroll it to the top of the pane, ring it, then fade the ring.
// An INSET box-shadow (not an outline) so the ring is CLIPPED TO the section's border-box — it hugs the
// section's rendered content box exactly (header → last field) and can never bleed past / be clipped at
// the scroll container's edge the way an outset outline would (owner P3 · §4.3). Token vars only (no raw
// hex). Respects reduced-motion for the scroll itself.
const FLASH_MS = 1200;
const MAX_ANCHOR_POLL_FRAMES = 20;
// Scroll-spy tuning: the "active" section is the last whose top has crossed this fraction of the pane
// height from the top; the fallback re-arms the spy if `scrollend` never fires (non-Chromium engines).
const SPY_LINE_RATIO = 0.3;
const SPY_REARM_FALLBACK_MS = 700;
const SPY_BOTTOM_EPS = 2;

/** The subcategory id that scroll position currently makes "active": the last section whose top has
 *  crossed the spy line — or, at the very bottom, the last section (so a short trailing section still
 *  wins). `prefix` is the active category's anchor prefix (`settings-anchor-<cat>-`). */
function computeActiveSub(container: HTMLElement, prefix: string): string | null {
  const sections = [...container.querySelectorAll<HTMLElement>(`[id^="${prefix}"]`)];
  if (sections.length === 0) {
    return null;
  }
  const last = sections.at(-1);
  const atBottom =
    container.scrollTop + container.clientHeight >= container.scrollHeight - SPY_BOTTOM_EPS;
  if (atBottom && last !== undefined) {
    return last.id.slice(prefix.length);
  }
  const line = container.getBoundingClientRect().top + container.clientHeight * SPY_LINE_RATIO;
  let current = sections[0];
  for (const section of sections) {
    if (section.getBoundingClientRect().top <= line) {
      current = section;
    } else {
      break;
    }
  }
  return current === undefined ? null : current.id.slice(prefix.length);
}
function flashAnchor(el: HTMLElement): void {
  el.scrollIntoView({ block: "start", behavior: scrollBehavior() });
  el.style.boxShadow = "inset 0 0 0 2px var(--color-ring)";
  el.style.borderRadius = "var(--radius-card)";
  el.style.transition = "box-shadow var(--motion-base) ease-out";
  globalThis.setTimeout(() => {
    el.style.removeProperty("box-shadow");
    el.style.removeProperty("border-radius");
    el.style.removeProperty("transition");
  }, FLASH_MS);
}

/** The active pane — Appearance + Personas + Tags + System + Admin are real; every other category is a
 *  placeholder. Admin needs no extra guard here: the nav/search hide it from non-admin viewers, and a
 *  forced deep-link just hits the pane's own "administrators only" QueryBoundary error (server-gated). */
function SettingsPane({ category }: { readonly category: CategoryId }): ReactElement {
  const def = SETTINGS_CATEGORIES[category];
  if (category === "appearance") {
    return <AppearanceSettingsSurface />;
  }
  if (category === "personas") {
    return <PersonaSettingsSurface />;
  }
  if (category === "tags") {
    return <TagsSettingsSurface />;
  }
  if (category === "workloads") {
    return <WorkloadsSettingsSurface />;
  }
  if (category === "backup") {
    return <BackupSettingsSurface />;
  }
  if (category === "connections") {
    return <ConnectionsSettingsSurface />;
  }
  if (category === "system") {
    return <SystemSettingsSurface />;
  }
  if (category === "admin") {
    return <AdminSettingsSurface />;
  }
  return <SettingsPanePlaceholder title={def.label} description={def.description} />;
}
