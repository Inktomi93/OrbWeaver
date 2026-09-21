import { commentHost } from "../lib/public-markers.ts";
// swallowed: exports alive ONLY because a namespace import swallowed their module.

import process from "node:process";
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { Flags, Hit, Liveness, NamespaceSite, SwallowedCandidate } from "../contract/types.ts";
import { emit, hitOf, narrate } from "../lib/emit.ts";
import { declKey } from "../lib/keys.ts";
import { corpusPredicate, SKIP_TEST_FILES, scanCorpus } from "../lib/ledger.ts";
import { buildLiveness, isReferencedInOwnFile } from "../lib/liveness.ts";
import { isTestPath, REPO_ROOT, TEST_FILE_RE } from "../lib/root.ts";
import { ownExports, resolveScope } from "../lib/scope.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

// ── swallowed: exports alive ONLY because a namespace import swallowed the whole module ─────────
// The rot-hider class, proven on the real tree: `packages/db/src/client/index.ts` does
// `import * as schema from "#schema"` and hands the namespace to `drizzle(client, { schema })`. That single
// import marks EVERY schema export alive (markModuleAlive's deliberate err-alive arm), so a functionally
// unused export inside the barrel reads as consumed forever — `usersRelations` did, for five weeks.
//
// The lens reports exports whose ONLY liveness arm is `namespace` AND whose member NAME no swallowing file
// ever spells (`ns.member`, `ns["member"]`, `const { member } = ns`) AND that no named import reaches
// anywhere (prod or test) AND that their own file never uses. An export the swallowing file passes
// WHOLESALE into a call — the drizzle shape — is exactly what stays a candidate: that is the class.
//
// CANDIDATE lens, never a death sentence: the swallowing API may itself use the member (drizzle DOES read a
// `relations()` config when one is present). It finds candidates for a HUMAN verdict. A deliberate keep is
// tagged `// @swallowed-ok: <reason>` on the declaration, and that tag is TWO-SIDED — a tag on an export the
// lens no longer considers swallowed is reported STALE and exits 1.
const SWALLOWED_OK_RE = /@swallowed-ok:\s*\S/u;

/** True if the declaration carries a leading `// @swallowed-ok: <reason>` — a deliberate keep of an export
 *  only a namespace consumer reaches. The reason is required (bare marker does NOT exempt, as with
 *  `@server-only:`/`@test-fixture:` at the unwired lens). */
export function isSwallowedExempt(decl: Node): boolean {
  return commentHost(decl)
    .getLeadingCommentRanges()
    .some((range) => SWALLOWED_OK_RE.test(range.getText()));
}

/** Every member name a namespace-importing file SPELLS on its `import * as <alias>` binding: `alias.member`,
 *  `alias["member"]`, and `const { member } = alias`. A member named here is genuinely consumed — it is the
 *  arm that separates "the module was swallowed" from "this export was actually used through it". */
function namedMembersOf(site: NamespaceSite): Set<string> {
  const bindingKeys = new Set((site.binding.getSymbol()?.getDeclarations() ?? []).map(declKey));
  const isNamespaceBinding = (node: Node): boolean => (node.getSymbol()?.getDeclarations() ?? []).some((declaration) => bindingKeys.has(declKey(declaration)));
  const named = new Set<string>();
  for (const pa of site.file.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (isNamespaceBinding(pa.getExpression())) {
      named.add(pa.getName());
    }
  }
  for (const ea of site.file.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    const arg = ea.getArgumentExpression();
    if (isNamespaceBinding(ea.getExpression()) && arg !== undefined && Node.isStringLiteral(arg)) {
      named.add(arg.getLiteralText());
    }
  }
  for (const v of site.file.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = v.getInitializer();
    const binding = v.getNameNode();
    if (init === undefined || !isNamespaceBinding(init) || !Node.isObjectBindingPattern(binding)) {
      continue;
    }
    for (const element of binding.getElements()) {
      named.add((element.getPropertyNameNode() ?? element.getNameNode()).getText());
    }
  }
  return named;
}

/** Exports of `inScope` whose only liveness arm is `namespace` and whose name no swallowing file spells.
 *  Pure enumeration — no exemption policy, no printing (the verb owns both), so the self-test drives the
 *  same function the CLI does. */
export function collectSwallowedCandidates(project: SourceCorpus, live: Liveness, inScope: (filePath: string) => boolean): SwallowedCandidate[] {
  const spelledAt = memoizedSpelledMembers();
  const out: SwallowedCandidate[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (inScope(fp) && !TEST_FILE_RE.test(fp)) {
      out.push(...swallowedInFile(sf, live, spelledAt));
    }
  }
  return out;
}

/** `namedMembersOf` behind a per-run cache: without it every candidate re-walks every swallowing file's
 *  identifiers (the `#schema` barrel has one namespace site per consumer and dozens of exports). */
function memoizedSpelledMembers(): (site: NamespaceSite) => Set<string> {
  const cache = new Map<NamespaceSite, Set<string>>();
  return (site) => {
    const hit = cache.get(site);
    if (hit !== undefined) {
      return hit;
    }
    const fresh = namedMembersOf(site);
    cache.set(site, fresh);
    return fresh;
  };
}

