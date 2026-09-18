// The axis verdict `lib/role-vocabulary.ts` answers with (#1988). `gates/owner-role-split.ts` and
// `gates/two-class-role-authority.ts` both dispatch on it, so it crosses the lib↔policy boundary and `lib/`
// is not a type home (Spine-TypeScript-and-Patterns.md §7.4, Core-Tooling-Law.md §2.5).
//
// ITS REFUSAL ARM IS SPELLED `foreign`, NOT `other`, so it is deliberately NOT derived from
// `origin-verdict.ts#OriginVerdict`: that axis answers about a reference's IDENTITY, this one about whether
// a closed literal union IS a vocabulary. Unifying the two spellings would change every call site's
// narrowing and is a design decision, not a re-home — flagged rather than taken (#1988 lane report).

/** The three answers a caller needs, and the reason this is not a boolean. A boolean forced the two role
 *  policies to fail OPEN on everything the checker could not close: a read typed `any`, a read typed plain
 *  `string`, and a read whose type is a strict SUPERSET of the vocabulary all passed silently, while the
 *  legacy hardcoded-literal readers caught the `string` case. Only a CLOSED literal union that provably
 *  omits a vocabulary member is another axis; everything else is fail-closed evidence. */
export const ROLE_AXIS_VERDICTS = ["on-axis", "foreign", "unreadable"] as const;
export type RoleAxisVerdict = (typeof ROLE_AXIS_VERDICTS)[number];
