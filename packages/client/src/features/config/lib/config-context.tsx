// The Settings CONTEXT definition — the TEACHER (#866 S3): the pane
// rides the #860 bracket as `kind:"tabs"` over the published `ConfigContextState` projection (G3 strict —
// `lib/registry-contracts.ts`), minted per registry by `makeConfigContext(groups)` (the
// `makeCharactersSection` factory posture: the door hands the groups in, the hook is a NAMED local `use*`
// closure so rules-of-hooks hold and `S` never crosses the shell seam).
//
// WHAT THE PANE TEACHES, in priority (§7.2's ladder):
//   · an OPEN collection member → the head names the member, the Applies tab IS the collection's own
//     context arm ("Where it's attached", renamed — a member's applies answer), About carries the owning
//     group's lesson;
//   · a FOCUSED setting the reader can SEE → its leaf's `teach`, falling back to its section's, falling
//     back to the group's — the DRILL, the pane's focused state;
//   · a group at rest → the ROSTER: one entry per setting row currently in the CONTENT viewport
//     (label · gloss · its value in the control's display words), re-derived as the scroll-spy's window
//     moves. NEVER a jump list: the context pane is not navigation (`UI-Architecture-and-Layout.md` §4.2),
//     and the LIST already homes every one of those doors (#1101) — a roster entry carries no door;
//   · a group at rest whose visible rows are not settings (a jobs table, a collection) → the SECTION the
//     reader is in and its own lesson, falling back to the group's own;
//   · nothing at all → the section's `empty` arm (never a blank pane).
// Focus-follows-content over `contextTab`: a focus change swaps head + body and KEEPS the tab (CP-4 §4.1).
//
// THE ROSTER IS THE OWNER'S RULING (#926, 2026-09-01), and it REPLACED this pane's founding premise: the
// one-setting-at-a-time model was rejected verbatim ("the one at a time thing was lame"). The PS5 shape is
// the ratified one — the pane lists what you can SEE, and the number of items tracks the viewport. Its
// population is the scroll-spy's own pass (`computeVisibleSettings`), the SAME measurement that lights the
// LIST's current row, so the two panes cannot disagree by a frame; there is deliberately no second
// IntersectionObserver.
//
// KEEP-LAST FOCUS NOW HAS A VIEWPORT HORIZON. `configFocus` still never clears on blur, but a leaf is only
// ELIGIBLE to drill while it is in the visible set: scrolling the row off screen returns the pane to the
// roster, and scrolling it back re-drills it. That is what makes "returning blur/scroll goes back to the
// roster" true by construction rather than by a second clearing rule — and it subsumes the group/section
// predicate, because a row that is off screen cannot be in the set.

import type { ConfigLeafAddress, ConfigLeafValue } from "#components";
import { configLeafKey, useConfigLeaf, useConfigLeafReadings } from "#components";
import { useSettingsViewerView } from "#data";
import type { ConfigContextState, ConfigRosterEntry, ConfigTeachDoor, ConfigTeachValue, ConfigTeachView, ContextDefinition } from "#lib";
import { defineContextTabs, settingGloss } from "#lib";
import type {
  CollectionGroupDefinition,
  ConfigFocus,
  ConfigGroupDefinition,
  ConfigGroupId,
  ConfigGroupRegistry,
  ConfigSectionContribution,
  ConfigSettingLeaf,
  ConfigSettingRef,
  ConfigSubcategory,
  ConfigVisibleSetting,
  SettingTeach,
} from "#state";
import {
  isCollectionGroup,
  isTeachNone,
  openConfigTo,
  useActiveConfigGroup,
  useActiveConfigSub,
  useCollectionSelection,
  useConfigFocus,
  useConfigSectionRegistry,
  useVisibleConfigSettings,
} from "#state";
import { CollectionMemberContext, TeacherBand } from "../components/config-teacher.tsx";
import { CONFIG_CONTEXT_EMPTY, CONFIG_SECTION_LABEL } from "./config-copy.ts";
import { useConfigSelectionTitle } from "./config-selection-title.ts";
import { TEACHER_TAB_DEFS } from "./config-teacher-tabs.tsx";

/** The GROUP lesson — synthesized from the def (its `description` is its own head, §3.5). It offers NO
 *  doors: this pane used to publish the group's sections as a nine-row jump list — the LIST's own rows,
 *  restated 900px to its right (side-eye re-drive G2, #1101 — `design-audit --panels both-docked` filed
 *  8 × `duplicate-action-door`, and that arm is the only one that renders both panes at once). Being the
 *  map is the LIST's job. */
