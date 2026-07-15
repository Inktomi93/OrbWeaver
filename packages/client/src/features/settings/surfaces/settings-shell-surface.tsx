// settings-shell-surface — the settings overlay's body: a left nav (category/subcategory rows) with a
// fuzzy search above it, and a right column that mounts only the active category's pane.
//
// THIN HOST (client-architecture-lockdown.md §8, M6.1): the pane if-ladder is GONE — `SettingsPane` reads
// `useSettingsPaneRegistry().get(active).body` blind, narrowing the DECLARED-PLANNED `{placeholder:true}`
// arm to `SettingsPanePlaceholder`. The host's ONE cross-tier job is computing `SettingsViewerView` (the
// state-owned projection a pane's `when` consumes, §5 rule 6) from its own `sessions.me` read and
// supplying it at nav/search/pane-filter time — panes never import `#data` themselves for this.
//
// Active-tracking is a SELECTION × SCROLL-SPY hybrid: the active category is pure selection (nav click or
// search jump); within that pane the active subcategory tracks scroll (a passive, rAF-throttled listener
// lights the last section past the spy line), suppressed while a programmatic jump is in flight.

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
import { scrollBehavior } from "@orb/ui/lib";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import type { SettingsCategoryId, SettingsPaneDefinition, SettingsViewerView } from "#state";
import {
  SETTINGS_GROUPS,
  settingsAnchorId,
  useSettingsPaneRegistry,
  useSettingsTarget,
} from "#state";
import "./settings-shell.css";
import { SettingsPanePlaceholder } from "../components/settings-pane-placeholder";
import { SETTINGS_GROUP_LABELS } from "../lib/settings-nav-model";
import type { SettingsSearchEntry } from "../lib/settings-search";
import { buildSettingsSearchEntries } from "../lib/settings-search";

/** Narrow the shell store's typed `settingsCategory` deep-link to the tuple (defensive against a stale
 *  persisted/cross-version value; the type already guarantees a live category, but `null` still routes
 *  through here). */
function isCategoryId(v: SettingsCategoryId | null): v is SettingsCategoryId {
  return v !== null;
}

/** The category ids for one group, in the registry's declared order. */
function categoryIdsForGroup(
  panes: readonly SettingsPaneDefinition[],
  group: (typeof SETTINGS_GROUPS)[number],
): readonly SettingsPaneDefinition[] {
  return panes.filter((pane) => pane.group === group);
}

/** The settings overlay body: nav (search + grouped category/subcategory rows) on the left, the active
 *  pane on the right. */
