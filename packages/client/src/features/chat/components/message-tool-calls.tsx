// The message's persisted tool exchanges, rendered through the tool-renderer seam (§6c). A WHOLE-MESSAGE
// renderer gets first refusal (a feature renders all the message's records together so it can AGGREGATE);
// the FIRST one to return non-null owns the whole block. Absent that, each record renders in-order through
// its per-tool feature-registered renderer (claimed by exact NAME, or by NAMESPACE PREFIX — the plugin plane's
// `plugin_<slug'>_<name>` tools cannot be named at door-assembly time), else the generic @orb/ui `ToolCallBlock`
// fallback — the UNCLAIMED default that never blanks. Chat NEVER body-parses for tool markers: the persisted
// `ToolCallRecord[]` is the ONLY tool read surface, and its array order is the render order. a provider `toolCallId` is
// request-local; the generation `turnId` plus persisted occurrence ordinal is the stable continued-variant key.

import type { MessageView, ToolCallRecord } from "@orb/contracts/chat";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { ToolCallBlock } from "@orb/ui/tool-call-block";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode } from "react";
import { use } from "react";
import { ConfirmDialog, FINE_INERT_UNTIL_HOVER } from "#components";
import type { Trpc } from "#data";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import type { ContributorRegistry, ToolRenderer } from "#lib";
import { MessageToolsRendererRegistryContext } from "#state";

export interface MessageToolCallsProps {
  readonly message?: MessageView;
  readonly canEdit?: boolean;
  readonly records: readonly ToolCallRecord[];
  /** The chat-owned per-tool-name renderer registry, wired empty at `main.tsx`. Absent ⇒ every record
   *  renders through the generic fallback (a build/test with no contributions). */
  readonly renderers?: ContributorRegistry<ToolRenderer> | undefined;
}

const useEditToolCall = createEntityMutation<inferInput<Trpc["chat"]["editToolCall"]>, MessageView>({
  options: (trpc) => trpc.chat.editToolCall.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't update that tool call.",
});

function ToolCallControls({ message, record }: { readonly message: MessageView; readonly record: ToolCallRecord }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const edit = useEditToolCall({ trpc, invalidation });
  const variables = {
    chatId: message.chatId,
    messageId: message.id,
    variantId: message.selectedVariantId,
    toolCallId: record.toolCallId,
    ...(record.callOrdinal === undefined ? {} : { callOrdinal: record.callOrdinal }),
    ...(record.turnId === undefined ? {} : { turnId: record.turnId }),
  };
  const hidden = record.hidden === true;
  return (
    <Row gap="field" className={FINE_INERT_UNTIL_HOVER}>
      <Button intent="ghost" size="sm" loading={edit.isPending} onClick={(): void => edit.mutate({ ...variables, action: hidden ? "show" : "hide" })}>
        {hidden ? "Show to AI" : "Hide from AI"}
      </Button>
      <ConfirmDialog
        title="Delete this tool call?"
        description="The prose stays. This removes the card and its future prompt replay, not the tool's effects."
        confirmLabel="Delete"
        trigger={
          <Button intent="ghost" size="sm">
            Delete tool call
          </Button>
        }
        onConfirm={async (): Promise<void> => {
          await edit.mutateAsync({ ...variables, action: "delete" });
        }}
      />
    </Row>
  );
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
export function MessageToolCalls({ records, renderers, message, canEdit }: MessageToolCallsProps): ReactElement | null {
  const visible = records.filter((record) => record.deleted !== true);
  const override = useMessageOverride(visible);
  if (visible.length === 0) {
    return null;
  }
  if (override !== null) {
    return <>{override}</>;
  }
  return (
    <Stack gap="field" data-slot="message-tool-calls">
      {visible.map((record) => (
        <Stack
          key={`${record.turnId ?? "legacy"}:${record.callOrdinal ?? record.toolCallId}`}
          role="group"
          aria-label={record.displayName ?? record.name}
          gap="field"
        >
          <ToolCallSlot record={record} renderer={claimFor(renderers, record.name)} />
          {record.hidden === true ? <Text voice="gloss">Hidden from AI</Text> : null}
          {message !== undefined && canEdit === true ? <ToolCallControls message={message} record={record} /> : null}
        </Stack>
      ))}
    </Stack>
  );
}