function groupLesson(group: ConfigGroupDefinition): ConfigTeachView {
  return {
    title: group.label,
    trail: CONFIG_SECTION_LABEL,
    summary: group.description,
    affects: [],
    applies: [],
    related: [],
    learn: null,
    value: null,
  };
}

/** Resolve a `related` ref into a walkable door — the label is the TARGET LEAF's own, the opener is the
 *  cross-section deep link. The compose door's `assertTeachHonesty` already proved every ref resolves to a
 *  declared leaf, so the fallback here is type-narrowing, not a real absence. A door NEVER wears a section's
 *  name: that is the LIST's row, and a knob is the only thing this pane may point at (#1101). */
function relatedDoor(ref: ConfigSettingRef, sections: readonly ConfigSectionContribution[]): ConfigTeachDoor {
  const target = sections.find((c) => c.anchor === ref.group && c.nav.id === ref.sub);
  const leaf = (target?.nav.settings ?? []).find((s) => s.id === ref.setting);
  return {
    label: leaf?.label ?? ref.setting,
    open: (): void => openConfigTo(ref.group, ref.sub, ref.setting),
  };
}

function teachView(
  teach: SettingTeach,
  subject: { readonly title: string; readonly trail: string },
  sections: readonly ConfigSectionContribution[],
  value: ConfigTeachValue | null = null,
): ConfigTeachView {
  return {
    title: subject.title,
    trail: subject.trail,
    summary: teach.summary,
    affects: teach.affects,
    applies: (teach.overriddenBy ?? []).map((door) => ({ label: door.label, open: door.open })),
    related: (teach.related ?? []).map((ref) => relatedDoor(ref, sections)),
    learn: teach.more ?? null,
    value,
  };
}

interface FocusSubject {
  readonly group: ConfigGroupDefinition;
  readonly sub: ConfigSubcategory;
  readonly settingId: string | null;
}

/** The focused row's lesson via the §7.2 ladder: leaf → its section → the group's own (`fallback`).
 *  `leafValue` (the §3.4 default-vs-current seam, resolved by the host's `useConfigLeaf`) attaches ONLY
 *  on the leaf arm — a section/group lesson's head names a different subject, and a value block under a
 *  mismatched head would teach the wrong row. */
function focusLesson(
  subject: FocusSubject,
  sections: readonly ConfigSectionContribution[],
  fallback: ConfigTeachView,
  leafValue: ConfigTeachValue | null,
): ConfigTeachView {
  const { group, sub, settingId } = subject;
  const trail = `${CONFIG_SECTION_LABEL} · ${group.label}`;
  const leaf = settingId === null ? undefined : (sub.settings ?? []).find((s) => s.id === settingId);
  if (leaf !== undefined && !isTeachNone(leaf.teach)) {
    return teachView(leaf.teach, { title: leaf.label, trail: `${trail} · ${sub.label}` }, sections, leafValue);
  }
  if (sub.teach !== undefined) {
    return teachView(sub.teach, { title: sub.label, trail }, sections);
  }
  return fallback;
}

/** The lesson for a group with NOTHING focused: the section the reader is in — the scroll-spy's current
 *  row, the same fact the LIST lights (CONTEXT follows CONTENT, `UI-Architecture-and-Layout.md` §4.2
 *  physics 1). A section that declares no lesson of its own falls through to `fallback` (the group's), which
 *  is a paragraph. Neither arm offers a door: the jump list is the LIST's job (#1101). */
function readingLesson(
  group: ConfigGroupDefinition,
  readingSub: string | null,
  sections: readonly ConfigSectionContribution[],
  fallback: ConfigTeachView,
): ConfigTeachView {
  const nav = readingSub === null ? undefined : sections.find((c) => c.anchor === group.id && c.nav.id === readingSub)?.nav;
  if (nav?.teach === undefined) {
    return fallback;
  }
  return teachView(nav.teach, { title: nav.label, trail: `${CONFIG_SECTION_LABEL} · ${group.label}` }, sections);
}

/** The open member's arm — the collection's own context contract, verbatim (the retired
 *  `ConfigContextBody`'s three truths, re-homed): a `none` collection renders ITS copy, never a generic. */
