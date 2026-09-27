// The composer's next-turn line: which connection and model the next reply in this room runs on. A turn
// resolves the room HOST's chat role (the frozen host seat funds it), so only a host viewer's own chat-role
// read describes it; a member is told it is the host's connection and never shown the host's row.

import type { ResolvedConnectionView, UnavailableCause } from "@orb/contracts/inference";
import { modelDisplayName } from "@orb/kit/model-name";
import { MODEL_ROLES_PATH } from "#lib";
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

/** The line's states: a named connection, a read still settling, no chat connection set, or a failed read. */
const NEXT_TURN_STATES = ["named", "checking", "unset", "failed"] as const;
type NextTurnState = (typeof NEXT_TURN_STATES)[number];

/** A door after the line's sentence: `lead` is prose, `label` is the control that opens Model roles. */
export interface NextTurnDoor {
  readonly lead: string;
  readonly label: string;
}

/** The line's sentence, its state, and the Model roles door when the viewer can fix the state there. */
export interface NextTurnLine {
  readonly state: NextTurnState;
  readonly text: string;
  readonly door: NextTurnDoor | undefined;
}

const CHECKING: NextTurnLine = { state: "checking", text: "Next reply: checking the connection…", door: undefined };
const FAILED: NextTurnLine = { state: "failed", text: "Next reply: the connection couldn't be checked.", door: undefined };
const MODEL_ROLES_DOOR: NextTurnDoor = { lead: `Choose one under ${MODEL_ROLES_PATH.trail} →`, label: MODEL_ROLES_PATH.leaf };

/**
 * Whether the line states this send refusal. For such a cause the line is the room's one statement of it,
 * so the composer's refusal line stands down and its disabled controls are described by the line.
 */
export function nextTurnStatesRefusal(cause: UnavailableCause | null | undefined): cause is "no-connection" {
  return cause === "no-connection";
}

/** Whether the line's chat-role read may fire: a host viewer, in a room whose verdict has settled (or failed)
 *  without the `no-connection` refusal, which that read would only answer with a `BAD_REQUEST`. */
export function nextTurnReadsChatRole(viewerIsHost: boolean | undefined, cause: UnavailableCause | null | undefined, verdictFailed: boolean): boolean {
  const verdictSettled = cause !== undefined || verdictFailed;
  return viewerIsHost === true && verdictSettled && !nextTurnStatesRefusal(cause);
}

function hostLine(inputs: NextTurnInputs): NextTurnLine {
  const { resolved, connections } = inputs;
  if (resolved !== undefined) {
    const row = connections.rows?.find((candidate) => candidate.id === resolved.connectionId);
    const connection = row?.label ?? providerName(resolved.providerId, row);
    return { state: "named", text: `Next reply: ${connection} · ${modelDisplayName(resolved.model)}`, door: undefined };
  }
  return inputs.resolveFailed ? FAILED : CHECKING;
}

/** The line for the room as the viewer sees it. */
export function nextTurnLine(inputs: NextTurnInputs): NextTurnLine {
  if (nextTurnStatesRefusal(inputs.availabilityCause)) {
    return inputs.viewerIsHost === false
      ? { state: "unset", text: "Next reply: the host has no chat connection set.", door: undefined }
      : { state: "unset", text: "Next reply: no chat connection is set.", door: MODEL_ROLES_DOOR };
  }
  if (inputs.viewerIsHost === undefined) {
    return inputs.chatFailed ? FAILED : CHECKING;
  }
  return inputs.viewerIsHost ? hostLine(inputs) : { state: "named", text: "Next reply: the host's chat connection.", door: undefined };
}
