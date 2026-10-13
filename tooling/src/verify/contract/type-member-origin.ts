// Verify-owned containment vocabulary uses canonical native declaration identities.
import type { InterfaceDeclaration, TypeAliasDeclaration } from "ts-morph";

export type { ContextualMemberOrigin, TypeIdentityOrigin, TypeMemberOrigin } from "../../floor/code-facts/type-member-origin-contract.ts";

/** The two declaration kinds a generic constructor identity can resolve to (an interface or a type alias). */
export type GenericDeclaration = InterfaceDeclaration | TypeAliasDeclaration;

/** The containment lattice `typeExpressionContains` returns: "no" (proven absent), "possible" (an opaque
 *  arm — `any`/`unknown`/a type parameter — kept the walk from proving either way), or "yes" (proven present). */
const CONTAINMENTS = ["no", "possible", "yes"] as const;
export type Containment = (typeof CONTAINMENTS)[number];
