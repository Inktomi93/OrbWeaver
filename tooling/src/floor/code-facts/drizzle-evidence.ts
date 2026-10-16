// Capture canonical called-member and instance mechanics; consumers retain package and ownership decisions.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { DrizzleCallEvidence, DrizzleEvidenceMode, InstanceMethodIdentity } from "./drizzle-evidence-contract.ts";
import { readCalledMember } from "./drizzle-write-chain.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import { readInstanceMethodInvocation } from "./reference-fact-invocation.ts";
import { readDrizzleTableEvidence } from "./schema-identity.ts";
import type { SchemaIdentityQuery } from "./schema-identity-contract.ts";
import type { SchemaTable } from "./schema-model-contract.ts";

/** Preserve original instance declarations and effective arguments without substituting a selected wrapper signature. */
export function readInstanceMethodIdentity(call: CallExpression): ReferenceFact<InstanceMethodIdentity> {
  const fact = readInstanceMethodInvocation(call);
  if (fact.kind === "unresolved") {
    return fact;
  }
  const { symbol: _symbol, ...member } = fact.value.target.member;
  return {
    ...fact,
    value: {
      invocation: fact.value.invocation,
      target: { member },
      callee: fact.value.callee,
      captureDeclarations: fact.value.captureDeclarations,
      arguments: fact.value.arguments,
    },
  };
}

/** Related argument evidence closes before publication, including prefixes authored in a dependency source. */
export function readDrizzleCallEvidence<Table extends Pick<SchemaTable, "identity">>(
  call: MorphNode,
  mode: DrizzleEvidenceMode,
  schema: SchemaIdentityQuery<Table>,
): DrizzleCallEvidence<Table> {
  if (mode === "column") {
    if (!Node.isExpression(call)) {
      throw new Error("native Drizzle column demand is not an expression");
    }
    return { mode, column: schema.column(call) };
  }
  if (!Node.isCallExpression(call)) {
    throw new Error("native Drizzle call demand is not a call");
  }
  if (mode === "called-member") {
    const argument = call.getArguments()[0];
    return { mode, member: readCalledMember(call), table: argument === undefined ? null : schema.table(argument) };
  }
  const invocation = readInstanceMethodIdentity(call);
  const argument =
    invocation.kind === "resolved" && invocation.value.invocation === "call" && invocation.value.arguments.kind === "resolved"
      ? invocation.value.arguments.value[0]
      : undefined;
  const catalog = schema.schema();
  return { mode, invocation, table: argument === undefined || catalog.status !== "ready" ? null : readDrizzleTableEvidence(argument, schema.declarations) };
}
