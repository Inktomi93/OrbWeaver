// Explicit native/proof callers use canonical observations; delivered consumers supply sealed callbacks instead.
import {
  readStaticString,
  resolveGlobalMemberOrigin,
  resolveModuleMemberOrigin,
  resolveStableExpression,
  staticMemberAccess,
} from "../../floor/code-facts/reference-fact.ts";
import { resolveCallableDeclaration, resolveCallableOrigin } from "../../floor/code-facts/reference-fact-call.ts";
import { readStaticAuthoredValue, resolveAuthoredComposite } from "../../floor/code-facts/static-authored-value.ts";
import { captureTypeProjection } from "../../floor/code-facts/type-projection.ts";
import { typeProjectionFacet } from "../../floor/code-facts/type-projection-contract.ts";
import type { JsonColumnSchemaReaders } from "../contract/json-column-origin.ts";

export const nativeJsonColumnSchemaReaders: JsonColumnSchemaReaders = {
  member: (node) => staticMemberAccess(node),
  module: resolveModuleMemberOrigin,
  global: resolveGlobalMemberOrigin,
  stable: resolveStableExpression,
  callable: resolveCallableOrigin,
  declaration: resolveCallableDeclaration,
  string: readStaticString,
  authored: readStaticAuthoredValue,
  composite: resolveAuthoredComposite,
  lexical: (node) => typeProjectionFacet(captureTypeProjection(node, { facets: ["lexical"], properties: [] }), "lexical"),
  propertyDeclarations: (node, name, nonnullable) => {
    const members = typeProjectionFacet(captureTypeProjection(node, { facets: ["member-declarations"], properties: [name] }), "member-declarations");
    const member = members[0];
    if (member === undefined) {
      throw new Error("native JSON member declaration was not captured");
    }
    return (nonnullable ? member.nonnullable : member.raw) ?? [];
  },
};
