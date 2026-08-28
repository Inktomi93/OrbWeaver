// The message's persisted tool exchanges, rendered through the tool-renderer seam (§6c). A WHOLE-MESSAGE
// renderer gets first refusal (a feature renders all the message's records together so it can AGGREGATE);
// the FIRST one to return non-null owns the whole block. Absent that, each record renders in-order through
// its per-tool feature-registered renderer (claimed by exact NAME, or by NAMESPACE PREFIX — the plugin plane's
// `plugin_<slug'>_<name>` tools cannot be named at door-assembly time), else the generic @orb/ui `ToolCallBlock`
// fallback — the UNCLAIMED default that never blanks. Chat NEVER body-parses for tool markers: the persisted
// `ToolCallRecord[]` is the ONLY tool read surface, and its array order is the render order. `toolCallId` is
// unique within a variant — the stable list key.

import type { ToolCallRecord } from "@orb/contracts/chat";
import { Stack } from "@orb/ui/layout";
import { ToolCallBlock } from "@orb/ui/tool-call-block";
import type { ReactElement, ReactNode } from "react";
import { use } from "react";
import type { ContributorRegistry, ToolRenderer } from "#lib";
import { MessageToolsRendererRegistryContext } from "#state";

export interface MessageToolCallsProps {
  readonly records: readonly ToolCallRecord[];
  /** The chat-owned per-tool-name renderer registry, wired empty at `main.tsx`. Absent ⇒ every record
   *  renders through the generic fallback (a build/test with no contributions). */
  readonly renderers?: ContributorRegistry<ToolRenderer> | undefined;
}

/** The FIRST whole-message renderer to claim these records (non-null), or `null` when none is
 *  registered/claims them (chat then falls back to the per-record path). Read from the null-tolerant registry
 *  context, so a build/CT with no Provider simply has no whole-message renderer. */
function useMessageOverride(records: readonly ToolCallRecord[]): ReactNode | null {
  const registry = use(MessageToolsRendererRegistryContext);
  for (const renderer of registry?.list() ?? []) {
    const node = renderer.render(records);
    if (node !== null) {
      return node;
    }
  }
  return null;
}

/** WHICH renderer claims `name`, or `undefined` for the generic fallback. TOTAL and order-independent between
 *  the two claim shapes: an EXACT claim always wins, so a namespace claim (`plugin_`) can never shadow a
 *  renderer that named the tool outright; only among PREFIX claims does door order decide, and door order is a
 *  decision one file makes. Scans `list()` rather than the registry key so a prefix contribution — whose id is
 *  a prefix, not a name — can never be mistaken for an exact hit on a tool literally named that. */
function claimFor(renderers: ContributorRegistry<ToolRenderer> | undefined, name: string): ToolRenderer | undefined {
  const all = renderers?.list() ?? [];
  return all.find((renderer) => renderer.match === "name" && renderer.id === name) ?? all.find((r) => r.match === "prefix" && name.startsWith(r.id));
}

/** ONE record's block: the claiming renderer's output, else the generic `@orb/ui` fallback. The claim is
 *  resolved by the CALLER and passed in, so "a claiming renderer that renders nothing" stays distinct from "no
 *  claim" — a claim is a claim even when its answer is null (a renderer that folds a record away on purpose
 *  must not resurrect the block it deliberately suppressed). */
function ToolCallSlot({ record, renderer }: { readonly record: ToolCallRecord; readonly renderer: ToolRenderer | undefined }): ReactNode {
  return renderer === undefined ? <ToolCallBlock record={record} /> : renderer.render(record);
}

/** Renders nothing for an empty record set (every non-tool turn) — the caller need not guard. */
export function MessageToolCalls({ records, renderers }: MessageToolCallsProps): ReactElement | null {
  const override = useMessageOverride(records);
  if (records.length === 0) {
    return null;
  }
  if (override !== null) {
    return <>{override}</>;
  }
  return (
    <Stack gap="field" data-slot="message-tool-calls">
      {records.map((record) => (
        <ToolCallSlot key={record.toolCallId} record={record} renderer={claimFor(renderers, record.name)} />
      ))}
    </Stack>
  );
}
