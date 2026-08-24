// plugin-log-panel — one plugin's `host.log` ring, the "what is this thing actually doing / why did it
// stop" surface. Suspends on `plugin.getLog`; the caller owns the `QueryBoundary`.
//
// The server's `PluginLogView` (`{level, message, at}`) maps onto `@orb/ui/log-viewer`'s `LogLine`
// (`{text, level}`) with no vocabulary in between — `PLUGIN_LOG_LEVELS` and the viewer's own `LogLevel` are
// the same three words, so the level rides through and the viewer paints its glyph + intent token (never
// colour alone). The timestamp is folded into the text because the ring is a plain line panel, not a table.
//
// The contents of this ring are getting RICHER under a sibling lane (#627 — the runtime ring replacing what
// is an activation-time snapshot today). This surface reads it and owns none of it: a longer log needs no
// change here (the viewer virtualizes past its own threshold and this panel gives it a bounded height).

import type { PluginId } from "@orb/kit/ids";
import { LogViewer } from "@orb/ui/log-viewer";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { timeLib } from "#lib";

/** `13:42  couldn't reach api.example.com` — the stamp through the ONE time seam (`timeLib`), never a raw
 *  `.toLocaleTimeString()`: that rebuilds an Intl formatter per line and drifts from every other time this
 *  app renders. */
function lineText(at: number, message: string): string {
  return `${timeLib.formatTime(at)}  ${message}`;
}

export interface PluginLogPanelProps {
  readonly pluginId: PluginId;
  readonly name: string;
}

export function PluginLogPanel({ pluginId, name }: PluginLogPanelProps): ReactElement {
  const trpc = useTRPC();
  const { data: lines } = useSuspenseQuery(trpc.plugin.getLog.queryOptions({ pluginId }));

  if (lines.length === 0) {
    return <Text voice="gloss">Nothing logged yet. Lines appear here when {name} runs.</Text>;
  }
  // `max-h-*`, not `h-*`: the panel grows with a short log and CAPS at a screenful (the `variant-wire-viewer`
  // precedent — and a fixed height would leave a two-line log floating in an empty box).
  return <LogViewer className="max-h-64" lines={lines.map((line) => ({ text: lineText(line.at, line.message), level: line.level }))} />;
}
