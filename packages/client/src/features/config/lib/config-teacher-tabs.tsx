// The TEACHER's tab roster (config-revamp-design.md §3.5/§7.2, #866 S3) — About · Applies · Learn on the
// #860 bracket's FOOT rail, ids namespaced `config.*` (the `rpg.*` posture: `contextTab` stays an opaque
// shared string; this file is where the spelling lives). About is the `defaultTab`; Applies is ALWAYS
// visible (a stable rail — its no-override arm is a sentence, and for an open member it is the
// collection's own context arm); Learn exists only while a contribution supplied one (APPLICABILITY,
// Context-Panel-Program §4.1 — never a disabled husk).
//
// The canvas boards' foot cells ("About · Preview · Activity") were extraction SCAFFOLD, not contract —
// orchestrator ruling 2026-08-30 (§7.1): the boards' own head gloss and DESIGN.md's pane contract name
// this roster.

import { BookOpen, Info, MapPin } from "@orb/ui/icons";
import type { ConfigContextState, ContextTabDef } from "#lib";
import { TeacherAbout, TeacherApplies, TeacherLearn } from "../components/config-teacher.tsx";

export const TEACHER_TAB_DEFS: readonly ContextTabDef<ConfigContextState>[] = [
  {
    id: "config.about",
    label: "About",
    icon: Info,
    body: (state): ReturnType<typeof TeacherAbout> => <TeacherAbout state={state} />,
    // The default LESSON view — except over an open member, where the pane's old single body WAS the
    // collection's arm, so Applies takes the landing (the `defaultTab` resolve: first true flag wins; a
    // stored, still-visible `contextTab` still beats both — continuity is untouched).
    defaultTab: (state): boolean => state.member === null,
  },
  {
    id: "config.applies",
    label: "Applies",
    icon: MapPin,
    body: (state): ReturnType<typeof TeacherApplies> => <TeacherApplies state={state} />,
    defaultTab: (state): boolean => state.member !== null,
  },
  {
    id: "config.learn",
    label: "Learn",
    icon: BookOpen,
    when: (state): boolean => state.member === null && state.teach.learn !== null,
    body: (state): ReturnType<typeof TeacherLearn> => <TeacherLearn state={state} />,
  },
];
