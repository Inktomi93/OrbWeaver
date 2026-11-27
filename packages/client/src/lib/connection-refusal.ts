// Where a connection write's refusal lands and what it says, keyed on the refusal code the connection verbs send
// (`CONNECTION_OP_CODES`). A field refusal goes on the field that holds the fix; a binding refusal goes on the role or
// plugin row that asked. The URL pair and the embedder codes have their own surfaces and are not read here.

import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { trpcErrorReason } from "./trpc-error-reason.ts";

const CONNECTION_REFUSAL_TARGETS = ["label", "provider", "api", "baseUrl", "model", "credential", "connection"] as const;

/** The field of a connection form or editor a refusal belongs on; `connection` when no one field holds the fix. */
export type ConnectionRefusalTarget = (typeof CONNECTION_REFUSAL_TARGETS)[number];

export interface ConnectionFieldRefusal {
  readonly target: ConnectionRefusalTarget;
  /** What is wrong, with no step to take: the editor restores the saved value, so it has nothing to ask the person to do. */
  readonly reason: string;
  /** The add form's line: the reason, then the step it can take. */
  readonly copy: string;
}

function fieldRefusal(target: ConnectionRefusalTarget, reason: string, step?: string): ConnectionFieldRefusal {
  return { target, reason, copy: step === undefined ? `${reason}.` : `${reason}. ${step}` };
}

/** A refused connection create or update, or `null` for any other failure. */
export function connectionFieldRefusalOf(error: unknown): ConnectionFieldRefusal | null {
  const reason = trpcErrorReason(error);
  if (reason === CONNECTION_OP_CODES.notFound) {
    return fieldRefusal("connection", "That connection is gone", "Pick another one from Connections");
  }
  if (reason === CONNECTION_OP_CODES.labelEmpty) {
    return fieldRefusal("label", "A connection needs a name", "Type one");
  }
  if (reason === CONNECTION_OP_CODES.providerUnknown) {
    return fieldRefusal("provider", "That provider isn't available", "Pick another one");
  }
  if (reason === CONNECTION_OP_CODES.apiIncoherent) {
    return fieldRefusal("api", "This provider doesn't speak that protocol", "Pick one from its list, or leave it on Auto");
  }
  if (reason === CONNECTION_OP_CODES.baseUrlShape) {
    return fieldRefusal("baseUrl", "The Server URL doesn't fit this provider. A hosted provider takes none, and your own server needs one");
  }
  if (reason === CONNECTION_OP_CODES.modelNotInCatalog) {
    return fieldRefusal("model", "This provider doesn't run that model", "Pick one from its list");
  }
  if (reason === CONNECTION_OP_CODES.modelIdShape) {
    return fieldRefusal("model", "This provider loads Hugging Face models by their owner/repo id, not a path or a link", "Type that id");
  }
  if (reason === CONNECTION_OP_CODES.taskUnservable) {
    return fieldRefusal("model", "A connection needs a model", "Pick one from the list or type its id");
  }
  if (reason === CONNECTION_OP_CODES.credentialForeign) {
    return fieldRefusal("credential", "That saved key is no longer available", "Pick another key, or paste a new one");
  }
  return null;
}

/** What the editor calls each field it restores, in the sentence that says the saved value was kept. */
const RESTORED_FIELD_NAMES = { label: "name", baseUrl: "Server URL", model: "model" } as const satisfies Partial<Record<ConnectionRefusalTarget, string>>;

const EDITOR_PLACED_TARGETS = ["label", "baseUrl", "model"] as const satisfies readonly ConnectionRefusalTarget[];

/** Whether the editor holds a control for the refusal's target, so the refusal is said under that field. */
export function editorPlacesRefusal(target: ConnectionRefusalTarget): boolean {
  return EDITOR_PLACED_TARGETS.some((placed) => placed === target);
}

/** What the editor says for a refusal. A refused field was dropped for the saved value, so its line quotes the draft, gives
 *  the reason and says the saved value was kept, never an instruction to type again; a target the editor has no control for
 *  gives the step the editor can take. */
export function connectionEditorRefusalLine(refusal: ConnectionFieldRefusal, draft: string | null): string {
  switch (refusal.target) {
    case "label":
    case "baseUrl":
    case "model":
      return `${draft === null ? "" : `"${draft}" wasn't saved: `}${refusal.reason}. Kept the saved ${RESTORED_FIELD_NAMES[refusal.target]}.`;
    case "provider":
      return "That provider isn't available. To use a different one, add a new connection.";
    case "api":
      return "This provider doesn't speak that protocol. To use another one, add a new connection.";
    case "credential":
      return "This connection's saved key is no longer available. Replace it under Saved keys.";
    case "connection":
      return refusal.copy;
    default:
      throw new Error("Unreachable connection refusal target", { cause: refusal.target satisfies never });
  }
}

/** A refused role or plugin binding, said for the role it concerns (`subject`, such as "Chat"), or `null` for any other
 *  failure. `picked` names the connection that was chosen, for a caller that knows it; the picker has rolled back to the
 *  bound one, so "That connection" would point at nothing on screen. */
export function connectionBindingRefusalOf(error: unknown, subject: string, picked?: string): string | null {
  const reason = trpcErrorReason(error);
  if (reason === CONNECTION_OP_CODES.notFound) {
    return `That connection is gone. Pick another for ${subject}.`;
  }
  if (reason === CONNECTION_OP_CODES.taskUnservable) {
    return `${picked ?? "That connection"} can't do ${subject}. Pick another one.`;
  }
  return reason === CONNECTION_OP_CODES.actorTaskUnrouted ? `This no longer uses ${subject}. Reload the page to see what it uses.` : null;
}
