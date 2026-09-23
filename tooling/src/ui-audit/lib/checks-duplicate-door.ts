// The duplicate-action-door family (the runtime half of issue #252) — split out of checks-quality.ts
// (#1720) once the allowance mechanism pushed that file over the tooling-size cap; a monolith is exactly
// the drawer @orb/tooling exists to end (docs/law/Core-Tooling-Law.md §4.3). Pure.
// Provenance: lib/collect.ts header; walker: ops/walker/census-interactive.ts.
import type { Finding, RulePopulationAccounting } from "../contract/findings.ts";
import type { ActionDoorInput } from "../contract/samples.ts";
import { settledPopulationAccounting } from "./population.ts";

/** Two through six homes retain their historical full selector evidence; only presentation is bounded
 * above that point. Cardinality never disables the rule. */
const DOOR_REPRESENTATIVE_CAP = 6;

/** THE HOMES ONE (role, name) IS OFFERED FROM — the whole judgement of this rule, in one fold.
 *
 *  Outside a list, a home is a distinct structural PATH: the same path is one component rendered per
 *  datum, however many rows it has; distinct paths are distinct homes.
 *
 *  Inside a list the ROWS own that answer instead (#851). A path fingerprint assumes per-datum rows
 *  render an identical chain, and a row with a conditional wrapper does not: two transcript messages
 *  reached their "More message actions" button through `theme-scope` and `message-content-column`
 *  respectively and were reported as two homes — on every virtualized list, at coarse pointer only,
 *  because a permanent (rather than hover-revealed) action cluster is what puts two rows' doors on one
 *  plane. So a container contributes the doors of its BUSIEST single item: sibling rows fold into one
 *  home, while an action offered twice inside ONE row still counts twice and still fires. */
function doorHomes(bucket: readonly ActionDoorInput[]): ActionDoorInput[] {
  const free = new Map<string, ActionDoorInput>();
  const lists = new Map<string, Map<string, Map<string, ActionDoorInput>>>();
  for (const door of bucket) {
    const home = door.listKey === null || door.itemKey === null ? free : nestedMap(nestedMap(lists, door.listKey), door.itemKey);
    if (!home.has(door.path)) {
      home.set(door.path, door);
    }
  }
  const homes = [...free.values()];
  for (const items of lists.values()) {
    homes.push(...busiestItemDoors(items));
  }
  return homes;
}

/** get-or-create, so the two-level door bucketing reads as one expression. */
function nestedMap<V>(parent: Map<string, Map<string, V>>, key: string): Map<string, V> {
  const existing = parent.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const fresh = new Map<string, V>();
  parent.set(key, fresh);
  return fresh;
}

/** A list container contributes the doors of its BUSIEST single row — the per-datum count, which is what
 *  "how many homes does this list offer" means. Ties do not matter: the count is what the rule reads. */
function busiestItemDoors(items: ReadonlyMap<string, Map<string, ActionDoorInput>>): ActionDoorInput[] {
  let busiest: ActionDoorInput[] = [];
  for (const paths of items.values()) {
    if (paths.size > busiest.length) {
      busiest = [...paths.values()];
    }
  }
  return busiest;
}

interface DuplicateDoorPopulationResult {
  readonly findings: readonly Finding[];
  readonly accounting: RulePopulationAccounting;
}

/** A TOOLBAR CELL IS A VIEW SWITCH, NOT A SECOND DOOR (#1705, from #891's side-eye ruling). On home, the
 *  primary `nav`'s "Chats" button NAVIGATES THE APP, while `#context-cell-chats` inside
 *  `toolbar "Character"` REPAINTS THE CONTEXT REGION with this character's chats —
 *  `docs/law/UI-Architecture-and-Layout.md` §4.1–4.3 assigns those two jobs to two regions,
 *  so they are two verbs that happen to share a noun, not one verb with two homes. The rule's own message
 *  ("one verb wants one home per plane") is the thing that does not apply.
 *
 *  Scoped to `role="toolbar"` deliberately, and no wider: the same rule's five per-character-name findings
 *  on the landing (a list row against the "Recently chatted" shelf) are a RULING (#1662, ruled
 *  DIFFERENTIATE), not a mechanism fence, and must keep firing.
 *
 *  EXCLUDED, not dropped: the cell stays in `candidates` and prints as `excluded(viewSwitchCell=N)`, so a
 *  widening reach shows up in the denominator instead of as a quieter clean run. STATED RESIDUAL: two cells
 *  of ONE toolbar sharing an accessible name are now outside this rule's population entirely — that is a
 *  same-region collision, which `aria-name` and the region censuses own, and inventing a second pairing
 *  mode here would re-import the exact cross-region comparison the ruling refuses. */
