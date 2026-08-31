// The Configuration section's GROUP NAVIGATION (config-revamp-design.md §3.2/§6.2, #866 S1): which group
// is active, which of its subcategories the scroll-spy has current, and the pending deep-link TARGET the
// CONTENT host lands. It is the settings shell's `active`/`activeSub` component state re-homed where BOTH
// panes can read it — the LIST paints the active group expanded with its spy'd row lit, and CONTENT
// renders that group's body — plus the retired shell-store `settingsCategory`/`settingsSubcategory`
// deep-link seam, which was only ever the target half of this same fact.
//
// WHY ITS OWN STORE, NOT `shell-store.ts` (the design's §5.2 named the shell store): this is one section's
// navigation state, exactly what every per-section selection store already homes, and the shell store sits
// at its component-size cap. Not persisted — landing on the section with no group active shows the welcome,
// the same posture the kinded member selection takes.
//
// THE EFFECTIVE ACTIVE GROUP IS ONE DERIVATION. A collection MEMBER can be open (the kinded selection in
// `config-selection-store.ts`); its group is then active by construction, so `useActiveConfigGroup` reads
// the member's kind first and this store's `activeGroup` second. That is what lets `selectCollectionMember`
// (called by every owner's create hook) stay a single write with no cycle into this module.
//
// `target` carries a NONCE so the same destination can be requested twice in a row (a second click on the
// row you are already on re-scrolls it into view) and the CONTENT host's effect keys on it, never on the
// active group — a later user click can never re-fire a stale jump (#549's rule).

import { clearConfigFocus } from "./config-focus-store.ts";
import type { ConfigGroupId } from "./config-group-ids.ts";
import { isConfigGroupId } from "./config-group-ids.ts";
import { openConfigGroup } from "./config-group-open-store.ts";
import { clearCollectionSelection, useCollectionSelection } from "./config-selection-store.ts";
import { createGatedStore } from "./create-gated-store.ts";
import { setActiveSection } from "./shell-store.ts";

/** A deep-link / click LANDING request the CONTENT host performs once: scroll `sub`'s anchor into view (or
 *  the top of the group when `null`), flash it, and — when `setting` names a leaf — remember the match
 *  for the LIST/CONTENT marks. */
export interface ConfigTarget {
  readonly group: ConfigGroupId;
  readonly sub: string | null;
  readonly setting: string | null;
  /** Monotonic per request — the effect key. */
  readonly nonce: number;
}

interface ConfigNavState {
  readonly activeGroup: ConfigGroupId | null;
  /** The subcategory the spy has current inside `activeGroup`; `null` while nothing is mounted yet. */
  readonly activeSub: string | null;
  readonly target: ConfigTarget | null;
}

const EMPTY: ConfigNavState = { activeGroup: null, activeSub: null, target: null };

const useConfigNavStore = createGatedStore<ConfigNavState>("config-nav", (): ConfigNavState => EMPTY);

let nonce = 0;

function land(group: ConfigGroupId, sub: string | null, setting: string | null, action: string): void {
  nonce += 1;
  openConfigGroup(group);
  // A navigation resets the TEACHER's focus (config-revamp-design.md §7.2 keep-last has a group horizon:
  // a lesson about a row that just left the screen would be a lie). The landed target re-focuses when it
  // names a setting.
  clearConfigFocus();
  useConfigNavStore.setState({ activeGroup: group, activeSub: sub, target: { group, sub, setting, nonce } }, false, action);
}

/** The cross-section deep link: "take me to this group (and this section, and this knob)". Replaces both
 *  `openSettingsTo(category, subId)` and `goToCollection(kind)`: it clears any stale member selection (the
 *  workspace opens on the group, never on whatever was last edited), expands the group, sets the landing
 *  target, and switches the rail — all through the SAME store actions the real UI calls. */
export function openConfigTo(group: ConfigGroupId, sub?: string, setting?: string): void {
  clearCollectionSelection();
  land(group, sub ?? null, setting ?? null, "configNav/openConfigTo");
  setActiveSection("config");
}

/** A LIST group-band click: the group becomes active and CONTENT lands at its top, which IS its first
 *  section — the caller names it so the row lights immediately instead of waiting for the suppressed spy
 *  to re-arm (#549). */
export function selectConfigGroup(group: ConfigGroupId, firstSub: string | null): void {
  clearCollectionSelection();
  land(group, null, null, "configNav/selectGroup");
  if (firstSub !== null) {
    useConfigNavStore.setState({ activeSub: firstSub }, false, "configNav/selectGroup/firstSub");
  }
}

/** A LIST subcategory-row click: the group becomes active and CONTENT jumps to that section's anchor. */
export function selectConfigSub(group: ConfigGroupId, sub: string): void {
  clearCollectionSelection();
  land(group, sub, null, "configNav/selectSub");
}

/** The scroll-spy's write — the section crossing the spy line. Never sets the group. */
export function setActiveConfigSub(sub: string | null): void {
  useConfigNavStore.setState({ activeSub: sub }, false, "configNav/setActiveSub");
}

/** Back to the welcome — the shell's mobile BACK affordance for a pushed group, and what a rail bounce leaves
 *  behind on the next arrival is untouched (transient store, no persist). */
export function clearActiveConfigGroup(): void {
  clearConfigFocus();
  useConfigNavStore.setState({ activeGroup: null, activeSub: null, target: null }, false, "configNav/clear");
}

/** Test seam: drop every navigation fact (a CT must not inherit another test's active group). */
export function __resetConfigNav(): void {
  useConfigNavStore.setState(EMPTY, false, "configNav/__reset");
}

/** Non-reactive read for the section seam (`makeConfigSection`'s `SectionSelection`). */
export function getActiveConfigGroup(): ConfigGroupId | null {
  return useConfigNavStore.getState().activeGroup;
}

/** Subscribe to navigation changes — the section seam's other half. Returns the unsubscribe. */
export function subscribeConfigNav(listener: () => void): () => void {
  return useConfigNavStore.subscribe(listener);
}

/** Reactive: the EFFECTIVE active group — the open member's kind, else the explicitly activated group. */
export function useActiveConfigGroup(): ConfigGroupId | null {
  const member = useCollectionSelection();
  const active = useConfigNavStore((s) => s.activeGroup);
  return member !== null && isConfigGroupId(member.kind) ? member.kind : active;
}

/** Reactive: the spy's current subcategory inside the active group. */
export function useActiveConfigSub(): string | null {
  return useConfigNavStore((s) => s.activeSub);
}

/** Reactive: the pending landing request (`null` = nothing to land). */
export function useConfigTarget(): ConfigTarget | null {
  return useConfigNavStore((s) => s.target);
}
