// subset-callers — the STALE-DOOR lens (#546, minted from #539). Two call sites of one wire verb that pass
// DIFFERENT param object keys are not two spellings of one call: the caller passing a strict SUBSET of
// another's keys is the door that stopped being updated (SpeakAsSelect passed `{speakerCharacterId}` while
// the surviving door also carried guided steer + responseNudge, so one door silently dropped two features).
// No gate can see this — the call sites are structurally identical, and cpd/respell compare TEXT, not keys.
// REFUSES rather than reporting clean: an unresolvable argument (a spread, a computed key, a value this
// lens cannot follow) is counted and NAMED, and fewer than two RESOLVED sites is a tool error, never "no
// findings" — a subset comparison over one comparable site is a question that was never asked.
//
// TWO DOOR CLASSES, both judged (#572). A DIRECT call site spells the verb (`sendTurn({…})`,
// `api.sendTurn({…})`) — the original arm. A CLIENT door does not: it names its verb only where it is
// CREATED (`createEntityMutation({ options: (trpc) => trpc.chat.generate.mutationOptions() })`) and fires
// through a bare `.mutate(…)` that names nothing, which is why refusing `mutate` as a pooling tail (correct
// — it pools every unrelated verb) left this lens blind to every affordance a user actually clicks. The
// RECEIVER is resolved instead, through the ONE shared client-door resolver
// (`tooling/src/_shared/trpc-doors.ts`, shared with the `duplicate-action-doors` gate so the census and the
// lens can never disagree about what a door is), and the keys are pooled under the resolved verb.
// The resolver is LEVEL 1 and states its own limits; this lens PRINTS them (the door census in the banner)
// rather than letting an unfollowable fire site read as agreement.
import type { CallExpression, Node, ObjectLiteralExpression, Project, SourceFile } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { MutationFactoryIndex } from "../../_shared/trpc-doors.ts";
import { indexMutationFactories, MUTATION_FIRE_MEMBERS, procedureMatches, resolveFiredDoor } from "../../_shared/trpc-doors.ts";
import type { Flags, Hit, SubsetAudit, SubsetCallSite, SubsetDoorCensus, SubsetFinding, SubsetSiteScan } from "../contract/types.ts";
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

/** One call site's key set, whichever door class it came from. */
function siteOf(call: CallExpression, sf: SourceFile, door: string | null): SubsetCallSite {
  const resolved = resolveArgument(call, sf);
  if ("reason" in resolved) {
    return { node: call, keys: null, unresolved: resolved.reason, via: null, door };
  }
  const keys = objectKeys(resolved.obj);
  return {
    node: call,
    keys,
    unresolved: keys === null ? "the argument object carries a SPREAD or a COMPUTED key — its key set is not statically knowable" : null,
    via: resolved.via,
    door,
  };
}

/** A fire site the level-1 resolver refused — counted, never a site of anything (it could be a door on ANY
 *  verb, so admitting it under this subject would invent a comparison). */
const UNRESOLVED_FIRE = "unresolved-fire";

/** What one call expression is to this subject: a site (with the verb a CLIENT door resolved to, or null
 *  for a direct call), a refused fire site, or nothing at all. */
type CallVerdict = { readonly site: SubsetCallSite; readonly procedure: string | null } | typeof UNRESOLVED_FIRE | null;

function classifyCall(call: CallExpression, sf: SourceFile, symbol: string, index: MutationFactoryIndex): CallVerdict {
  const expr = call.getExpression();
  const tail = TsNode.isPropertyAccessExpression(expr) ? expr.getName() : expr.getText();
  if (tail === symbol) {
    return { site: siteOf(call, sf, null), procedure: null };
  }
  if (!MUTATION_FIRE_MEMBERS.has(tail)) {
    return null;
  }
  const door = resolveFiredDoor(call, index);
  if (door === null) {
    return null;
  }
  if ("reason" in door) {
    return UNRESOLVED_FIRE;
  }
  return procedureMatches(door.procedure, symbol) ? { site: siteOf(call, sf, door.chain), procedure: door.procedure } : null;
}

/**
 * Every call site of `symbol` in `files`, in BOTH door classes, plus the census of what the client-door
 * arm could not judge.
 *
 * DIRECT: bare (`send(…)`) and method-tail (`api.send(…)`) — the same match the `callers` verb makes.
 * CLIENT: a `.mutate(…)`/`.mutateAsync(…)` fire whose receiver resolves to a `createEntityMutation` hook
 * built against a procedure `symbol` names (its bare member or its full path). A fire site the resolver
 * cannot follow is NOT a site of anything — it is counted in `doors.unresolvedFires`, because it could be
 * a door on any verb and dropping it silently is the false clean this lens exists to refuse.
 */
export function collectSubsetCallSites(files: readonly SourceFile[], symbol: string): SubsetSiteScan {
  const index: MutationFactoryIndex = indexMutationFactories(files);
  const sites: SubsetCallSite[] = [];
  const procedures = new Set<string>();
  let unresolvedFires = 0;
  for (const sf of files) {
    for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const verdict = classifyCall(call, sf, symbol, index);
      if (verdict === null) {
        continue;
      }
      if (verdict === UNRESOLVED_FIRE) {
        unresolvedFires += 1;
        continue;
      }
      if (verdict.procedure !== null) {
        procedures.add(verdict.procedure);
      }
      sites.push(verdict.site);
    }
  }
  return { sites, doors: { factories: index.size, unresolvedFires, procedures: [...procedures].sort((a, b) => a.localeCompare(b)) } };
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
  const { sites, doors } = collectSubsetCallSites(files, symbol);
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
  return { sites, resolved: resolved.length, findings, doors };
}

