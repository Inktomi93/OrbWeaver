// The SEMANTIC-MEMBER population receipt (#946) — the half of scan health the harness structurally cannot
// observe. `pass.ts` tallies FILES; a coverage gate's verdict rests on MEMBERS (definitions, tuple
// elements, interface properties, schema leaves), and a member set can shrink to nothing behind an import
// while the file count stays healthy and the gate renders ✓
// (docs/reviews/stickler/2026-08-31-gate-member-discovery-rehome-audit.md).
//
// A gate opts in simply by DECLARING (`ctx.scan({ population: [...] })`) — there is no descriptor flag
// beside it, because a stored "judge me" boolean next to the call that produces the number is two facts
// that can disagree (the same argument GATE-AUTHORING.md §4 makes for the ratchet-class PARTITION).
import type { PassResult, PopulationAlarm } from "../contract/pass.ts";

/** The POPULATION alarms — a declared semantic denominator that came back EMPTY, or declarations the
 *  gate's reader could not resolve into members. Judged ONLY at the real-tree entrypoint
 *  (ops/structure.ts), never inside runPass: a scoped run and a conformance mini-project both legitimately
 *  resolve zero members, and `scope.kind` cannot tell those apart from a blind derivation (§4.5) — the
 *  identical placement rule the zero-SCAN alarm follows, for the identical reason. */
export function populationAlarms(pass: PassResult): readonly PopulationAlarm[] {
  const out: PopulationAlarm[] = [];
  for (const g of pass.gates) {
    for (const p of g.scan.populations) {
      if (p.members === 0) {
        // A derivation that came back EMPTY is vacuous whatever else the gate said — the §4.6 blindness
        // tripwire, in numbers. Unconditional, exactly like the zero-SCAN alarm.
        out.push({ gate: g.name, source: p.source, reason: "empty", members: p.members, unresolved: p.unresolved });
        continue;
      }
      // UNRESOLVED IS AN ALARM ONLY BEHIND A GREEN VERDICT, and that asymmetry is the whole rule. The
      // audited defect is a gate that stays ✓ while its member set shrinks; a gate that already REPORTED
      // the unreadable declaration (the #944 fail-closed arms) has done its job, and raising a second,
      // louder signal for the same cause would make every legitimate fail-closed finding also a
      // "the checker is broken" verdict. Green + a shrunken denominator is the silent case, and the only
      // one an instrument error is the honest severity for.
      if (p.unresolved > 0 && g.ok) {
        out.push({ gate: g.name, source: p.source, reason: "unresolved", members: p.members, unresolved: p.unresolved });
      }
    }
  }
  return out;
}

/** The one-line rendering of a refused population verdict — ONE spelling, shared by the console renderer
 *  and the artifact reader, so the loud line and the refused exit can never disagree. */
export function populationAlarmLine(a: PopulationAlarm): string {
  if (a.reason === "empty") {
    return `${a.gate}: population "${a.source}" resolved ZERO members — the gate's own subject derivation came back empty, so its verdict is a placebo (GATE-AUTHORING.md §1).`;
  }
  return `${a.gate}: population "${a.source}" left ${a.unresolved} declaration(s) UNRESOLVED beside ${a.members} member(s) — the denominator silently shrank; resolve the authoring shape or fail closed on it (GATE-AUTHORING.md §1).`;
}
