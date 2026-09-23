// The TEACHER's tab list (#866 S3) — About · Applies · Learn on the
// #860 bracket's FOOT rail, ids namespaced `config.*` (the `rpg.*` posture: `contextTab` stays an opaque
// shared string; this file is where the spelling lives).
//
// EVERY CELL IS APPLICABILITY-GATED AND THE STRIP IS USUALLY ONE CELL (owner packet 2026-09-01, #926;
// nit 23 of the 2026-09-02 re-drive). Applies used to be ALWAYS visible on the argument that a stable rail
// is worth a sentence — and then the census settled it: `overriddenBy` is declared by ZERO of the 107 live
// `teach` declarations, so for every setting on the surface the tab opened onto "Nothing narrower overrides
// this", forever. A permanent cell whose only content is its own null state is the furniture ban (#864), and
// two such cells were measured at 182px EACH of a 367px pane. So:
//   · About ALWAYS exists and is the default (a pane always has something to teach);
//   · Applies exists only for an OPEN MEMBER (where it is the collection's own "where it's attached" arm)
//     or a leaf that really declares `overriddenBy` — and NEVER takes the landing, which is the other half
//     of the #926 census finding: a member used to open on Applies and land on a null state;
//   · Learn exists only while a contribution supplied `more`.
// The RESIDUAL is stated rather than hidden: the ordinary settings state now renders ONE full-width About
// cell. The rail's `minmax(max-content, 1fr)` track sizing is the 2026-07-28 equal-columns ruling and lives
// in `features/app-shell/components/context-rail.tsx` — a lane does not reverse it, and a one-cell strip is
// a different (much smaller) question than the two-cell switch nit 23 measured.
//
// THE ARMS ARE EXHAUSTIVE BY TYPE, not by a list nobody re-reads: `CONFIG_TEACHER_TAB_IDS` (the axis, homed
// in `lib/registry-contracts.ts` beside `CHAT_CONTEXT_TAB_IDS` — a feature `lib/` is not a type home) is
// paired here with a total `Record` over it (spine §5.5), so a fourth tab fails `tsc` here until someone
// writes its def AND its `when` — it can never default to permanently visible the way Applies did.
//
// The canvas boards' foot cells ("About · Preview · Activity") were extraction SCAFFOLD, not contract —
// orchestrator ruling 2026-08-30 (§7.1): the boards' own head gloss and DESIGN.md's pane contract name
// this list.

import { BookOpen, Info, MapPin } from "@orb/ui/icons";
import type { ConfigContextState, ConfigTeacherTabId, ContextTabDef } from "#lib";
import { CONFIG_TEACHER_TAB_IDS } from "#lib";
import { TeacherAbout, TeacherApplies, TeacherLearn } from "../components/config-teacher.tsx";

const TEACHER_TABS: Record<ConfigTeacherTabId, ContextTabDef<ConfigContextState>> = {
  "config.about": {
    id: "config.about",
    label: "About",
    icon: Info,
    body: (state): ReturnType<typeof TeacherAbout> => <TeacherAbout state={state} />,
    // The landing, unconditionally — including over an open member, whose old `defaultTab` opened the pane
    // on Applies and, for a `none` collection, straight onto a null state (#926's census).
    defaultTab: (): boolean => true,
  },
  "config.applies": {
    id: "config.applies",
    label: "Applies",
    icon: MapPin,
    when: (state): boolean => state.member !== null || state.teach.applies.length > 0,
    body: (state): ReturnType<typeof TeacherApplies> => <TeacherApplies state={state} />,
  },
  "config.learn": {
    id: "config.learn",
    label: "Learn",
    icon: BookOpen,
    when: (state): boolean => state.member === null && state.teach.learn !== null,
    body: (state): ReturnType<typeof TeacherLearn> => <TeacherLearn state={state} />,
  },
};

export const TEACHER_TAB_DEFS: readonly ContextTabDef<ConfigContextState>[] = CONFIG_TEACHER_TAB_IDS.map((id) => TEACHER_TABS[id]);
