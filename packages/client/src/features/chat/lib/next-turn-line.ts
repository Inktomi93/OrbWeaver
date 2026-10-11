// The composer's next-turn line: why the next reply in this room cannot run, when it cannot. A turn resolves
// the room HOST's chat role (the frozen host seat funds it), so only a host viewer's own chat-role read can
// fail for the viewer; a room that can reply is a state with no sentence (the chat page names no model).

import type { ResolvedConnectionView, UnavailableCause } from "@orb/contracts/inference";
import type { SendRefusalKey } from "#lib";
import { ADD_CONNECTION_DOOR, ADD_CONNECTION_PATH, CHAT_ROLE_DOOR, MODEL_ROLES_PATH } from "#lib";
import type { CreditConnections } from "./swipe-attribution.ts";

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

// A door after the line's sentence: `lead` is prose, `label` is the control, and `sub` + `setting` name the
// Settings → Connections leaf it lands on.
interface NextTurnDoor {
  readonly lead: string;
  readonly label: string;
  readonly sub: string;
  readonly setting: string;
}

/** A refusal the line states: its sentence, and the Settings door when the viewer can fix it there. */
export interface NextTurnRefusal {
  readonly state: Exclude<NextTurnState, "named" | "checking">;
  readonly text: string;
  readonly door: NextTurnDoor | undefined;
}

/** The line's state, with a sentence only for a refusal: a room that can reply, or is still being checked,
 *  says nothing. */
type NextTurnLine = NextTurnRefusal | { readonly state: Extract<NextTurnState, "named" | "checking"> };

const NAMED: NextTurnLine = { state: "named" };
const CHECKING: NextTurnLine = { state: "checking" };
const FAILED: NextTurnLine = { state: "failed", text: "Next reply: the connection couldn't be checked.", door: undefined };
// The addresses come from `#lib`, which the Connections nav reads too: a feature never imports another's nav.
const MODEL_ROLES_DOOR: NextTurnDoor = {
  lead: `Choose one under ${MODEL_ROLES_PATH.trail} →`,
  label: MODEL_ROLES_PATH.leaf,
  sub: CHAT_ROLE_DOOR.sub,
  setting: CHAT_ROLE_DOOR.setting,
};
const ADD_CONNECTION_LINE_DOOR: NextTurnDoor = {
  lead: `${ADD_CONNECTION_PATH.trail} →`,
  label: ADD_CONNECTION_PATH.leaf,
  sub: ADD_CONNECTION_DOOR.sub,
  setting: ADD_CONNECTION_DOOR.setting,
};

/** Whether the viewer's loaded list holds no connection that can serve chat. The Chat picker in Model roles
 *  offers only chat-capable rows, so this is where the only fix is adding one; built-in embedding rows do not
 *  count. False while the list is unloaded, so a pending read never claims the add flow. */
function lacksChatConnection({ rows }: CreditConnections): boolean {
  return rows !== undefined && !rows.some((row) => row.tasks.includes("chat"));
}

/**
 * The composer's refusal key for a refused send: the host-side `no-chat-connection` split of `no-connection`
 * on the same predicate the line's door uses, so the tooltips and the line point at the same fix.
 */
export function sendRefusalKey(cause: UnavailableCause, viewerIsHost: boolean | undefined, connections: CreditConnections): SendRefusalKey {
  if (nextTurnStatesRefusal(cause) && viewerIsHost === false) {
    return "host-no-chat-connection";
  }
  return nextTurnStatesRefusal(cause) && viewerIsHost === true && lacksChatConnection(connections) ? "no-chat-connection" : cause;
}

// While the list loads there is no door: a door that swaps under the pointer is worse than a late one.
function hostUnsetLine(connections: CreditConnections): NextTurnLine {
  if (lacksChatConnection(connections)) {
    return { state: "unset", text: "Next reply: none of your connections can chat yet.", door: ADD_CONNECTION_LINE_DOOR };
  }
  const door = connections.rows === undefined && !connections.failed ? undefined : MODEL_ROLES_DOOR;
  return { state: "unset", text: "Next reply: no chat connection is set.", door };
}

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
  if (inputs.resolved !== undefined) {
    return NAMED;
  }
  return inputs.resolveFailed ? FAILED : CHECKING;
}

/** The refusal the line states, or `undefined` for a room that can reply or is still being checked. */
export function lineRefusal(line: NextTurnLine): NextTurnRefusal | undefined {
  return "text" in line ? line : undefined;
}

/** The line for the room as the viewer sees it. */
export function nextTurnLine(inputs: NextTurnInputs): NextTurnLine {
  if (nextTurnStatesRefusal(inputs.availabilityCause)) {
    // Only a known host can fix this in their own settings; an unknown viewer may be a member.
    if (inputs.viewerIsHost === true) {
      return hostUnsetLine(inputs.connections);
    }
    return inputs.viewerIsHost === false
      ? { state: "unset", text: "Next reply: the host has no chat connection set.", door: undefined }
      : { state: "unset", text: "Next reply: this chat has no chat connection set.", door: undefined };
  }
  if (inputs.viewerIsHost === undefined) {
    return inputs.chatFailed ? FAILED : CHECKING;
  }
  return inputs.viewerIsHost ? hostLine(inputs) : NAMED;
}
