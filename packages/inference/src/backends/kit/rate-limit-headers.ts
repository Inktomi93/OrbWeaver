// The ONE rate-limit header parser for the hosted wires (inference audit B6): the V4 `doStream` result exposes
// `response.headers`, and the snapshot it yields is the same `RateLimitSnapshot` the agent-sdk wire fills from
// its `rate_limit_event` frame, so a caller reads one shape whatever the wire. Two header FAMILIES, both
// MEASURED 2026-09-20 (scratch `rec-probe.mjs`):
//   • Anthropic — `anthropic-ratelimit-<axis>-{limit,remaining,reset}` for `requests`, `tokens`, `input-tokens`,
//     `output-tokens`; `reset` is an RFC 3339 instant (`req_011CfEBkpjRWAjtLDifB2qpW`).
//   • OpenAI-style — `x-ratelimit-{limit,remaining,reset}-<axis>` for `requests`, `tokens`; `reset` is a Go
//     duration (`120ms`, `1ms`, `6m0s`) relative to now (`req_f68c8dc2e4a24908a2e5be64132edbc0`).
//   plus `retry-after` (seconds, or an HTTP-date) on either.
// NOT parsed, deliberately: the unsuffixed OpenRouter family (`x-ratelimit-limit` …) — OpenRouter returned NO
// rate-limit header on a 200 (`gen-1789884256-ZeulFgkGknjAbAgCKe1S`); a family nobody observed is documented,
// never guessed. `utilization` is the tightest axis (`1 − remaining/limit`), `rateLimitType` names it,
// `resetsAt` is that axis's reset; `status` is `allowed` (the response WAS served) and `allowed_warning` from
// `RATE_LIMIT_WARN_UTILIZATION` up — the canary threshold the wires emit a `rate_limit` event at.

import type { ChatEvent, RateLimitSnapshot } from "../../contract/events.ts";

const ANTHROPIC_RE = /^anthropic-ratelimit-(?<axis>[a-z-]+)-(?<field>limit|remaining|reset)$/u;
const OPENAI_RE = /^x-ratelimit-(?<field>limit|remaining|reset)-(?<axis>[a-z-]+)$/u;
const RETRY_AFTER = "retry-after";
const DURATION_PART_RE = /(?<value>\d+(?:\.\d+)?)(?<unit>ms|s|m|h)/gu;
const DURATION_WHOLE_RE = /^(?:\d+(?:\.\d+)?(?:ms|s|m|h))+$/u;
const MS_PER: Readonly<Record<"ms" | "s" | "m" | "h", number>> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
const STATUS_ALLOWED = "allowed";
const STATUS_WARNING = "allowed_warning";

/** The utilization at which a hosted wire raises its `rate_limit` canary. */
export const RATE_LIMIT_WARN_UTILIZATION = 0.8;

/** The overage fields are the agent-sdk runtime's alone — no header states them. */
const NO_OVERAGE = {
  isUsingOverage: undefined,
  overageStatus: undefined,
  overageResetsAt: undefined,
  overageDisabledReason: undefined,
  errorCode: undefined,
} as const;

interface Axis {
  limit?: number | undefined;
  remaining?: number | undefined;
  resetsAt?: number | undefined;
}

function asCount(value: string): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** A Go-style duration (`6m0s`, `120ms`, `1.5s`) → milliseconds; anything else is undefined. */
export function parseGoDuration(text: string): number | undefined {
  const trimmed = text.trim();
  if (!DURATION_WHOLE_RE.test(trimmed)) {
    return;
  }
  let total = 0;
  for (const part of trimmed.matchAll(DURATION_PART_RE)) {
    const value = Number(part.groups?.["value"]);
    const unit = part.groups?.["unit"];
    if (unit !== "ms" && unit !== "s" && unit !== "m" && unit !== "h") {
      return;
    }
    total += value * MS_PER[unit];
  }
  return total;
}

