// The per-row source-status dot (Settings → Connections → Model roles; CONNECTIONS-BUILD-SPEC §1.7). An 8px
// dot whose tone reflects whether a role's configured source can actually resolve a model:
//   • green  ok           — resolvable (catalog + key present, or a keyless-legal source that's healthy)
//   • red    needs-key    — no active key for the source; CLICK scrolls to the Saved keys anchor
//   • grey   local        — a local tier (vllm available, local-light always) — no key needed
//   • amber  owner-only / engine-off / empty-catalog / needs-probe — visible-but-blocked states
//
// A11y: never color-alone — the tone carries an `aria-label` + `title` naming the state (§4a WCAG floor).
// The red state is the ONE interactive dot: it wraps a real `@orb/ui` Button (never an ARIA role forged on
// a raw element — no-interactive-role-in-features) that scrolls the keys section into view.

import { Button } from "@orb/ui/button";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";

/** The dot tone axis — declared once, derived (no inline union redecl). */
const DOT_TONES = ["ok", "needs-key", "local", "blocked"] as const;
/** The dot tone — derived from the facade `state` + the source (a local tier is grey even when "ok"). */
type DotTone = (typeof DOT_TONES)[number];

/** The facade `state` as the client receives it (tRPC inference — one home, no re-declared union). */
type FacadeState = inferOutput<Trpc["connection"]["getModelsForSource"]>["state"];

const TONE_CLASS: Record<DotTone, string> = {
  ok: "bg-success",
  "needs-key": "bg-destructive",
  local: "bg-muted-foreground",
  blocked: "bg-warning",
};

const TONE_LABEL: Record<DotTone, string> = {
  ok: "Ready — a model resolves for this role",
  "needs-key": "No key — add a provider key (opens Saved keys)",
  local: "Local — runs on this box, no key needed",
  blocked: "Blocked — this source can't resolve a model yet",
};

/** Map the facade state + source to a dot tone. Local tiers read grey (they need no key); an unresolved
 *  state that ISN'T a missing key (owner-only / engine-off / empty-catalog / needs-probe) reads amber. */
function roleDotTone(state: FacadeState, source: string): DotTone {
  if (source === "vllm" || source === "local-light") {
    return state === "engine-off" ? "blocked" : "local";
  }
  if (state === "ok") {
    return "ok";
  }
  if (state === "needs-key") {
    return "needs-key";
  }
  return "blocked";
}

export interface RoleStatusDotProps {
  readonly state: FacadeState;
  readonly source: string;
  /** Scroll the Saved keys section into view (the red dot's action — the surface owns the anchor id). */
  readonly onScrollToKeys: () => void;
}

/** The 8px status dot. Red is a button (scrolls to keys); every other tone is a labeled static dot. */
export function RoleStatusDot({ state, source, onScrollToKeys }: RoleStatusDotProps): ReactElement {
  const tone = roleDotTone(state, source);
  const label = TONE_LABEL[tone];
  const dot = (
    <Text
      as="span"
      aria-hidden={true}
      className={`size-2 shrink-0 rounded-full ${TONE_CLASS[tone]}`}
    />
  );

  if (tone === "needs-key") {
    return (
      <Button
        intent="ghost"
        size="sm"
        aria-label={label}
        title={label}
        className="size-control-sm shrink-0 p-0"
        onClick={onScrollToKeys}
      >
        {dot}
      </Button>
    );
  }
  return (
    <Text as="span" role="img" aria-label={label} title={label} className="inline-flex shrink-0">
      {dot}
    </Text>
  );
}
