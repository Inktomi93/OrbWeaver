// subset-callers — the STALE-DOOR lens (#546, minted from #539). Two call sites of one wire verb that pass
// DIFFERENT param object keys are not two spellings of one call: the caller passing a strict SUBSET of
// another's keys is the door that stopped being updated (SpeakAsSelect passed `{speakerCharacterId}` while
// the surviving door also carried guided steer + responseNudge, so one door silently dropped two features).
// No gate can see this — the call sites are structurally identical, and cpd/respell compare TEXT, not keys.
// REFUSES rather than reporting clean: an unresolvable argument (a spread, a computed key, a value this
// lens cannot follow) is counted and NAMED, and fewer than two RESOLVED sites is a tool error, never "no
// findings" — a subset comparison over one comparable site is a question that was never asked.
import type { Node, ObjectLiteralExpression, Project, SourceFile } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Flags, Hit, SubsetAudit, SubsetCallSite, SubsetFinding } from "../contract/types.ts";
import { emit, hitOf } from "../lib/emit.ts";
import { exitToolError, noteUnits, scanCorpus, WHOLE_CORPUS } from "../lib/ledger.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

/** A subset comparison needs two sides. One resolved site answers nothing — and printing "no findings"
 *  there is exactly the false clean this lens exists to refuse. */
const MIN_COMPARABLE_SITES = 2;
/** How many supersets a finding NAMES before it elides the rest (the reader needs the shape, not a list). */
const NAMED_SUPERSETS = 3;

/** Strip the wrappers that sit between a call argument and its object literal — `(x)`, `x as T`,
 *  `x satisfies T`. A narrow `isObjectLiteralExpression` check would call every wrapped literal
 *  UNRESOLVED and quietly shrink the comparable set (GATE-AUTHORING.md §5, literal-shape blindness). */
function unwrap(node: Node): Node {
  let current = node;
  while (TsNode.isParenthesizedExpression(current) || TsNode.isAsExpression(current) || TsNode.isSatisfiesExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

/** The property KEYS of an object literal, or null when one property's key is not statically knowable
 *  (a spread widens the set by an unknown amount; a computed key names something only the runtime knows).
 *  Null is the whole SITE's verdict — a partially-known key set would produce false subset findings. */
export function objectKeys(obj: ObjectLiteralExpression): readonly string[] | null {
  const keys: string[] = [];
  for (const prop of obj.getProperties()) {
    if (TsNode.isSpreadAssignment(prop)) {
      return null;
    }
    if (TsNode.isShorthandPropertyAssignment(prop)) {
      keys.push(prop.getName());
      continue;
    }
    if (
      TsNode.isPropertyAssignment(prop) ||
      TsNode.isMethodDeclaration(prop) ||
      TsNode.isGetAccessorDeclaration(prop) ||
      TsNode.isSetAccessorDeclaration(prop)
    ) {
      const name = prop.getNameNode();
      if (name.isKind(SyntaxKind.ComputedPropertyName)) {
        return null;
      }
      keys.push(TsNode.isStringLiteral(name) || TsNode.isNoSubstitutionTemplateLiteral(name) ? name.getLiteralText() : name.getText());
      continue;
    }
    return null;
  }
  return [...new Set(keys)].sort((a, b) => a.localeCompare(b));
}

/** What the first argument resolves to. ONE HOP, SAME FILE (declared limit): `send(input)` where `input`
 *  is a same-file `const input = { … }` is the common spelling, and refusing it would leave the lens blind
 *  to a whole class of doors; anything further (a parameter, an import, a call result) stays UNRESOLVED. */
function resolveArgument(call: Node, sf: SourceFile): { readonly obj: ObjectLiteralExpression; readonly via: string | null } | { readonly reason: string } {
  if (!TsNode.isCallExpression(call)) {
    return { reason: "not a call expression" };
  }
  const raw = call.getArguments()[0];
  if (raw === undefined) {
    return { reason: "no first argument — this call passes nothing to compare" };
  }
  const arg = unwrap(raw);
  if (TsNode.isObjectLiteralExpression(arg)) {
    return { obj: arg, via: null };
  }
  if (TsNode.isIdentifier(arg)) {
    const decl = sf.getVariableDeclaration(arg.getText());
    const rawInit = decl?.getInitializer();
    const init = rawInit === undefined ? undefined : unwrap(rawInit);
    if (init !== undefined && TsNode.isObjectLiteralExpression(init)) {
      return { obj: init, via: arg.getText() };
    }
    return { reason: `identifier \`${arg.getText()}\` — no same-file const with an object-literal initializer (resolution is ONE hop, same file)` };
  }
  return { reason: `first argument is a ${arg.getKindName()}, not an object literal` };
}

/** Every call site of `symbol` in `files` — bare (`send(…)`) and method-tail (`api.send(…)`), the same
 *  match the `callers` verb makes — each carrying its resolved key set or the reason it has none. */
export function collectSubsetCallSites(files: readonly SourceFile[], symbol: string): readonly SubsetCallSite[] {
  const sites: SubsetCallSite[] = [];
  for (const sf of files) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();
      const tail = TsNode.isPropertyAccessExpression(expr) ? expr.getName() : expr.getText();
      if (tail !== symbol) {
        continue;
      }
      const resolved = resolveArgument(call, sf);
      if ("reason" in resolved) {
        sites.push({ node: call, keys: null, unresolved: resolved.reason, via: null });
        continue;
      }
      const keys = objectKeys(resolved.obj);
      sites.push({
        node: call,
        keys,
        unresolved: keys === null ? "the argument object carries a SPREAD or a COMPUTED key — its key set is not statically knowable" : null,
        via: resolved.via,
      });
    }
  }
  return sites;
}