/** `file:line` for a site, for the "⊂ that one" half of a finding line. */
function whereOf(site: SubsetCallSite): string {
  const hit = hitOf(site.node, "site");
  return `${hit.file}:${hit.line}`;
}

/** A finding whose subset and EVERY superset sit in different door classes is a CROSS-CLASS comparison, and
 *  saying so is the difference between a lead and a false accusation: a client door physically cannot carry
 *  the fields a domain-verb call site passes (`principal` is minted at the entry seam and never crosses the
 *  wire), so "missing principal" against server-side callers is the pooling the banner warns about, not a
 *  stale door. The #539 class — the one this lens exists for — is a client door under ANOTHER CLIENT DOOR. */
export function crossClassNote(finding: SubsetFinding): string {
  const isDoor = finding.site.door !== null;
  const anySameClass = finding.supersets.some((s) => (s.door !== null) === isDoor);
  if (anySameClass) {
    return "";
  }
  return isDoor
    ? "  [CROSS-CLASS: every superset is a DIRECT call site, not another client door — server-only fields cannot reach a wire payload; not the stale-door class]"
    : "  [CROSS-CLASS: every superset is a CLIENT door, not another direct call site]";
}

/** The supersets a finding NAMES, SAME-CLASS FIRST. `NAMED_SUPERSETS` elides the rest, and walk order buried
 *  the one superset a reader needs: the #539 class is a client door under ANOTHER client door, so a list
 *  that names three server-side callers and hides the sibling door behind "+13 more" reports the right
 *  finding with the wrong evidence. */
export function sameClassFirst(finding: SubsetFinding): readonly SubsetCallSite[] {
  const isDoor = finding.site.door !== null;
  const rank = (s: SubsetCallSite): number => ((s.door !== null) === isDoor ? 0 : 1);
  return [...finding.supersets].sort((a, b) => rank(a) - rank(b));
}

function findingHit(symbol: string, finding: SubsetFinding): Hit {
  const hit = hitOf(finding.site.node, "subset-caller");
  const named = sameClassFirst(finding).slice(0, NAMED_SUPERSETS).map(whereOf);
  const more = finding.supersets.length > named.length ? ` +${finding.supersets.length - named.length} more` : "";
  const via = finding.site.via === null ? "" : ` (via \`${finding.site.via}\`)`;
  const door = finding.site.door === null ? "" : ` [client door: ${finding.site.door}]`;
  hit.text = `${symbol}({${(finding.site.keys ?? []).join(", ")}})${via}${door} — MISSING: ${finding.missing.join(", ")}  ⊂  ${named.join(", ")}${more}${crossClassNote(finding)}`;
  return hit;
}

/** The UNRESOLVED census — printed ALWAYS, above the hits. These sites were not judged, and a lens that
 *  drops them silently is reporting a clean it never measured. A CLIENT door names its resolution chain,
 *  so a hook-wrapped fire site (`fireContinue` → `continueTurn.mutate(cond ? … : …)`) is legible as the
 *  WRAP SITE it is rather than as an anonymous unreadable call. */
function printUnresolved(sites: readonly SubsetCallSite[]): void {
  const unresolved = sites.filter((s) => s.keys === null);
  if (unresolved.length === 0) {
    return;
  }
  print(`UNJUDGED (${unresolved.length} call site(s) whose key set this lens cannot resolve — NOT evidence of agreement):`);
  for (const site of unresolved) {
    const door = site.door === null ? "" : `${site.door}  ·  `;
    print(`  ~ ${whereOf(site)}  ${door}${site.unresolved ?? "unresolved"}`);
  }
}

/** WHICH DOOR CLASSES THIS RUN COULD AND COULD NOT JUDGE — printed on EVERY run, clean or not (#572). A
 *  verdict without it is a number whose denominator the reader has to guess at. */
function printDoorClasses(symbol: string, doors: SubsetDoorCensus): void {
  print(
    `DOOR CLASSES — judged: DIRECT call sites (tail \`${symbol}\`) + CLIENT doors fired through the mutation factory ` +
      `(${doors.factories} \`createEntityMutation\` hook(s) indexed; level 1 = a \`<const>.mutate(…)\` whose receiver is bound same-file to an indexed hook). ` +
      `NOT judged: ${doors.unresolvedFires} \`.mutate()/.mutateAsync()\` fire site(s) whose receiver level-1 resolution could not follow ` +
      "(a parameter, a cross-module binding, an ambiguous hook name) — ANY of them could be another door on this verb; " +
      "and a DESTRUCTURED `const { mutate } = useX()` fires a bare `mutate(…)` this lens never sees as a door at all.",
  );
  if (doors.procedures.length > 1) {
    print(
      `  ! POOLED — the matched client doors resolved to ${doors.procedures.length} DIFFERENT procedures (${doors.procedures.join(", ")}): name the full path to separate them.`,
    );
  }
}

export function cmdSubsetCallers(project: Project, symbol: string, flags: Flags): void {
  const files = scanCorpus(project, WHOLE_CORPUS);
  const audit = collectSubsetCallers(files, symbol);
  noteUnits("call-sites", audit.sites.length);
  printDoorClasses(symbol, audit.doors);
  printUnresolved(audit.sites);
  if (audit.doors.factories === 0) {
    exitToolError(
      "[ast] CLIENT-DOOR ARM BLIND — zero `createEntityMutation` hooks were indexed in the scanned corpus, so every client door was invisible and this run judged DIRECT call sites only. That is a TOOL ERROR, not a narrower clean: either the corpus excludes packages/client/src or the one mutation factory was renamed (re-point MUTATION_FACTORY in tooling/src/_shared/trpc-doors.ts).",
    );
  }
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
