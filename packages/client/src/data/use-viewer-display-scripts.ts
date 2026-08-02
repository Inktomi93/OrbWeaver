// `useViewerDisplayScripts` — the VIEWER's own display-tier regex set (D121-E, closing F1).
//
// F1 was a dead wire in the honest sense: `client/src/lib/message-render.ts` has implemented the DISPLAY
// leg all along, and the ONE `MessageRenderContext` construction site never set `displayScripts` — so
// D53's per-user `markdownOnly` tier governed nothing, a DISPLAY-placement script never ran for anyone,
// and the editor's "Display only" switch was a knob wired to air. This hook is the missing supply.
//
// THE SOURCING IS PER-USER, VERBATIM PER D121-E ("the per-user `markdownOnly` DISPLAY tier … the flags ARE
// the tier discriminant"): the set is the VIEWER'S OWN library — never the host's, never another member's.
// It is deliberately NOT the host-tier union: display scripts are a personal reading preference, and
// sourcing them from the room would let a host rewrite what other people SEE without touching canon.
// (The ST-parity arm — room carriers' DISPLAY scripts rendering for every viewer, viewer's own on top —
// is the open half of the O-4 fork and is an owner call, not this hook's to guess.)
//
// It lives in `#data` rather than `features/regex` because its consumer is the CHAT message list, and
// features cannot import each other (the `#lib` vocabulary-map precedent).

import type { RegexScriptRow } from "@orb/contracts/regex";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "./trpc";

const NO_SCRIPTS: readonly RegexScriptRow[] = [];

/** The viewer's enabled DISPLAY-placement scripts, in library order. Empty while the read is in flight or
 *  failed — the display leg is then a byte-identical no-op, never a broken render. */
export function useViewerDisplayScripts(): readonly RegexScriptRow[] {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.regex.listScripts.queryOptions(),
    // ONE query for the whole list (the row component must never fetch): `select` narrows the shared cache
    // entry to the display slice without a second network read or a second cache key.
    select: (rows: readonly RegexScriptRow[]): readonly RegexScriptRow[] => rows.filter((row) => row.enabled && row.placement.includes("DISPLAY")),
  });
  return query.data ?? NO_SCRIPTS;
}
