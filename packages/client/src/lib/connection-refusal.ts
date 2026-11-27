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
  readonly copy: string;
}

/** A refused connection create or update, or `null` for any other failure. */
export function connectionFieldRefusalOf(error: unknown): ConnectionFieldRefusal | null {
  const reason = trpcErrorReason(error);
  if (reason === CONNECTION_OP_CODES.notFound) {
    return { target: "connection", copy: "That connection is gone. Close this and pick another from the list." };
  }
  if (reason === CONNECTION_OP_CODES.labelEmpty) {
    return { target: "label", copy: "A connection needs a name. Type one." };
  }
  if (reason === CONNECTION_OP_CODES.providerUnknown) {
    return { target: "provider", copy: "That provider isn't available. Pick another one." };
  }
  if (reason === CONNECTION_OP_CODES.apiIncoherent) {
    return { target: "api", copy: "This provider doesn't speak that protocol. Pick one from its list, or leave it on Auto." };
  }
  if (reason === CONNECTION_OP_CODES.baseUrlShape) {
    return { target: "baseUrl", copy: "The Server URL doesn't fit this provider. A hosted provider takes none, and your own server needs one." };
  }
  if (reason === CONNECTION_OP_CODES.modelNotInCatalog) {
    return { target: "model", copy: "This provider doesn't run that model. Pick one from its list." };
  }
  if (reason === CONNECTION_OP_CODES.modelIdShape) {
    return { target: "model", copy: "This provider loads Hugging Face models by their owner/repo id, not a path or a link. Type that id." };
  }
  if (reason === CONNECTION_OP_CODES.taskUnservable) {
    return { target: "model", copy: "A connection needs a model. Pick one from the list or type its id." };
  }
  if (reason === CONNECTION_OP_CODES.credentialForeign) {
    return { target: "credential", copy: "That saved key isn't yours. Pick one of your own keys, or paste a new one." };
  }
  return null;
}

/** A refused role or plugin binding, or `null` for any other failure. */
export function connectionBindingRefusalOf(error: unknown): string | null {
  const reason = trpcErrorReason(error);
  if (reason === CONNECTION_OP_CODES.notFound) {
    return "That connection is gone. Pick another for this role.";
  }
  if (reason === CONNECTION_OP_CODES.taskUnservable) {
    return "That connection can't do this job. Pick another one.";
  }
  return reason === CONNECTION_OP_CODES.actorTaskUnrouted ? "This plugin doesn't use that role. Reload the page to see the roles it uses." : null;
}
