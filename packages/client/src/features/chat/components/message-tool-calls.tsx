// The message's persisted tool exchanges, rendered through the tool-renderer seam (§6c). A WHOLE-MESSAGE
// renderer gets first refusal (a feature renders all the message's records together so it can AGGREGATE);
// the FIRST one to return non-null owns the whole block. Absent that, each record renders in-order through
// its per-tool feature-registered renderer, else the generic @orb/ui `ToolCallBlock` fallback — the
// UNREGISTERED default that never blanks. Chat NEVER body-parses for tool markers: the persisted
// `ToolCallRecord[]` is the ONLY tool read surface, and its array order is the render order. `toolCallId` is
// unique within a variant — the stable list key.

import type { ToolCallRecord } from "@orb/contracts/chat";
import { Stack } from "@orb/ui/layout";
import { ToolCallBlock } from "@orb/ui/tool-call-block";
import type { ReactElement, ReactNode } from "react";
import { Fragment, use } from "react";
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
        <Fragment key={record.toolCallId}>
          {renderers?.has(record.name) === true ? renderers.get(record.name).render(record) : <ToolCallBlock record={record} />}
        </Fragment>
      ))}
    </Stack>
  );
}