/** `a` is a strict subset of `b`. */
function isStrictSubset(a: readonly string[], b: readonly string[]): boolean {
  if (a.length >= b.length) {
    return false;
  }
  const superset = new Set(b);
  return a.every((k) => superset.has(k));
}

/** Every key some superset passes that `keys` does not — the features this door stopped carrying. */
function missingKeys(keys: readonly string[], supersets: readonly SubsetCallSite[]): readonly string[] {
  const missing = new Set<string>();
  for (const other of supersets) {
    for (const key of other.keys ?? []) {
      if (!keys.includes(key)) {
        missing.add(key);
      }
    }
  }
  return [...missing].sort((a, b) => a.localeCompare(b));
}

/** The audit: every call site, plus the sites whose key set is a STRICT SUBSET of another site's — the
 *  likely stale doors. Same key sets and disjoint key sets are NOT findings, and neither is a partial
 *  overlap in both directions (a different class: two doors that diverged, with no stale one to name). */
export function collectSubsetCallers(files: readonly SourceFile[], symbol: string): SubsetAudit {
  const sites = collectSubsetCallSites(files, symbol);
  const resolved = sites.filter((s) => s.keys !== null);
  const findings: SubsetFinding[] = [];
  for (const site of resolved) {
    const keys = site.keys ?? [];
    // An empty object passes nothing, so every other site would trivially "superset" it — noise, not a door.
    const supersets = keys.length === 0 ? [] : resolved.filter((other) => other !== site && isStrictSubset(keys, other.keys ?? []));
    if (supersets.length > 0) {
      findings.push({ site, supersets, missing: missingKeys(keys, supersets) });
    }
  }
  return { sites, resolved: resolved.length, findings };
}

/** `file:line` for a site, for the "⊂ that one" half of a finding line. */
function whereOf(site: SubsetCallSite): string {
  const hit = hitOf(site.node, "site");
  return `${hit.file}:${hit.line}`;
}

function findingHit(symbol: string, finding: SubsetFinding): Hit {
  const hit = hitOf(finding.site.node, "subset-caller");
  const named = finding.supersets.slice(0, NAMED_SUPERSETS).map(whereOf);
  const more = finding.supersets.length > named.length ? ` +${finding.supersets.length - named.length} more` : "";
  const via = finding.site.via === null ? "" : ` (via \`${finding.site.via}\`)`;
  hit.text = `${symbol}({${(finding.site.keys ?? []).join(", ")}})${via} — MISSING: ${finding.missing.join(", ")}  ⊂  ${named.join(", ")}${more}`;
  return hit;
}

/** The UNRESOLVED census — printed ALWAYS, above the hits. These sites were not judged, and a lens that
 *  drops them silently is reporting a clean it never measured. */
function printUnresolved(sites: readonly SubsetCallSite[]): void {
  const unresolved = sites.filter((s) => s.keys === null);
  if (unresolved.length === 0) {
    return;
  }
  print(`UNJUDGED (${unresolved.length} call site(s) whose key set this lens cannot resolve — NOT evidence of agreement):`);
  for (const site of unresolved) {
    print(`  ~ ${whereOf(site)}  ${site.unresolved ?? "unresolved"}`);
  }
}

export function cmdSubsetCallers(project: Project, symbol: string, flags: Flags): void {
  const files = scanCorpus(project, WHOLE_CORPUS);
  const audit = collectSubsetCallers(files, symbol);
  noteUnits("call-sites", audit.sites.length);
  printUnresolved(audit.sites);
  if (audit.sites.length === 0) {
    exitToolError(
      `[ast] NO CALL SITE — \`${symbol}\` is called nowhere in the scanned corpus, so no key sets were compared. This is a TOOL ERROR, not a clean subset verdict: check the spelling (the subject is POSITIONAL) and note that the syntactic corpus excludes scripts/** outside check/gates.`,
    );
  }
  if (audit.resolved < MIN_COMPARABLE_SITES) {
    exitToolError(
      `[ast] NOT COMPARABLE — \`${symbol}\` has ${audit.sites.length} call site(s) but only ${audit.resolved} with a statically knowable key set, and a subset comparison needs ${MIN_COMPARABLE_SITES}. Reporting "no findings" here would be a clean this lens never measured (the UNJUDGED list above says why each site could not be read).`,
    );
  }
  print(
    `comparing ${audit.resolved} of ${audit.sites.length} call site(s) of \`${symbol}\` by first-argument object KEYS — ` +
      "THE SUBJECT IS THE COMPARISON UNIT: a shared method tail (`mutate`, `call`) pools unrelated verbs and every finding is noise; name the VERB or HOOK, and narrow further with --in <path>",
  );
  emit(
    audit.findings.map((f) => findingHit(symbol, f)),
    flags,
    `subset-callers ${symbol}`,
  );
}
