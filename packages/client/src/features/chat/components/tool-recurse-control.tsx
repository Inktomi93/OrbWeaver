// The per-chat tool-call recursion cap control (Phase B ⑦) — the CLIENT half of Phase A L3's server verb
// (`chat.setToolRecurseLimit`, host-gated). A room-settings control on the chat context panel's Settings tab
// (NOT a settings pane): reads the current cap from `getChat` (cache-first — `ChatDetail.toolRecurseLimit`,
// exposed for this) and writes `setToolRecurseLimit` on change. Host-only by construction — the caller
// (settings-context-tab) mounts it only when `isHost` (the §8.1 permission-OMIT, matching the Group section's
// host gate in the same tab), so a member never sees it. Bounds mirror the server `toolRecurseLimitSchema`
// (int 1..20 — the true enforcement is the verb's re-validate; these bound the input for UX).

import type { ChatId } from "@orb/kit/ids";
import { Input } from "@orb/ui/input";
import { SettingRow } from "@orb/ui/setting-row";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ChangeEvent, ReactElement } from "react";
import { useId } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useSetToolRecurseLimit } from "../hooks/use-context-panel-mutations";

// Mirror the server `toolRecurseLimitSchema` bounds (domain-internal, not client-importable) — the verb
// re-validates, so these are the UX clamp only. The default shown when unset (the turn engine's own floor).
const TOOL_RECURSE_MIN = 1;
const TOOL_RECURSE_MAX = 20;
const TOOL_RECURSE_DEFAULT = 5;

export interface ToolRecurseControlProps {
  readonly chatId: ChatId;
}

/** The host-only tool-recurse cap row. Reads getChat (cache-first) for the current cap; writes on change. */
export function ToolRecurseControl({ chatId }: ToolRecurseControlProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const setLimit = useSetToolRecurseLimit({ trpc, invalidation });
  const id = useId();

  // Unset ⇒ show the engine default; a NaN/empty input is dropped (never a wipe-triggering write).
  const current = chat.toolRecurseLimit ?? TOOL_RECURSE_DEFAULT;
  const onChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const n = Number(e.target.value);
    if (Number.isInteger(n) && n >= TOOL_RECURSE_MIN && n <= TOOL_RECURSE_MAX) {
      setLimit.mutate({ chatId, limit: n });
    }
  };

  return (
    <SettingRow
      id={id}
      label="Tool-call limit"
      description="The most times the assistant may chain tool calls within one turn before it must answer. Higher allows deeper multi-step tool use."
    >
      <Input id={id} type="number" min={TOOL_RECURSE_MIN} max={TOOL_RECURSE_MAX} value={String(current)} onChange={onChange} />
    </SettingRow>
  );
}
