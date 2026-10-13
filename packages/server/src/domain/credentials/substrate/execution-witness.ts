// The opaque token carries no serializable material; sealed identity stays in this owner's private map.

import type { CredentialExecutionWitness } from "@orb/contracts/credentials";
import type { CapturedCredentialExecution } from "../contract/execution-witness.ts";

const executions = new WeakMap<CredentialExecutionWitness, CapturedCredentialExecution>();

/** Mint only after the row has passed ownership and AAD verification. */
export function mintCredentialExecutionWitness(captured: CapturedCredentialExecution): CredentialExecutionWitness {
  const witness = Object.freeze({}) as CredentialExecutionWitness;
  executions.set(witness, Object.freeze({ ...captured, sealed: Object.freeze({ ...captured.sealed }) }));
  return witness;
}

/** Recover private captured authority; an unminted token cannot authorize a credential mutation. */
export function capturedCredentialExecution(witness: CredentialExecutionWitness): CapturedCredentialExecution {
  const captured = executions.get(witness);
  if (captured === undefined) {
    throw new Error("credential execution evidence was not minted by its owner");
  }
  return captured;
}