/** ONE file's swallowed candidates — the three exclusions in order: a non-namespace arm reached it (a NAMED
 *  import, a dynamic import, or checked external consumption), its own file uses it, or a swallowing
 *  file spells its name. Nothing reaching it at all is an `orphans` hit, not this lens's business. */
function swallowedInFile(sf: SourceFile, live: Liveness, spelledAt: (site: NamespaceSite) => Set<string>): SwallowedCandidate[] {
  const out: SwallowedCandidate[] = [];
  for (const { name, decl } of ownExports(sf)) {
    const key = declKey(decl);
    const arms = live.arms.get(key);
    if (arms === undefined || arms.size !== 1 || !arms.has("namespace") || isReferencedInOwnFile(sf, name, decl)) {
      continue;
    }
    const sites = live.namespaceSites.filter((s) => s.exposed.has(key));
    if (sites.some((s) => (s.exposed.get(key) ?? []).some((exportName) => spelledAt(s).has(exportName)))) {
      continue;
    }
    out.push({ name, decl, sites: sites.map((s) => relPath(s.file.getFilePath())).sort(byProdFirst) });
  }
  return out;
}

/** Swallowing sites sort SHIPPED code first: the hit only shows the first couple, and the site that decides
 *  the verdict is the production one (db's `drizzle(client, { schema })`), not a test helper that happens to
 *  namespace-import the same barrel. */
export function byProdFirst(a: string, b: string): number {
  const rank = (p: string): number => (p.startsWith("packages/") && !isTestPath(`/${p}`) ? 0 : 1);
  return rank(a) - rank(b) || a.localeCompare(b);
}

/** Repo-relative form of an absolute workspace path (the form every Hit prints). */
export function relPath(full: string): string {
  return full.startsWith(`${REPO_ROOT}/`) ? full.slice(REPO_ROOT.length + 1) : full;
}

/** How many swallowing sites a hit names before it collapses to a count — the drizzle-shaped `#schema`
 *  namespace is imported from many files and the list is not the point, the FIRST one is. */
const SWALLOW_SITES_SHOWN = 2;

export function swallowedHit(candidate: SwallowedCandidate): Hit {
  const shown = candidate.sites.slice(0, SWALLOW_SITES_SHOWN).join(", ");
  const more = candidate.sites.length > SWALLOW_SITES_SHOWN ? ` +${candidate.sites.length - SWALLOW_SITES_SHOWN} more` : "";
  const h = hitOf(candidate.decl, "swallowed-export");
  h.text = `${candidate.name}  ←  namespace-swallowed by ${shown}${more}  —  ${h.text}`;
  return h;
}

/** The STALE side of the `@swallowed-ok` marker: a tag on an export the lens no longer calls swallowed — it
 *  is named-imported now, spelled at a namespace site, used in its own file, or dead outright. Printed and
 *  exit-1 so the marker cannot rot into a permanent lie (the two-sided-gate law). */
function printStaleSwallowedTags(project: SourceCorpus, inScope: (fp: string) => boolean, candidateKeys: Set<string>, flags: Flags): void {
  const stale: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      if (!isSwallowedExempt(decl) || candidateKeys.has(declKey(decl))) {
        continue;
      }
      const h = hitOf(decl, "stale-swallowed-ok");
      h.text = `${name}  —  ${h.text}`;
      stale.push(h);
    }
  }
  if (stale.length === 0) {
    return;
  }
  narrate(
    flags,
    `swallowed: ${stale.length} STALE \`@swallowed-ok:\` marker(s) — the export is no longer namespace-swallowed (a named import or an \`ns.<member>\` access reaches it, its own file uses it, or nothing reaches it at all and it is an \`orphans\` hit). Delete the marker or re-state the reason:`,
  );
  for (const h of stale) {
    narrate(flags, `  ! ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
  }
  process.exitCode = 1;
}

/** Exports alive ONLY because an `import * as ns` handed their whole module to something — and whose member
 *  name no swallowing file ever spells. Optional scope (a package name / path); bare = every package. A
 *  deliberate keep carries `// @swallowed-ok: <reason>`; a stale marker is reported and exits 1. */
export function cmdSwallowed(project: SourceCorpus, arg: string, flags: Flags): void {
  const scope = arg === "" ? { prefix: "/packages/", label: "(all packages)" } : resolveScope(project, arg, "swallowed");
  const inScope = corpusPredicate(scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] }));
  const live = buildLiveness(project);
  const candidates = collectSwallowedCandidates(project, live, inScope);
  printStaleSwallowedTags(project, inScope, new Set(candidates.map((c) => declKey(c.decl))), flags);
  const hits = candidates.filter((c) => !isSwallowedExempt(c.decl)).map(swallowedHit);
  const exempt = candidates.length - hits.length;
  narrate(
    flags,
    `swallowed is a CANDIDATE lens — a hit may be load-bearing THROUGH the swallowing API itself (drizzle reads a \`relations()\` config it is handed without your code ever naming it). It finds exports whose only liveness is a whole-module \`import * as\`; the verdict is a human's. Keep one deliberately with \`// @swallowed-ok: <reason>\` on the declaration.${exempt === 0 ? "" : ` (${exempt} candidate(s) exempted by a reasoned marker.)`}`,
  );
  emit(hits, flags, `swallowed ${scope.label}`);
}
