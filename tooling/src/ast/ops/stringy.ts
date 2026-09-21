// stringy: type aliases whose RESOLVED type is exactly `string`.
import { Node, SyntaxKind } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { Flags, Hit, StringyAudit, StringyCandidate, StringyLink } from "../contract/types.ts";
import { emit, hitOf, narrate } from "../lib/emit.ts";
import { declKey } from "../lib/keys.ts";
import { corpusPredicate, SKIP_TEST_FILES, scanCorpus } from "../lib/ledger.ts";
import { SNIPPET_CAP, TEST_FILE_RE } from "../lib/root.ts";
import { resolveScope } from "../lib/scope.ts";
import { PACKAGES_PREFIX } from "./chains.ts";
import { relPath } from "./swallowed.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

// ── stringy: type aliases whose RESOLVED type is exactly `string` — a name that buys no checking ────────
// NOT the `aliases` verb, and the two must never be conflated. `aliases` is about IMPORT/RENAME laundering —
// one declaration living under N public names (`import/export { X as Y }`, `const Y = X`, `type Y = X`) — and
// it never asks what a type MEANS. This lens never asks what an alias is NAMED: it asks what its right-hand
// side RESOLVES to, and reports the ones that resolve to bare `string`.
//
// THE RULE (owner's framing, 2026-08-03): an alias must NARROW or BRAND. If it does neither it is a lie with a
// nice name — `type X = string` buys a name and gives up all checking, while READING like a type at the call
// site so a reviewer relaxes. Every string in the workspace is assignable to it, and it is assignable to every
// string parameter; the alias's only effect is on human confidence.
//
// WHY THIS MUST BE RESOLUTION-BASED. The direct `type X = string` is one grep (there is exactly ONE on the
// tree). The half that matters is `type A = B` where B — through import chains and re-export hops, usually in
// another package — is itself `string`. No syntactic tool we own can see that; `decl.getType().isString()`
// sees all of it in one checker call, which is why this verb lives in the TYPED arm.
//
// WHAT IS NOT A HIT — each a genuine narrowing, and each falls out of `isString()` with NO allowlist
// (measured on probes, 2026-08-03):
//   • a TEMPLATE-LITERAL type (a backticked `chat_` prefix over a string placeholder) — its flag is
//     TemplateLiteral, never String, so it REJECTS values `string` accepts, which is the point of the alias;
//   • the sanctioned BRAND, `string & { readonly [brand]: B }` (`Branded`/`TypeIdOf`, packages/kit/src/ids) —
//     an INTERSECTION; `ChatId` resolves to it, never to `string`;
//   • a string-literal union (`"a" | "b"`) and any union that merely CONTAINS string (`JsonValue`, `CelValue`,
//     `string | null`) — a union type, never the intrinsic;
//   • a type PARAMETER constrained to string (`type Id<T extends string> = T`), and `string` appearing inside
//     an object / array / tuple — the alias's own type is the parameter or the container.
// A generic whose BODY is `string` whatever its parameters (`type Lies<T> = string`) IS a hit, and is the most
// dishonest shape in the class.
//
// THE CHAIN IS THE DELIVERABLE, not the name. `A → B @ file:line → C @ file:line → string` is what tells a
// reader whether the fix is "brand it", "narrow it", or "delete the alias and use the primitive" — a bare list
// of names makes them re-walk the hops by hand. When the walk ends on a non-alias RHS the checker still
// reduced to string (an indexed access, a `ReturnType<…>`), that expression is printed with `⇒ string`.
//
// FINDINGS lens: NOT a gate, and deliberately NO exemption marker (2026-08-03). The verdict on a hit is a
// human's four-way call — brand it, narrow it, delete it, or ratify the passthrough — and a `@stringy-ok:`
// grammar with no gate reading it is dead vocabulary. If this ever becomes a gate, the marker lands WITH it.
/** How many alias hops a rendered chain names before it stops — past this the reader has the shape. */
const STRINGY_MAX_HOPS = 8;

/** `<repo-rel file>:<line>` for a declaration — the site form every chain link prints. */
export function declSite(decl: Node): string {
  return `${relPath(decl.getSourceFile().getFilePath())}:${decl.getStartLineNumber()}`;
}

/** The type alias a bare type REFERENCE names, resolved through import + re-export hops to its ORIGIN
 *  declaration (the same `getAliasedSymbol()` walk {@link bareAliasTargetKeys} uses — an alias on any hop
 *  cannot fork the identity). Undefined when the RHS is not a type reference, or names something that is not
 *  a type alias (an interface, a class, a type parameter): the chain ends there and the reader is shown the
 *  RHS text instead. Type ARGUMENTS are not a stop condition here — `type A = Lies<string>` over
 *  `type Lies<T> = string` is a real hop, and the head's stringiness was already decided by the checker. */
