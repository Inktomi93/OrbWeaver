// Copy-surface quality: text overflow, TEXT TRUNCATED TO NOTHING (#816), repeated container text,
// clipped positioned children, edge-flush scroller cards, uncaught page errors, duplicate action doors
// (the runtime half of issue #252). Pure. Provenance: lib/collect.ts header.
import type { Finding } from "../contract/findings.ts";
import type { ActionDoorInput, ClippedOverflowInput, EdgeFlushInput, RepeatedTextInput, TextOverflowInput, TruncatedTextInput } from "../contract/samples.ts";

/** TRUNCATED WITH NOTHING TO SHOW FOR IT (#825). The walker has already excluded every truncation that
 *  paints an ellipsis or carries the full value in a title/aria-label, so this finding is only ever about
 *  text the reader can neither read nor recover — the message names the three exits it has. */
export function checkTextOverflow(input: TextOverflowInput): Finding {
  return {
    rule: "text-overflow",
    severity: "P1",
    selector: input.selector,
    value: `${input.spillPx}px spill (${input.mode})`,
    message: `text overflows its ${input.mode === "block" ? "box" : "container"} by ${input.spillPx}px with no scroll affordance — wrap, truncate with a full-value affordance, or widen the container`,
    origin: "impeccable",
  };
}

/** TEXT ERASED, NOT SPILLED (#816). `text-overflow` says "more content than box"; this says "the box went
 *  to zero and the string is GONE" — a label that exists in the DOM, is read aloud by a screen reader, and
 *  is not on the screen at all. Measured live on the saved-casts picker at `--mobile`: a cast name at 0px
 *  rendered / 57px natural, beside an 11px twin, while the audit reported census 420 and zero findings.
 *
 *  P1 and not P2: on a phone this row could not say WHICH cast it was about. An identifying string the
 *  layout deleted is a broken surface, the same class as `clipped-overflow`'s in-flow arm. */
export function checkTruncatedText(input: TruncatedTextInput): Finding {
  return {
    rule: "truncated-to-nothing",
    severity: "P1",
    selector: input.selector,
    value: `${input.visiblePx}px of ${input.naturalPx}px shown ("${input.text}")`,
    message: `this text is laid out but painted at ~0px inside ${input.clipSelector} — it is in the DOM, in the accessibility tree, and invisible to the eye. A shrink-0 neighbour is taking the row's width: let the text keep a floor (flex-1 + min-w-0), let the row wrap, or move the neighbour to its own line`,
    origin: "orbweaver",
  };
}

export function checkRepeatedText(input: RepeatedTextInput): Finding {
  return {
    rule: "repeated-container-text",
    severity: "P3",
    selector: input.containerSelector,
    value: `"${input.text}" ×${input.count} in ${input.distinctSigs} distinct spots`,
    message:
      "the same literal text rendered 3+ times at structurally different positions inside one card — usually a status wired into every slot of a template; say it once where it matters",
    origin: "impeccable",
  };
}

/** The measured spill, or the honest absence of one on the zero-size positioned fallback. */
function clipSpillValue(input: ClippedOverflowInput): string {
  const where = input.side === null ? "" : ` ${input.side} by ${input.spillPx}px`;
  return `clips ${input.childSelector}${where}`;
}

export function checkClippedOverflow(input: ClippedOverflowInput): Finding {
  // A cut CONTROL is broken pixels a first-timer reads as a rendering bug (#439: "Blank chat" painted
  // as "nk chat" with its icon gone), so the in-flow arm is a P1. The positioned arm stays P2 — an
  // escape-needing tooltip/menu is a composition smell, not a mangled control.
  if (input.flow === "in-flow") {
    return {
      rule: "clipped-overflow",
      severity: "P1",
      selector: input.selector,
      value: clipSpillValue(input),
      message:
        "an in-flow control is painted OUTSIDE its overflow-hidden/clip container and cut — the row is wider than the box it sits in (a nowrap justify-end row spills LEFT, which scrollWidth cannot see). Let the row wrap, let the controls share the width (flex-1 + min-w-0), or shorten the label at narrow container widths",
      origin: "impeccable",
    };
  }
  return {
    rule: "clipped-overflow",
    severity: "P2",
    selector: input.selector,
    value: clipSpillValue(input),
    message:
      "an overflow-hidden/clip container is cutting a positioned child that needs to escape (tooltip/menu/badge) — portal it, use position:fixed, or let the overflow be visible (skill §3)",
    origin: "impeccable",
  };
}

export function checkEdgeFlush(input: EdgeFlushInput): Finding {
  return {
    rule: "edge-flush-cards",
    severity: "P3",
    selector: input.scrollerSelector,
    value: `${input.count} card(s) flush ${input.edge} (${input.gapPx}px gap, e.g. ${input.cardSelector})`,
    message:
      "cards sit flush against one scroller edge at rest while keeping a gutter on the other — the panel is sized wider than its clip box; keep a consistent inset on both sides",
    origin: "impeccable",
  };
}

// ── Uncaught page errors (impeccable `script-error`; runner-side capture) ─────
const SCRIPT_ERROR_MAX = 3;

const SCRIPT_ERROR_MSG_MAX = 160;

export function checkScriptErrors(pageErrors: readonly string[]): Finding[] {
  const seen = new Set<string>();
  const findings: Finding[] = [];
  for (const raw of pageErrors) {
    const message = (raw.split("\n")[0] ?? "").trim().slice(0, SCRIPT_ERROR_MSG_MAX);
    if (message === "" || seen.has(message)) {
      continue;
    }
    seen.add(message);
    if (findings.length >= SCRIPT_ERROR_MAX) {
      break;
    }
    findings.push({
      rule: "script-error",
      severity: "P0",
      selector: "page",
      value: message,
      message:
        "a script threw an uncaught exception while the page loaded — broken JS silently kills interactions and can blank whole surfaces; fix this before judging anything else",
      origin: "impeccable",
    });
  }
  return findings;
}

/** Above this the surface is a per-datum grid the structural test failed to recognise, not an IA defect —
 *  reporting it would be a false-positive factory rather than a finding. */
const DOOR_GROUP_MAX = 6;

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

export function checkDuplicateDoors(doors: readonly ActionDoorInput[]): Finding[] {
  const groups = new Map<string, ActionDoorInput[]>();
  for (const door of doors) {
    if (door.name.length === 0) {
      continue;
    }
    const key = `${door.role}|${door.name}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(door);
    groups.set(key, bucket);
  }
  const findings: Finding[] = [];
  for (const [key, bucket] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    // ONE DOOR PER DISTINCT PATH outside a list; inside one, per BUSIEST ROW (doorHomes).
    const homes = doorHomes(bucket);
    if (homes.length < 2 || homes.length > DOOR_GROUP_MAX) {
      continue;
    }
    const [role = "control", name = ""] = key.split("|");
    const at = homes.map((d) => d.selector);
    findings.push({
      rule: "duplicate-action-door",
      severity: "P3",
      selector: at[0] ?? "page",
      value: `${homes.length}x ${role} "${name}"`,
      message: `the same action is offered from ${homes.length} structurally distinct places on one plane — a ${role} named "${name}" at ${at.join(
        " AND ",
      )}. One verb wants one home per plane (the more-than-one-home IA class, docs/architecture/core/client-architecture-lockdown.md §13); if a second door is ruled UX, the ruling is what makes it one`,
      origin: "orbweaver",
    });
  }
  return findings;
}
