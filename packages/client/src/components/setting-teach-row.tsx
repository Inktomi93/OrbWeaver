// SettingRow + ConfigTeachScope — the knob row's TEACHER binding (config-revamp-design.md §7.2, #866 S3).
// A knob section provides ONE scope (its group id + its own `ConfigSubcategory` nav const) and wraps each
// Field row in a `SettingRow` naming the row's LEAF. The row then:
//   · publishes the FOCUSED-SETTING seam (`configFocus`) on focus-within and on click, and — fine pointers
//     only, after a delay — on hover (owner fork F-8: a pull revelation; never on coarse, never hover-only);
//   · renders the trailing `i` (the shared `HintTrigger` atom, a SIBLING of the Field so the accname stays
//     clean) whose tooltip is the teach summary and whose ACTIVATION reveals the context pane on this row
//     (owner ruling F-6: the pane is never forced open by focus alone — the `i` is the door);
//   · wears `data-setting` (the deep-link/flash target) and the search-match tint while `configSearchMatch`
//     names it (§3.4's in-place mark, at row grain — the label's own text is sealed inside the form field).
// The row is LAYOUT-TRANSPARENT: one flex Row around the Field, the Field the only shrinker. Client tier 2
// (NOT @orb/ui — it reads `#state`, the character-picker precedent) because contributions across many
// features mount it and features may not import each other.

import { HintTrigger } from "@orb/ui/hint-trigger";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { PointerEvent, ReactElement, ReactNode } from "react";
import { createContext, use, useEffect, useRef } from "react";
import { cn } from "#lib";
import type { ConfigGroupId, ConfigSubcategory } from "#state";
import { isTeachNone, revealContextPanel, setConfigFocus, useConfigSearchMatch } from "#state";
import { SettingRowMenu } from "./setting-row-menu.tsx";
import { useConfigLeaf } from "./use-config-leaf.ts";

/** How long a fine pointer RESTS on a row before the hover counts as "looking at it" (F-8) — long enough
 *  that a travel-through never teaches, short enough that a genuine pause does. */
const HOVER_FOCUS_DELAY_MS = 350;

export interface ConfigTeachScopeValue {
  readonly group: ConfigGroupId;
  readonly sub: ConfigSubcategory;
}

const TeachScopeContext = createContext<ConfigTeachScopeValue | null>(null);

/** The section-level half of the seam — provided ONCE per knob section, from the same nav const the
 *  contribution registers (one spelling, so a row can never publish an address its section does not own). */
export function ConfigTeachScope({ value, children }: { readonly value: ConfigTeachScopeValue; readonly children: ReactNode }): ReactElement {
  return <TeachScopeContext value={value}>{children}</TeachScopeContext>;
}

export interface SettingRowProps {
  /** The row's LEAF id inside the scope's subcategory — the declared `settings[]` entry (R-TEACH makes its
   *  `teach` a compile-time requirement, so a row here always has a lesson or a stated opt-out). */
  readonly settingId: string;
  readonly children: ReactNode;
}

/** The first sentence of a summary — the `i` tooltip's one-liner (the pane carries the rest). */
function firstSentence(summary: string): string {
  const end = summary.indexOf(". ");
  return end === -1 ? summary : summary.slice(0, end + 1);
}

export function SettingRow({ settingId, children }: SettingRowProps): ReactElement {
  const scope = use(TeachScopeContext);
  const match = useConfigSearchMatch();
  const hoverTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  // The per-leaf value seam (§3.4 row chrome, #866): null outside a scope, without a provider, or on a
  // leaf that declares no `key` — every null means "no value chrome", never an error.
  const binding = useConfigLeaf(scope === null ? null : { group: scope.group, sub: scope.sub.id, setting: settingId });
  // A dismount mid-delay must not teach a row that is gone.
  useEffect(
    () => (): void => {
      if (hoverTimer.current !== null) {
        globalThis.clearTimeout(hoverTimer.current);
      }
    },
    [],
  );
  if (scope === null) {
    // Outside a teach scope (a component reused on a non-config surface) the wrapper is inert layout —
    // publishing an address it cannot know would be a lie.
    return <>{children}</>;
  }
  const { group, sub } = scope;
  const leaf = (sub.settings ?? []).find((s) => s.id === settingId);
  const teach = leaf === undefined || isTeachNone(leaf.teach) ? null : leaf.teach;
  const focusSelf = (): void => setConfigFocus({ group, sub: sub.id, setting: settingId });
  const onPointerEnter = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType !== "mouse") {
      return;
    }
    hoverTimer.current = globalThis.setTimeout(focusSelf, HOVER_FOCUS_DELAY_MS);
  };
  const onPointerLeave = (): void => {
    if (hoverTimer.current !== null) {
      globalThis.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const isMatch = match !== null && match.group === group && match.sub === sub.id && match.setting === settingId;
  const modified = binding?.modified === true;
  return (
    // The handlers are a PASSIVE observation surface — they publish which setting the pane teaches, never
    // an action; the interactive elements inside (the control, the `i`) keep their own semantics, and the
    // keyboard path is the focus-within capture.
    // `group/setting` (NAMED — a bare `group` would key the menu's reveal on any ancestor's hover) +
    // `relative` for the modified rail, which is ABSOLUTE (out of flow — the rest row is byte-identical
    // whether or not a rail exists; the owner's zero-shift bar).
    <Row
      align="start"
      className={cn("group/setting relative min-w-0", isMatch ? "rounded-control bg-accent" : undefined) ?? ""}
      data-modified={modified ? "" : undefined}
      data-search-match={isMatch ? "" : undefined}
      data-setting={settingId}
      data-slot="setting-row"
      gap="field"
      onClickCapture={focusSelf}
      onFocusCapture={focusSelf}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {/* THE MODIFIED RAIL (§3.4 — the VS Code left bar, a designed mark): paint only (`aria-hidden`);
          the a11y telling is the sr-only text below. Vertically inset + rounded so it reads as a mark,
          not a border; `-left-2` sits it in the section's gutter, off the label's ink. */}
      {modified ? <Row aria-hidden={true} className="-left-2 absolute inset-y-1 border-l-2 border-l-primary/60" data-slot="setting-modified-rail" /> : null}
      {modified ? (
        <Text as="span" className="sr-only">
          Modified from its default.
        </Text>
      ) : null}
      <Stack className="min-w-0 flex-1">{children}</Stack>
      {leaf === undefined ? null : <SettingRowMenu address={{ group, sub: sub.id, setting: settingId }} binding={binding} label={leaf.label} />}
      {teach === null ? null : (
        <HintTrigger
          className="mt-tight shrink-0"
          hint={firstSentence(teach.summary)}
          onClick={(): void => {
            focusSelf();
            revealContextPanel();
          }}
          subject={leaf?.label}
        />
      )}
    </Row>
  );
}
