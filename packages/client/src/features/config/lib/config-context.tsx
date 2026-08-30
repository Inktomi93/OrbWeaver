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
//   · a group with nothing focused → the group's own lesson, its sections offered as Related doors;
//   · nothing at all → the section's `empty` arm (never a blank pane).
// Focus-follows-content over `contextTab`: a focus change swaps head + body and KEEPS the tab (CP-4 §4.1).

import { useSettingsViewerView } from "#data";
import type { ConfigContextState, ConfigTeachDoor, ConfigTeachView, ContextDefinition } from "#lib";
import { defineContextTabs } from "#lib";
import type {
  CollectionGroupDefinition,
  ConfigGroupDefinition,
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
  selectConfigSub,
  useActiveConfigGroup,
  useCollectionSelection,
  useConfigFocus,
  useConfigSectionRegistry,
} from "#state";
import { CollectionMemberContext, TeacherBand } from "../components/config-teacher.tsx";
import { CONFIG_CONTEXT_EMPTY, CONFIG_SECTION_LABEL } from "./config-copy.ts";
import { useConfigSelectionTitle } from "./config-selection-title.ts";
import { useConfigSubcategories } from "./config-subcategories.ts";
import { TEACHER_TAB_DEFS } from "./config-teacher-tabs.tsx";

/** The GROUP lesson — synthesized from the def (its `description` is its own head, §3.5): the sections
 *  contributed at its anchor become Related doors, so the pane is a map even before anything is focused. */
function groupLesson(group: ConfigGroupDefinition, subcategories: readonly ConfigSubcategory[]): ConfigTeachView {
  return {
    title: group.label,
    trail: CONFIG_SECTION_LABEL,
    summary: group.description,
    affects: [],
    applies: [],
    related: subcategories.map((sub) => ({ label: sub.label, open: (): void => selectConfigSub(group.id, sub.id) })),
    learn: null,
  };
}

/** Resolve a `related` ref into a walkable door — the label is the TARGET's own (its leaf's, else its
 *  section's), the opener is the cross-section deep link. The compose door's `assertTeachHonesty` already
 *  proved every ref resolves, so the fallbacks here are type-narrowing, not real absences. */
function relatedDoor(ref: ConfigSettingRef, sections: readonly ConfigSectionContribution[]): ConfigTeachDoor {
  const target = sections.find((c) => c.anchor === ref.group && c.nav.id === ref.sub);
  const leaf = ref.setting === undefined ? undefined : (target?.nav.settings ?? []).find((s) => s.id === ref.setting);
  return {
    label: leaf?.label ?? target?.nav.label ?? ref.sub,
    open: (): void => openConfigTo(ref.group, ref.sub, ref.setting),
  };
}

function teachView(teach: SettingTeach, title: string, trail: string, sections: readonly ConfigSectionContribution[]): ConfigTeachView {
  return {
    title,
    trail,
    summary: teach.summary,
    affects: teach.affects,
    applies: (teach.overriddenBy ?? []).map((door) => ({ label: door.label, open: door.open })),
    related: (teach.related ?? []).map((ref) => relatedDoor(ref, sections)),
    learn: teach.more ?? null,
  };
}

interface FocusSubject {
  readonly group: ConfigGroupDefinition;
  readonly sub: ConfigSubcategory;
  readonly settingId: string | null;
}

/** The focused row's lesson via the §7.2 ladder: leaf → its section → the group's own (`fallback`). */
function focusLesson(subject: FocusSubject, sections: readonly ConfigSectionContribution[], fallback: ConfigTeachView): ConfigTeachView {
  const { group, sub, settingId } = subject;
  const trail = `${CONFIG_SECTION_LABEL} · ${group.label}`;
  const leaf = settingId === null ? undefined : (sub.settings ?? []).find((s) => s.id === settingId);
  if (leaf !== undefined && !isTeachNone(leaf.teach)) {
    return teachView(leaf.teach, leaf.label, `${trail} · ${sub.label}`, sections);
  }
  if (sub.teach !== undefined) {
    return teachView(sub.teach, sub.label, trail, sections);
  }
  return fallback;
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
    const subcategoriesFor = useConfigSubcategories();
    if (activeGroup === null) {
      return null;
    }
    const group = groups.get(activeGroup);
    if (!(group.when?.(viewer) ?? true)) {
      return null;
    }
    const lesson = groupLesson(group, subcategoriesFor(group));
    if (selection !== null && isCollectionGroup(group)) {
      return { teach: lesson, member: memberArm(group, selection.memberId, selectionTitle ?? group.label) };
    }
    const sections = registry.list();
    if (focus !== null && focus.group === group.id) {
      const sub = sections.find((c) => c.anchor === focus.group && c.nav.id === focus.sub)?.nav;
      if (sub !== undefined) {
        return { teach: focusLesson({ group, sub, settingId: focus.setting }, sections, lesson), member: null };
      }
    }
    return { teach: lesson, member: null };
  }

  return defineContextTabs<ConfigContextState>({
    useContextState: useConfigContextState,
    tabs: TEACHER_TAB_DEFS,
    header: (state): ReturnType<typeof TeacherBand> => <TeacherBand state={state} />,
    railLabel: CONFIG_SECTION_LABEL,
    empty: CONFIG_CONTEXT_EMPTY,
  });
}