export function SettingsShell(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  const registry = useSettingsPaneRegistry();
  const panes = registry.list();

  // A non-suspense probe (never blocks the shell) so `when`-gated panes (e.g. admin) can filter nav/search.
  const trpc = useTRPC();
  const viewerQuery = useQuery(trpc.sessions.me.queryOptions());
  const isAdmin =
    viewerQuery.data?.globalRole === "owner" || viewerQuery.data?.globalRole === "admin";
  const visiblePanes = useMemo(() => {
    const viewer: SettingsViewerView = { isAdmin };
    return panes.filter((pane) => pane.when?.(viewer) ?? true);
  }, [panes, isAdmin]);
  const visibleIds = useMemo(() => new Set(visiblePanes.map((p) => p.id)), [visiblePanes]);

  // A cross-feature deep-link can request a specific pane via the shell store's `settingsCategory` seam;
  // honor it as the initial pane and whenever it changes (a `when`-hidden target falls back to the default).
  const targetCategory = useSettingsTarget();
  const [active, setActive] = useState<SettingsCategoryId>(() =>
    isCategoryId(targetCategory) && visibleIds.has(targetCategory) ? targetCategory : "appearance",
  );
  // Adjust state during render on a prop change (not a setState-in-effect cascade) when the deep-link target changes.
  const [seenTarget, setSeenTarget] = useState(targetCategory);
  if (targetCategory !== seenTarget) {
    setSeenTarget(targetCategory);
    if (isCategoryId(targetCategory) && visibleIds.has(targetCategory)) {
      setActive(targetCategory);
    }
  }
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const hasQuery = query.trim() !== "";
  // Suppresses the scroll-spy for the duration of a programmatic jump so smooth-scroll can't flicker the nav; a ref, never state.
  const suppressSpyRef = useRef(false);

  const searchEntries = useMemo(
    () => buildSettingsSearchEntries(registry, (id) => visibleIds.has(id as SettingsCategoryId)),
    [registry, visibleIds],
  );

  const beginProgrammaticScroll = (): void => {
    suppressSpyRef.current = true;
    const container = contentRef.current;
    const rearm = (): void => {
      suppressSpyRef.current = false;
    };
    container?.addEventListener("scrollend", rearm, { once: true });
    globalThis.setTimeout(rearm, SPY_REARM_FALLBACK_MS);
  };

  // rAF-polls because switching category remounts the pane, which may suspend on its settings read.
  const scrollToAnchor = (categoryId: SettingsCategoryId, subId: string): void => {
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

  const selectCategory = (id: SettingsCategoryId): void => {
    setActive(id);
    setActiveSub(null);
    beginProgrammaticScroll();
    contentRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() });
  };

  const selectSub = (id: SettingsCategoryId, subId: string): void => {
    setActive(id);
    setActiveSub(subId);
    scrollToAnchor(id, subId);
  };

  const jumpToEntry = (entry: SettingsSearchEntry): void => {
    setActive(entry.categoryId as SettingsCategoryId);
    setActiveSub(entry.subId);
    setQuery("");
    if (entry.subId === null) {
      beginProgrammaticScroll();
      contentRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() });
    } else {
      scrollToAnchor(entry.categoryId as SettingsCategoryId, entry.subId);
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

  const activePane = registry.get(active);

  return (
    <Stack ref={surfaceRef} tabIndex={-1} className="outline-none h-full">
      <Container className="h-full">
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
                  {searchEntries.map((entry) => (
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
                  ))}
                </CommandList>
              ) : null}
            </Command>
          </Stack>

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
                  {categoryIdsForGroup(visiblePanes, group).map((pane) => {
                    const isActive = active === pane.id;
                    const subs = pane.subcategories ?? [];
                    return (
                      <Stack key={pane.id} gap="field">
                        <ListRow
                          clickable={true}
                          leading={<Icon icon={pane.icon} size="sm" />}
                          onClick={(): void => selectCategory(pane.id)}
                          selected={isActive}
                          title={pane.label}
                        />
                        {isActive && subs.length > 0 ? (
                          <Stack className="ps-(--spacing-section)" gap="field">
                            {subs.map((sub) => (
                              <ListRow
                                key={sub.id}
                                clickable={true}
                                onClick={(): void => selectSub(pane.id, sub.id)}
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
              aria-label={`${activePane.label} settings`}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              <SettingsPane pane={activePane} />
            </Stack>
          </Row>
        </Stack>
      </Container>
    </Stack>
  );
}

// The flash ring is an inset box-shadow (not outline) so it clips to the section's border-box; applied
// via a class toggle (not inline style) so the token radius/transition still apply.
const FLASH_MS = 1200;
const FLASH_BASE_CLASS = "settings-flash-anchor";
const FLASH_LIT_CLASS = "settings-flash-anchor--lit";
const MAX_ANCHOR_POLL_FRAMES = 20;
const SPY_LINE_RATIO = 0.3;
const SPY_REARM_FALLBACK_MS = 700;
const SPY_BOTTOM_EPS = 2;

/** The subcategory id currently "active" under scroll-spy — the last section past the spy line, or the last section at the very bottom. */
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
  el.classList.add(FLASH_BASE_CLASS, FLASH_LIT_CLASS);
  globalThis.setTimeout(() => {
    el.classList.remove(FLASH_LIT_CLASS);
    el.addEventListener("transitionend", () => el.classList.remove(FLASH_BASE_CLASS), {
      once: true,
    });
  }, FLASH_MS);
}

/** The active pane — reads the registry blind, narrowing the DECLARED-PLANNED arm to the placeholder.
 *  Admin needs no extra guard here — the nav/search hide it from non-admin viewers via `when`, and a
 *  forced deep-link hits the pane's own server-gated error. */
function SettingsPane({ pane }: { readonly pane: SettingsPaneDefinition }): ReactElement {
  if (typeof pane.body === "function") {
    return <>{pane.body()}</>;
  }
  return <SettingsPanePlaceholder title={pane.label} description={pane.description} />;
}
