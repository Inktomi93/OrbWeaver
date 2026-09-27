// The composer's next-turn line: which connection and model the next reply in this room runs on. A turn
// resolves the room HOST's chat role (the frozen host seat funds it), so only a host viewer's own chat-role
// read describes it; a member is told it is the host's connection and never shown the host's row.

import type { ResolvedConnectionView, UnavailableCause } from "@orb/contracts/inference";
import { modelDisplayName } from "@orb/kit/model-name";
import type { CreditConnections } from "./swipe-attribution.ts";
import { providerName } from "./swipe-attribution.ts";

/** What the line can know. Each value field is `undefined` until its read settles; each `…Failed` flag says
 *  that read settled as an error. */
export interface NextTurnInputs {
  readonly viewerIsHost: boolean | undefined;
  /** The room read (`chat.getChat`) failed, so whether the viewer is the host is unknown. */
  readonly chatFailed: boolean;
  /** The room's pre-send verdict: `null` = serveable, a cause = refused, `undefined` = unresolved. */
  readonly availabilityCause: UnavailableCause | null | undefined;
  readonly availabilityFailed: boolean;
  /** The host viewer's own chat-role resolution (`connection.resolveChatCapability`). */
  readonly resolved: Pick<ResolvedConnectionView, "connectionId" | "providerId" | "model"> | undefined;
  readonly resolveFailed: boolean;
  readonly connections: CreditConnections;
}

/** The line's copy, whether it reports a missing connection, and whether a read it needed failed. */
export interface NextTurnLine {
  readonly text: string;
  readonly unset: boolean;
  readonly failed: boolean;
}

const MODEL_ROLES_PATH = "Settings → Connections → Model roles";
const CHECKING: NextTurnLine = { text: "Next reply: checking the connection…", unset: false, failed: false };

function hostLine(inputs: NextTurnInputs): NextTurnLine {
  const { resolved, connections } = inputs;
  if (resolved !== undefined) {
    const row = connections.rows?.find((candidate) => candidate.id === resolved.connectionId);
    const connection = row?.label ?? providerName(resolved.providerId, row);
    return { text: `Next reply: ${connection} · ${modelDisplayName(resolved.model)}`, unset: false, failed: false };
  }
  // A failed resolve names no cause until the room's verdict has settled or failed: an unbound role fails
  // this read too, and that case has its own words once the verdict says `no-connection`.
  const verdictSettled = inputs.availabilityCause !== undefined || inputs.availabilityFailed;
  if (inputs.resolveFailed && verdictSettled) {
    return { text: "Next reply: the chat connection couldn't be read.", unset: false, failed: true };
  }
  return CHECKING;
}

/** The line for the room as the viewer sees it. */
export function nextTurnLine(inputs: NextTurnInputs): NextTurnLine {
  if (inputs.availabilityCause === "no-connection") {
    return inputs.viewerIsHost === false
      ? { text: "Next reply: the host has no chat connection set.", unset: true, failed: false }
      : { text: `Next reply: no chat connection is set. Choose one under ${MODEL_ROLES_PATH}.`, unset: true, failed: false };
  }
  if (inputs.viewerIsHost === undefined) {
    return inputs.chatFailed ? { text: "Next reply: this chat's connection couldn't be checked.", unset: false, failed: true } : CHECKING;
  }
  return inputs.viewerIsHost ? hostLine(inputs) : { text: "Next reply: the host's chat connection.", unset: false, failed: false };
}
