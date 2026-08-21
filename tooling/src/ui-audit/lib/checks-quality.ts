// Copy-surface quality: text overflow, repeated container text, clipped positioned children,
// edge-flush scroller cards, uncaught page errors, duplicate action doors (the runtime half of
// issue #252). Pure. Provenance: lib/collect.ts header.
import type { Finding } from "../contract/findings.ts";
import type { ActionDoorInput, ClippedOverflowInput, EdgeFlushInput, RepeatedTextInput, TextOverflowInput } from "../contract/samples.ts";

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

export function checkClippedOverflow(input: ClippedOverflowInput): Finding {
  return {
    rule: "clipped-overflow",
    severity: "P2",
    selector: input.selector,
    value: `clips ${input.childSelector}`,
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
    // ONE DOOR PER DISTINCT PATH: the same path is one component rendered per datum, however many rows it
    // has. Distinct paths are distinct homes, which is the whole finding.
    const homes = new Map<string, ActionDoorInput>();
    for (const door of bucket) {
      if (!homes.has(door.path)) {
        homes.set(door.path, door);
      }
    }
    if (homes.size < 2 || homes.size > DOOR_GROUP_MAX) {
      continue;
    }
    const [role = "control", name = ""] = key.split("|");
    const at = [...homes.values()].map((d) => d.selector);
    findings.push({
      rule: "duplicate-action-door",
      severity: "P3",
      selector: at[0] ?? "page",
      value: `${homes.size}x ${role} "${name}"`,
      message: `the same action is offered from ${homes.size} structurally distinct places on one plane — a ${role} named "${name}" at ${at.join(
        " AND ",
      )}. One verb wants one home per plane (the more-than-one-home IA class, docs/architecture/core/client-architecture-lockdown.md §13); if a second door is ruled UX, the ruling is what makes it one`,
      origin: "orbweaver",
    });
  }
  return findings;
}
