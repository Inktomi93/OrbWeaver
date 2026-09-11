// plugin-tool-card-state — the PURE projection a `tool-card` spec binds against (plugin-ui-plane #679 U3,
// §4.5's tool-card row). A card is per-CALL, so its binding root is the persisted `ToolCallRecord` of the call
// being rendered — never `host.ui.setState`'s published plane, which is per-(plugin, surface) and would make
// every historical call in a transcript repaint with the plugin's latest reading.
//
// Zero React, zero I/O: a pure function of one record, which is what makes the binding root testable without a
// mount and identical between the transcript and any future consumer of the same anchor.

import type { ToolCallRecord } from "@orb/contracts/chat";
import type { PluginToolCardState } from "@orb/contracts/plugin";

/** A record's JSON payload, parsed. Falls back to the RAW STRING rather than throwing or nulling: the fields
 *  are provenance-faithful (a model can emit malformed argument JSON, and a guest handler's return flows back
 *  verbatim — a plugin that returns prose legitimately has prose here), and a card binding `{ $state: "result" }`
 *  against prose should render that prose, not an empty node. */
function parseJsonOrRaw(raw: string): unknown {
  // @orb-waive caught-failure-ownership(catch): the doc comment above explains — a plugin returning legitimate prose must render as prose, not an empty node; the raw string is the provenance-faithful fallback the binding root renders, not a swallow. Ends if the binding root stops accepting a raw-string fallback.
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/** Project one persisted tool call into the card's binding root. Returned as a `Record<string, unknown>` (what
 *  the renderer resolves paths against) whose shape is pinned by `satisfies PluginToolCardState` — the contract
 *  type stays authoritative without an annotation that would cost the implicit index signature. */
export function toolCardState(record: ToolCallRecord): Record<string, unknown> {
  return {
    args: parseJsonOrRaw(record.arguments),
    result: record.result === null ? null : parseJsonOrRaw(record.result),
    isError: record.isError,
    durationMs: record.durationMs,
  } satisfies PluginToolCardState;
}