function isViewSwitchCell(door: ActionDoorInput): boolean {
  return door.toolbarKey !== null;
}

/** A RULED duplicate-action door (#1720) — the RUNTIME family's counterpart to the static gate's
 *  `EXEMPT_PROCEDURES` (`tooling/src/verify/gates/duplicate-action-doors.ts`), which censuses tRPC
 *  mutation call sites per rail section and cannot see a ruling this `${role}|${name}` grouping catches
 *  instead. Before this table, the finding's own message ("if a second door is ruled UX, the ruling is
 *  what makes it one") pointed at a mechanism that did not exist. Keyed on the grouping key itself so a
 *  rename cannot silently keep a stale ruling alive.
 *
 *  EMPTY TODAY, a receipt not an omission: the one ruled dual on the tree
 *  (`packages/client/src/features/chat/surfaces/chat-list-surface.tsx`'s header, #1361 item 2, owner-ruled
 *  2026-09-05) is named "New" at the list band and "New chat" at the empty state — different names, so it
 *  never groups here and needs no row; that file's header states NEITHER enforcement half can carry an
 *  allowance for it. Seeding a row that structurally cannot fire would be stale on arrival, which
 *  {@link checkStaleDuplicateDoorAllowances} would catch — this table is for the NEXT ruled dual that DOES
 *  share a name, which before #1720 survived only by accessible-name luck. */
export const DUPLICATE_DOOR_ALLOWANCES: Readonly<Record<string, { readonly why: string }>> = {};

interface DuplicateDoorGroupResult {
  readonly finding: Finding;
  readonly emittedCount: number;
  readonly cappedCount: number;
}

/** Builds ONE group's finding — pulled out of the population loop below purely to keep that loop's own
 *  cognitive complexity under the gate's ceiling; no behavior split, just fewer branches in one function. */
function buildDuplicateDoorFinding(key: string, homes: readonly ActionDoorInput[]): DuplicateDoorGroupResult {
  const [role = "control", name = ""] = key.split("|");
  const at = homes.slice(0, DOOR_REPRESENTATIVE_CAP).map((d) => d.selector);
  const groupCapped = homes.length - at.length;
  const omitted = groupCapped === 0 ? "" : ` AND ${String(groupCapped)} more home(s) retained in the population receipt`;
  return {
    finding: {
      rule: "duplicate-action-door",
      severity: "P3",
      selector: at[0] ?? "page",
      value: `${homes.length}x ${role} "${name}"`,
      message: `the same action is offered from ${homes.length} structurally distinct places on one plane — a ${role} named "${name}" at ${at.join(
        " AND ",
      )}${omitted}. One verb wants one home per plane (the more-than-one-home IA class, docs/law/client-architecture-state-and-gates.md §13); if a second door is ruled UX, add a DUPLICATE_DOOR_ALLOWANCES row in tooling/src/ui-audit/lib/checks-duplicate-door.ts carrying the ruling that granted it`,
      origin: "orbweaver",
      representatives: at,
      population: { affected: homes.length, judged: homes.length, capped: groupCapped },
    },
    emittedCount: at.length,
    cappedCount: groupCapped,
  };
}

interface DuplicateDoorGroups {
  readonly groups: ReadonlyMap<string, readonly ActionDoorInput[]>;
  readonly viewSwitchCells: number;
}

/** The one grouping both {@link checkDuplicateDoorPopulations} and
 *  {@link checkStaleDuplicateDoorAllowances} read — a second spelling here would let a ruled pairing's
 *  finding and its staleness check disagree on what "the same group" means. */
