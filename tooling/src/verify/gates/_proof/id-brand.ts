// Shared isolated-project source for identity-policy self-proofs.
const BRAND_BASE =
  "declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\n";

export function idBrandProofModule(declarations = ""): string {
  return `${BRAND_BASE}${declarations}`;
}

export function idCastProofModule(declarations = ""): string {
  return `${BRAND_BASE}export function castId<T extends string>(raw: string): T { return raw as T; }\n${declarations}`;
}