function asInstant(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** `retry-after` is seconds (an integer) or an HTTP-date. */
function retryAfterAt(value: string, now: number): number | undefined {
  const seconds = /^\d+$/u.test(value.trim()) ? Number(value) : undefined;
  return seconds !== undefined ? now + seconds * MS_PER.s : asInstant(value);
}

function setField(axis: Axis, field: string, value: string, reset: (raw: string) => number | undefined): void {
  if (field === "limit") {
    axis.limit = asCount(value);
  } else if (field === "remaining") {
    axis.remaining = asCount(value);
  } else {
    axis.resetsAt = reset(value);
  }
}

function collectAxes(headers: Readonly<Record<string, string>>, now: number): { axes: Map<string, Axis>; retryAt: number | undefined } {
  const axes = new Map<string, Axis>();
  let retryAt: number | undefined;
  const axisOf = (name: string): Axis => {
    const existing = axes.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const fresh: Axis = {};
    axes.set(name, fresh);
    return fresh;
  };
  for (const [rawKey, value] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    const anthropic = ANTHROPIC_RE.exec(key);
    if (anthropic?.groups !== undefined) {
      setField(axisOf(anthropic.groups["axis"] ?? ""), anthropic.groups["field"] ?? "", value, asInstant);
      continue;
    }
    const openai = OPENAI_RE.exec(key);
    if (openai?.groups !== undefined) {
      setField(axisOf(openai.groups["axis"] ?? ""), openai.groups["field"] ?? "", value, (raw) => {
        const ms = parseGoDuration(raw);
        return ms === undefined ? undefined : now + ms;
      });
      continue;
    }
    if (key === RETRY_AFTER) {
      retryAt = retryAfterAt(value, now);
    }
  }
  return { axes, retryAt };
}

/** The tightest axis: the one with the highest `1 − remaining/limit`; ties keep the first seen. */
function tightest(axes: ReadonlyMap<string, Axis>): { name: string; axis: Axis; utilization: number } | undefined {
  let best: { name: string; axis: Axis; utilization: number } | undefined;
  for (const [name, axis] of axes) {
    if (axis.limit === undefined || axis.remaining === undefined || axis.limit <= 0) {
      continue;
    }
    const utilization = Math.min(1, Math.max(0, 1 - axis.remaining / axis.limit));
    if (best === undefined || utilization > best.utilization) {
      best = { name, axis, utilization };
    }
  }
  return best;
}

/** The `rate_limit` CANARY a hosted wire raises — only from `allowed_warning` up (the agent-sdk raises its own from
 *  the runtime's frame); a per-turn `allowed` event would be noise, the snapshot on `ChatResult.rateLimit` is the
 *  record. `null` below the threshold. */
export function rateLimitCanaryEvent(snapshot: RateLimitSnapshot | null, at: number): ChatEvent | null {
  if (snapshot === null || snapshot.status !== STATUS_WARNING) {
    return null;
  }
  return {
    kind: "rate_limit",
    at,
    status: snapshot.status,
    rateLimitType: snapshot.rateLimitType,
    resetsAt: snapshot.resetsAt,
    utilization: snapshot.utilization,
    isUsingOverage: snapshot.isUsingOverage,
  };
}

/** Headers → the snapshot, or `null` when no known family is present. `now` is the caller's clock (a Go duration
 *  is relative). Only the fields a header can state are set; the overage fields are the agent-sdk's alone. */
export function rateLimitFromHeaders(headers: Readonly<Record<string, string>> | undefined, now: number): RateLimitSnapshot | null {
  if (headers === undefined) {
    return null;
  }
  const { axes, retryAt } = collectAxes(headers, now);
  const top = tightest(axes);
  if (top !== undefined) {
    const warning = top.utilization >= RATE_LIMIT_WARN_UTILIZATION;
    return {
      status: warning ? STATUS_WARNING : STATUS_ALLOWED,
      rateLimitType: top.name,
      resetsAt: top.axis.resetsAt ?? retryAt,
      utilization: top.utilization,
      surpassedThreshold: warning ? RATE_LIMIT_WARN_UTILIZATION : undefined,
      ...NO_OVERAGE,
    };
  }
  if (retryAt === undefined) {
    return null;
  }
  // `retry-after` alone: a reset with no axis to size it against.
  return { status: STATUS_ALLOWED, rateLimitType: undefined, resetsAt: retryAt, utilization: undefined, surpassedThreshold: undefined, ...NO_OVERAGE };
}