function aliasHopTarget(decl: Node): Node | undefined {
  if (!Node.isTypeAliasDeclaration(decl)) {
    return;
  }
  const typeNode = decl.getTypeNode();
  if (typeNode === undefined || !Node.isTypeReference(typeNode)) {
    return;
  }
  const entity = typeNode.getTypeName();
  const identifier = Node.isQualifiedName(entity) ? entity.getRight() : entity;
  const symbol = identifier.getSymbol();
  if (symbol === undefined) {
    return;
  }
  return (symbol.getAliasedSymbol() ?? symbol).getDeclarations().find((d) => Node.isTypeAliasDeclaration(d));
}

/** The RHS text of the last alias in a chain, capped — `string` for the honest case, otherwise the expression
 *  the checker reduced to `string`. */
function aliasRhsText(decl: Node): string {
  if (!Node.isTypeAliasDeclaration(decl)) {
    return decl.getText().trim().slice(0, SNIPPET_CAP);
  }
  const typeNode = decl.getTypeNode();
  return (typeNode?.getText() ?? decl.getType().getText()).trim().slice(0, SNIPPET_CAP);
}

/** Walk the alias chain from a head declaration: the hops it resolves through, plus the last hop's RHS text.
 *  The `seen` guard terminates a self-referential chain instead of looping forever. */
function stringyChainOf(head: Node): { chain: StringyLink[]; rhs: string } {
  const chain: StringyLink[] = [];
  const seen = new Set<string>([declKey(head)]);
  let cur = head;
  while (chain.length < STRINGY_MAX_HOPS) {
    const next = aliasHopTarget(cur);
    if (next === undefined || seen.has(declKey(next))) {
      break;
    }
    seen.add(declKey(next));
    chain.push({ name: Node.isTypeAliasDeclaration(next) ? next.getName() : next.getText(), site: declSite(next) });
    cur = next;
  }
  return { chain, rhs: aliasRhsText(cur) };
}

/** Every type alias of `inScope` whose resolved type is exactly `string`, plus the examined count. Pure
 *  enumeration — no printing, no scope policy (the verb owns both), so the self-test drives the same function
 *  the CLI does. Aliases are collected as DESCENDANTS, not top-level statements: one declared inside a
 *  function body or a namespace block is the same lie, told in a smaller room. */
export function collectStringyAudit(project: SourceCorpus, inScope: (filePath: string) => boolean): StringyAudit {
  const candidates: StringyCandidate[] = [];
  let aliases = 0;
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const decl of sf.getDescendantsOfKind(SyntaxKind.TypeAliasDeclaration)) {
      aliases += 1;
      // THE WHOLE CUT, in one checker call: the intrinsic `string` type and nothing else. A brand is an
      // intersection, a template literal is its own flag, a union is a union — none of them answer true here.
      if (!decl.getType().isString()) {
        continue;
      }
      const { chain, rhs } = stringyChainOf(decl);
      candidates.push({ name: decl.getName(), decl, exported: decl.isExported(), chain, rhs });
    }
  }
  return { candidates, aliases };
}

/** `<name>  →  <hop> @ site  →  …  →  <rhs>` — the resolution chain a reader needs to pick the fix. */
function stringyHit(candidate: StringyCandidate): Hit {
  const hops = candidate.chain.map((link) => `  →  ${link.name} @ ${link.site}`).join("");
  // A non-`string` RHS means the walk ended on an expression the CHECKER reduced (an indexed access, a
  // `ReturnType<…>`) — say so, or the line reads as if the lens flagged something that is not string.
  const reduced = candidate.rhs === "string" ? "" : "  ⇒  string";
  const h = hitOf(candidate.decl, candidate.exported ? "stringy-export" : "stringy-local");
  h.text = `${candidate.name}${hops}  →  ${candidate.rhs}${reduced}`;
  return h;
}

/** Type aliases that resolve to bare `string` — no narrowing, no brand. Optional scope (a package name /
 *  path); bare = every package. Reports the RESOLUTION CHAIN, which is what names the fix. */
export function cmdStringy(project: SourceCorpus, arg: string, flags: Flags): void {
  const scope = arg === "" ? { prefix: PACKAGES_PREFIX, label: "(all packages)" } : resolveScope(project, arg, "stringy");
  const inScope = corpusPredicate(scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] }));
  const audit = collectStringyAudit(project, inScope);
  narrate(
    flags,
    `stringy: ${audit.aliases} type alias(es) examined in scope — a zero below means every one of them NARROWS or BRANDS, not that the lens is blind. (This is NOT \`aliases\`, which reports rename laundering and never inspects a type's meaning.)`,
  );
  narrate(
    flags,
    "stringy = an alias whose RESOLVED type is exactly `string`: it buys a name and gives up all checking, while reading like a type at the call site. The chain (`A → B → string`) names the fix — BRAND it (`Branded`/`TypeIdOf`, packages/kit/src/ids), NARROW it (a template-literal or a literal union), or DELETE the alias and use the primitive. A template literal, a `string & {brand}` intersection, a literal/value union, and a `T extends string` parameter are all genuine narrowings and are NOT reported. No exemption marker by design: this lens does not gate.",
  );
  emit(audit.candidates.map(stringyHit), flags, `stringy ${scope.label}`);
}
