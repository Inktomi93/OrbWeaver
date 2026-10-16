// Explicit native projections never promise a Signature, Type, Symbol or runtime receiver authority.
import type { Node } from "ts-morph";
import type { CalledMember } from "./drizzle-write-chain-contract.ts";
import type { InstanceMethodInvocation, ReferenceFact } from "./reference-fact-contract.ts";
import type { DrizzleTableEvidence, SchemaIdentityTable } from "./schema-identity-contract.ts";
import type { TypeMemberOrigin } from "./type-member-origin-contract.ts";

export type InstanceMethodIdentity = Pick<InstanceMethodInvocation, "invocation" | "callee" | "captureDeclarations" | "arguments"> & {
  readonly target: { readonly member: Omit<TypeMemberOrigin, "symbol"> };
};

export const DRIZZLE_EVIDENCE_MODES = ["called-member", "instance"] as const;
export type DrizzleEvidenceMode = (typeof DRIZZLE_EVIDENCE_MODES)[number];

export type DrizzleCallEvidence<Table = SchemaIdentityTable> =
  | { readonly mode: "called-member"; readonly member: ReferenceFact<CalledMember>; readonly table: ReferenceFact<Table> | null }
  | { readonly mode: "instance"; readonly invocation: ReferenceFact<InstanceMethodIdentity>; readonly table: DrizzleTableEvidence | null };

/** Exact demanded table/declaration evidence shares the query's native importing world. */
export interface DrizzleEvidenceQuery {
  readonly node: Node;
  readonly mode: DrizzleEvidenceMode;
}