function groupDoors(doors: readonly ActionDoorInput[]): DuplicateDoorGroups {
  const groups = new Map<string, ActionDoorInput[]>();
  let viewSwitchCells = 0;
  for (const door of doors) {
    if (door.name.length === 0) {
      continue;
    }
    if (isViewSwitchCell(door)) {
      viewSwitchCells += 1;
      continue;
    }
    const key = `${door.role}|${door.name}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(door);
    groups.set(key, bucket);
  }
  return { groups, viewSwitchCells };
}

export function checkDuplicateDoorPopulations(
  doors: readonly ActionDoorInput[],
  allowances: Readonly<Record<string, { readonly why: string }>> = DUPLICATE_DOOR_ALLOWANCES,
): DuplicateDoorPopulationResult {
  const { groups, viewSwitchCells } = groupDoors(doors);
  const findings: Finding[] = [];
  let affected = 0;
  let emitted = 0;
  let capped = 0;
  let ruledDualHomes = 0;
  for (const [key, bucket] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    // ONE DOOR PER DISTINCT PATH outside a list; inside one, per BUSIEST ROW (doorHomes).
    const homes = doorHomes(bucket);
    if (homes.length < 2) {
      continue;
    }
    if (allowances[key] !== undefined) {
      // RULED, not silent: the pairing stays in `candidates` and prints as `excluded(ruledDual=N)`, the
      // same shape `viewSwitchCell` uses — a widening reach (a THIRD door landing on a ruled pair) shows
      // up in the denominator instead of disappearing into a quieter clean run.
      ruledDualHomes += homes.length;
      continue;
    }
    const built = buildDuplicateDoorFinding(key, homes);
    affected += homes.length;
    emitted += built.emittedCount;
    capped += built.cappedCount;
    findings.push(built.finding);
  }
  return {
    findings,
    accounting: settledPopulationAccounting("duplicate-action-door", {
      candidates: affected + viewSwitchCells + ruledDualHomes,
      judged: affected,
      affected,
      populations: findings.length,
      emitted,
      withheld: { cap: capped },
      excluded: {
        ...(viewSwitchCells === 0 ? {} : { viewSwitchCell: viewSwitchCells }),
        ...(ruledDualHomes === 0 ? {} : { ruledDual: ruledDualHomes }),
      },
      collapsed: {},
    }),
  };
}

/** #1720's other half — a stale `DUPLICATE_DOOR_ALLOWANCES` row is a loaded gun, the shape the static
 *  gate's own `judgeExemptions` enforces for `EXEMPT_PROCEDURES`. Same grouping as
 *  {@link checkDuplicateDoorPopulations}, so a rename/removal dropping a ruled pairing below two homes is
 *  caught, never left as law nothing reads. Returns plain messages, not `Finding[]`: staleness is a
 *  property of the WHOLE table against the doors given, not a per-page rendered defect — minting a rule
 *  (and the `contract/rules.ts` proof coverage it would owe) would be inventing one for a hygiene check. */
export function checkStaleDuplicateDoorAllowances(
  doors: readonly ActionDoorInput[],
  allowances: Readonly<Record<string, { readonly why: string }>> = DUPLICATE_DOOR_ALLOWANCES,
): readonly string[] {
  const { groups } = groupDoors(doors);
  const stale: string[] = [];
  for (const [key, allowance] of Object.entries(allowances)) {
    const homes = doorHomes(groups.get(key) ?? []);
    if (homes.length >= 2) {
      continue;
    }
    stale.push(
      `stale DUPLICATE_DOOR_ALLOWANCES row — grants nothing while reading as live law (the tree no longer offers two homes of this pairing, ${String(homes.length)} found). Delete it (tooling/src/ui-audit/lib/checks-duplicate-door.ts): ${key} — ${allowance.why}`,
    );
  }
  return stale;
}

export function checkDuplicateDoors(doors: readonly ActionDoorInput[]): Finding[] {
  return [...checkDuplicateDoorPopulations(doors).findings];
}
