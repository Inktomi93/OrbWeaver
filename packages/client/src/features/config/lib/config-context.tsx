// The Settings CONTEXT definition — the TEACHER (config-revamp-design.md §3.5/§7.2, #866 S3): the pane
// rides the #860 bracket as `kind:"tabs"` over the published `ConfigContextState` projection (G3 strict —
// `lib/registry-contracts.ts`), minted per registry by `makeConfigContext(groups)` (the
// `makeCharactersSection` factory posture: the door hands the groups in, the hook is a NAMED local `use*`
// closure so rules-of-hooks hold and `S` never crosses the shell seam).
//
// WHAT THE PANE TEACHES, in priority (§7.2's ladder):
//   · an OPEN collection member → the head names the member, the Applies tab IS the collection's own
//     context arm ("Where it's attached", renamed — a member's applies answer), About carries the owning
//     group's lesson;
//   · a FOCUSED setting (`configFocus`, written by the `SettingRow` frame) → its leaf's `teach`, falling
//     back to its section's, falling back to the group's;
//   · a group with nothing focused → the SECTION the reader is in (the scroll-spy's current row) and its
//     own lesson, falling back to the group's own. NEVER a jump list: the context pane is not navigation
//     (`UI-Architecture-and-Layout.md` §4.2), and the LIST already homes every one of those doors (#1101);
//   · nothing at all → the section's `empty` arm (never a blank pane).
// Focus-follows-content over `contextTab`: a focus change swaps head + body and KEEPS the tab (CP-4 §4.1).

import type { ConfigLeafAddress, ConfigLeafValue } from "#components";
import { useConfigLeaf } from "#components";
import { useSettingsViewerView } from "#data";
import type { ConfigContextState, ConfigTeachDoor, ConfigTeachValue, ConfigTeachView, ContextDefinition } from "#lib";
import { defineContextTabs } from "#lib";
import type {
  CollectionGroupDefinition,
  ConfigGroupDefinition,
  ConfigGroupId,
  ConfigGroupRegistry,
  ConfigSectionContribution,
  ConfigSettingRef,
  ConfigSubcategory,
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

/** Project the row hook's binding into the state-free teach shape (drop the chrome-only `resetPending`). */
function projectLeafValue(binding: ConfigLeafValue | null): ConfigTeachValue | null {
  return binding === null ? null : { current: binding.current, defaultValue: binding.defaultValue, modified: binding.modified, reset: binding.reset };
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
    // The focused leaf's §3.4 value seam — the SAME hook the row chrome reads, so About's block and the
    // row's stripe cannot disagree. Unconditional (rules of hooks); null wherever there is no bound leaf.
    const leafValue = projectLeafValue(useConfigLeaf(focusedLeafAddress(focus)));
    if (activeGroup === null) {
      return null;
    }
    const group = groups.get(activeGroup);
    if (!(group.when?.(viewer) ?? true)) {
      return null;
    }
    const lesson = groupLesson(group);
    if (selection !== null && isCollectionGroup(group)) {
      return { teach: lesson, member: memberArm(group, selection.memberId, selectionTitle ?? group.label) };
    }
    const sections = registry.list();
    if (focus !== null && focus.group === group.id) {
      const sub = sections.find((c) => c.anchor === focus.group && c.nav.id === focus.sub)?.nav;
      if (sub !== undefined) {
        return { teach: focusLesson({ group, sub, settingId: focus.setting }, sections, lesson, leafValue), member: null };
      }
    }
    return { teach: readingLesson(group, readingSub, sections, lesson), member: null };
  }

  return defineContextTabs<ConfigContextState>({
    useContextState: useConfigContextState,
    tabs: TEACHER_TAB_DEFS,
    header: (state): ReturnType<typeof TeacherBand> => <TeacherBand state={state} />,
    railLabel: CONFIG_SECTION_LABEL,
    empty: CONFIG_CONTEXT_EMPTY,
  });
}
