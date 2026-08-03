// The chrome-registry contract (shell-chrome-unification.md §A) — a shell chrome affordance as ONE
// `ChromeEntry`, assembled at the door (main.tsx) via `assembleChrome` → `createContributorRegistry`. A
// chrome entry comes from ONE of three sources, expressed by its `behavior` union (§E-2, the crux): a rail
// SECTION (derived from `SectionDefinition.rail`), a MODAL trigger (derived from `ModalDefinition.trigger`),
// or a live feature-owned WIDGET a static icon can't express (the bell, the shell's own toggles). Widget
// bodies render a lens (`"bar"` = the always-mounted bar DOM, `"sheet"` = the You-sheet projection) — both
// lenses have a consumer (N1 slice shipped, `history/shell-chrome-unification.md`). All four zones are
// consumed: `rail.brand`/`rail.nav`/`rail.end` by `features/app-shell/components/rail.tsx`, `topbar.trail`
// by the shell header, and the sheet lens by `features/app-shell/components/you-sheet.tsx`.

import type { LucideIcon } from "@orb/ui/icons";
import type { ReactNode } from "react";
import type { MobileCuration, SectionGroup } from "./section-registry.ts";
import { RAIL_ZONES } from "./section-registry.ts";
import type { ModalSlotId, SectionId } from "./shell-store.ts";

// The rail's own zones DERIVE from `RAIL_ZONES` (its one home, beside `RailEntry.zone` in
// section-registry.ts) — re-spelling them here would be the parallel map the lockdown kills.
export const CHROME_ZONES = [...RAIL_ZONES, "rail.end", "topbar.trail"] as const;
export type ChromeZone = (typeof CHROME_ZONES)[number];

/** A rail entry's mobile fate (`MobileCuration`) is homed in `section-registry.ts` beside the rail's
 *  other vocabulary — re-exported here so a chrome consumer imports the whole zone vocab from one place. */
export type { MobileCuration } from "./section-registry.ts";
/** Which lens renders a widget: the always-mounted bar DOM, or the You-sheet projection. Only `"bar"`
 *  has a consumer this wave; the sheet lens lands §E-5. */
export type ChromePresentation = "bar" | "sheet";

/** Where a chrome entry's affordance comes from — the three sources unified (§A). A `section`/`modal` arm
 *  carries only its target id (the consuming surface renders the affordance + wires the action from the
 *  section/modal registry); a `widget` arm carries a live body a static icon/label pair can't express. */
export type ChromeEntryBehavior =
  | { readonly kind: "section"; readonly sectionId: SectionId }
  | { readonly kind: "modal"; readonly modalId: ModalSlotId }
  | { readonly kind: "widget"; readonly body: (presentation: ChromePresentation) => ReactNode };

/** A shell chrome affordance as ONE definition. `id`/`label`/`icon`/`zone`/`order`/`mobile` are the
 *  presentation axes every source shares; `behavior` is where it points. */
export interface ChromeEntry {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly zone: ChromeZone;
  /** `rail.nav` grouping — the divider order derives from it; the group axis has ONE home in
   *  section-registry.ts (kills rail-slots.ts's duplicate tuple). No consumer this wave. */
  readonly group?: SectionGroup;
  readonly order?: number;
  /** Rail entries only — the mobile-tab-vs-You-sheet decision. No consumer this wave. */
  readonly mobile?: MobileCuration;
  /** Capability gate, called UNCONDITIONALLY per entry — the registry list is frozen at the door
   *  (contentBySection precedent), so hooks-over-a-stable-list is legal. `false` ⇒ render NOTHING (no
   *  gap) — preserves the notification bell's no-flash-then-yank rule. Omitted ⇒ always visible. */
  readonly useVisible?: () => boolean;
  readonly behavior: ChromeEntryBehavior;
}