function memberArm(group: CollectionGroupDefinition, memberId: string, title: string): ConfigContextState["member"] {
  const context = group.body.collection.context;
  return {
    title,
    body: (): ReturnType<typeof CollectionMemberContext> => <CollectionMemberContext context={context} icon={group.icon} memberId={memberId} />,
  };
}

/** The focused leaf's address for `useConfigLeaf`, or null when no LEAF is focused. */
function focusedLeafAddress(focus: { readonly group: ConfigGroupId; readonly sub: string; readonly setting: string | null } | null): ConfigLeafAddress | null {
  return focus === null || focus.setting === null ? null : { group: focus.group, sub: focus.sub, setting: focus.setting };
}

/**
 * A STORED VALUE IN THE CONTROL'S OWN WORDS (#1099 F15 — the pane said "md.", the control said "Medium").
 *
 * `options` is the leaf's declared reference to the SAME items array its control renders, so this is a
 * lookup, never a second label map. The fallbacks are the honest ones for the shapes that have no option
 * table: booleans as words, an absent value as "None", an option LIST as its members joined, an opaque
 * object as its JSON (a composite row that declares a `key` — rare, and a wrong-looking blob is a truer
 * answer than a confident lie).
 */
function valueLabel(value: unknown, options: ConfigSettingLeaf["options"]): string {
  if (typeof value === "boolean") {
    return value ? "On" : "Off";
  }
  if (value === null || value === undefined) {
    return "None";
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "None" : value.map((member) => valueLabel(member, options)).join(" · ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  const raw = String(value);
  return options?.find((option) => option.value === raw)?.label ?? raw;
}

/** Project the row hook's binding into the state-free teach shape (drop the chrome-only `resetPending`).
 *  The two values cross this seam already LABELLED — the tabs render display data and never re-resolve —
 *  while `reset` still closes over the RAW default the hook bound, so a label can never decide a write. */
function projectLeafValue(binding: ConfigLeafValue | null, options: ConfigSettingLeaf["options"]): ConfigTeachValue | null {
  if (binding === null) {
    return null;
  }
  return {
    current: valueLabel(binding.current, options),
    defaultValue: valueLabel(binding.defaultValue, options),
    modified: binding.modified,
    reset: binding.reset,
  };
}

/** The declared leaf at an address, or `undefined` — the ONE registry walk the roster and the drill share. */
function findLeaf(sections: readonly ConfigSectionContribution[], group: ConfigGroupId, sub: string, setting: string): ConfigSettingLeaf | undefined {
  const nav = sections.find((c) => c.anchor === group && c.nav.id === sub)?.nav;
  return (nav?.settings ?? []).find((leaf) => leaf.id === setting);
}

/** THE ROSTER (#926): one entry per VISIBLE setting row, in the order the content pane paints them.
 *
 *  A visible address that resolves to no declared leaf is DROPPED (a `SettingRow` mounted outside its
 *  section's declaration — the row itself already renders inert in that case), and a leaf that opted out
 *  of teaching keeps its row with a null gloss: the count the owner's ruling is written in terms of is
 *  "the settings you can see", so silently thinning it would make the pane lie about the viewport. */
function buildRoster(
  visible: readonly { readonly sub: string; readonly setting: string }[],
  group: ConfigGroupId,
  sections: readonly ConfigSectionContribution[],
  readings: ReadonlyMap<string, { readonly current: unknown; readonly modified: boolean }>,
): readonly ConfigRosterEntry[] {
  const entries: ConfigRosterEntry[] = [];
  for (const row of visible) {
    const leaf = findLeaf(sections, group, row.sub, row.setting);
    if (leaf === undefined) {
      continue;
    }
    const reading = readings.get(configLeafKey(row));
    entries.push({
      id: configLeafKey(row),
      label: leaf.label,
      gloss: isTeachNone(leaf.teach) ? null : settingGloss(leaf.teach.summary),
      value: reading === undefined ? null : valueLabel(reading.current, leaf.options),
      modified: reading?.modified ?? false,
    });
  }
  return entries;
}

/** The DRILL PREDICATE (owner packet 2026-09-01 item 3): the focused leaf's address, but only while the
 *  reader can SEE that row. Pure, and applied BEFORE `useConfigLeaf` binds anything, so a dormant keep-last
 *  focus cannot leak a value or a Reset into a resting pane — the address itself is null when the row is off
 *  screen, which is the one place that can be true for the lesson and the value at once. It subsumes the
 *  old group/section match: a row outside the active group is never in the active group's visible set. */
function drillAddressOf(focus: ConfigFocus | null, activeGroup: ConfigGroupId | null, visible: readonly ConfigVisibleSetting[]): ConfigLeafAddress | null {
  const address = focusedLeafAddress(focus);
  if (address === null || address.group !== activeGroup) {
    return null;
  }
  return visible.some((row) => row.sub === address.sub && row.setting === address.setting) ? address : null;
}

interface DrillInput {
  readonly group: ConfigGroupDefinition;
  readonly address: ConfigLeafAddress;
  readonly sections: readonly ConfigSectionContribution[];
  /** The group's own lesson — what the §7.2 ladder falls back to when the leaf declares no teach. */
  readonly fallback: ConfigTeachView;
  readonly binding: ConfigLeafValue | null;
}

/** The DRILLED state, or `null` when the focused address names a section no contribution renders (a stale
 *  focus across a registry change — the roster answers instead). */
function drillState(drill: DrillInput): ConfigContextState | null {
  const { group, address, sections, fallback, binding } = drill;
  const sub = sections.find((c) => c.anchor === address.group && c.nav.id === address.sub)?.nav;
  if (sub === undefined) {
    return null;
  }
  const leafValue = projectLeafValue(binding, findLeaf(sections, address.group, address.sub, address.setting)?.options);
  // The DRILL empties the roster: About renders one arm, and WHICH arm is a fact about the state rather
  // than a branch the tab body has to re-derive.
  return { teach: focusLesson({ group, sub, settingId: address.setting }, sections, fallback, leafValue), member: null, roster: [] };
}

/** Mint the Settings context definition over a door-frozen groups registry. */
export function makeConfigContext(groups: ConfigGroupRegistry): ContextDefinition {
  // biome-ignore lint/nursery/noComponentHookFactories: the D54 §13.1 mint pattern (registry-contracts.ts's own `useResolved` carve-out, the `makeCharactersSection` posture one level up) — `makeConfigContext` runs ONCE at the door, so this named hook has a stable identity; the closure is how the door-frozen groups registry reaches it without a second delivery channel.
  function useConfigContextState(): ConfigContextState | null {
    const registry = useConfigSectionRegistry();
    const viewer = useSettingsViewerView();
    const focus = useConfigFocus();
    const selection = useCollectionSelection();
    const activeGroup = useActiveConfigGroup();
    const selectionTitle = useConfigSelectionTitle(groups);
    const readingSub = useActiveConfigSub();
    const visible = useVisibleConfigSettings();
    const drillAddress = drillAddressOf(focus, activeGroup, visible);
    const drillLeafBinding = useConfigLeaf(drillAddress);
    const rosterAddresses = activeGroup === null ? [] : visible.map((row) => ({ group: activeGroup, sub: row.sub, setting: row.setting }));
    const readings = useConfigLeafReadings(rosterAddresses);
    if (activeGroup === null) {
      return null;
    }
    const group = groups.get(activeGroup);
    if (!(group.when?.(viewer) ?? true)) {
      return null;
    }
    const lesson = groupLesson(group);
    // AN OPEN MEMBER HAS NO ROSTER: the content pane is showing that member's editor, not a settings body,
    // so "the settings currently in view" is the empty set — and About falls back to the owning group's
    // lesson exactly as before.
    if (selection !== null && isCollectionGroup(group)) {
      return { teach: lesson, member: memberArm(group, selection.memberId, selectionTitle ?? group.label), roster: [] };
    }
    const sections = registry.list();
    const drilled = drillAddress === null ? null : drillState({ address: drillAddress, binding: drillLeafBinding, fallback: lesson, group, sections });
    if (drilled !== null) {
      return drilled;
    }
    return { teach: readingLesson(group, readingSub, sections, lesson), member: null, roster: buildRoster(visible, group.id, sections, readings) };
  }

  return defineContextTabs<ConfigContextState>({
    useContextState: useConfigContextState,
    tabs: TEACHER_TAB_DEFS,
    header: (state): ReturnType<typeof TeacherBand> => <TeacherBand state={state} />,
    railLabel: CONFIG_SECTION_LABEL,
    empty: CONFIG_CONTEXT_EMPTY,
  });
}
