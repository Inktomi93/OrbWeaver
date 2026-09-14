// The ONE client-door resolver — "which tRPC MUTATION does this client site fire?" — shared by the
// `duplicate-action-doors` gate (which counts DOORS per rail plane) and the `ast subset-callers` lens
// (which compares the PAYLOADS those doors pass). Two consumers, one resolution: a second spelling would
// let the gate and the lens disagree about what a door IS, which is the one-home violation this module
// exists to prevent. Precedent for the placement: `_shared/schema-read.ts` (the drizzle reader shared by
// five gates and an ast lens) — a ts-morph reader over repo source is plumbing, not a tool's own logic.
//
// The tree's door grammar, in the two shapes it takes:
//   • the CREATION site — `trpc.<path>.mutationOptions()` / `.useMutation()` (the two TanStack Query
//     spellings), either inline in a component or inside the ONE mutation factory
//     (`createEntityMutation({ options: (trpc) => trpc.chat.generate.mutationOptions(), … })`,
//     packages/client/src/data/create-entity-mutation.ts). A creation site NAMES its verb.
//   • the FIRE site — `<receiver>.mutate(…)` / `.mutateAsync(…)` on the factory's result. It names NO
//     verb, which is exactly why a bare `mutate` tail pools every unrelated verb in the tree.
//
// DECLARED LIMIT — fire→verb resolution is purely SYNTACTIC (the lens runs on the no-type-graph corpus, so
// there is no import resolution to lean on), in two levels:
//   • LEVEL 1 — a RECEIVER identifier (`speakAs.mutate(…)`) resolves through a same-file variable
//     declaration whose initializer CALLS a factory hook, and that hook is looked up by NAME in a
//     corpus-wide index of `createEntityMutation` declarations.
//   • LEVEL 2 (#576) — a DESTRUCTURED binding (`const { mutate } = useX()`, and its aliased twin
//     `const { mutate: fire } = useX()`) fires a BARE `mutate(…)` that names neither a receiver nor a verb.
//     The binding's PROPERTY name says it is a fire member, and its initializer resolves to a hook call
//     through the SAME index — directly, or through one same-file identifier hop (`const i = useX(); const
//     { mutateAsync } = i;`). Before this level those doors were not merely unresolved, they were INVISIBLE:
//     a bare call matched no fire tail at all, so they never even reached the refusal census.
// A hook name declared twice against DIFFERENT procedures is AMBIGUOUS and refuses rather than picking one.
// A receiver arriving as a parameter, a cross-module binding, a hook re-exported under a second name, and a
// destructured binding that ESCAPES its file (passed as an argument or a prop, stored, returned, exported —
// a fire site elsewhere could pass any payload) are OUT of both levels and come back with their reason — a
// consumer that drops those silently is reporting a clean it never measured.
import type { BindingElement, CallExpression, Identifier, Node, SourceFile, VariableDeclaration } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";

/** The `operation` half of a `duplicate-action-doors` reviewed-grant identity: the licensed act, carrying
 *  the exact door SET the ruling names. It lives beside the door grammar because THREE readers must spell it
 *  identically or a ruling silently stops matching — the policy that emits it
 *  (`verify/gates/duplicate-action-doors.ts`), the rulings that are granted against it
 *  (`_shared/action-door-rulings.ts`), and the lens that renders it (`ast/ops/subset-callers.ts`). */
const DOOR_SET_OPERATION_PREFIX = "duplicate-action-door-set:";

/** The operation string for one pair's door set. Callers hand it PATH-SORTED; the order is part of the
 *  identity, because two spellings of one set would be two grants for one ruling. */
export function doorSetOperation(doors: readonly string[]): string {
  return `${DOOR_SET_OPERATION_PREFIX}${doors.join(", ")}`;
}

/** The two TanStack Query spellings a tRPC mutation door takes in this client. */
const MUTATION_MEMBERS = new Set(["mutationOptions", "useMutation"]);
/** The ONE mutation factory (packages/client/src/data/create-entity-mutation.ts). */
const MUTATION_FACTORY = "createEntityMutation";
/** The members a door FIRES through — the tails that name no verb. */
export const MUTATION_FIRE_MEMBERS: ReadonlySet<string> = new Set(["mutate", "mutateAsync"]);
/** The tRPC proxy receiver every creation site chains off (the client's one spelling, factory param included). */
const TRPC_PREFIX = "trpc.";

/** Every `trpc.<path>.mutationOptions()` / `.useMutation()` under `scope`, as its procedure path
 *  (`chat.generate`). `scope` is a SourceFile for a whole-file census, or one `createEntityMutation(…)`
 *  call for the factory arm — descendants only, so the node itself is never re-read. */
export function mutationProcedures(scope: Node): readonly string[] {
  const out: string[] = [];
  for (const call of scope.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const procedure = mutationProcedureOf(call);
    if (procedure !== undefined) {
      out.push(procedure);
    }
  }
  return out;
}

/** The procedure ONE call expression creates a door for, or undefined when it is not a creation site at all.
 *  THE SINGLE-NODE DOOR: `mutationProcedures` above is this predicate applied over a scope's descendants, and
 *  a kind-indexed visitor (the `action-door-census` fact, which needs the NODE a finding anchors on) applies
 *  it to the call it was delivered. Two spellings of "is this a door" is exactly the divergence this module
 *  exists to prevent, so there is one and both doors are it. */
export function mutationProcedureOf(call: CallExpression): string | undefined {
  const member = call.getExpression();
  const isCreationSite = TsNode.isPropertyAccessExpression(member) && MUTATION_MEMBERS.has(member.getName());
  const path = isCreationSite ? member.getExpression().getText() : "";
  return path.startsWith(TRPC_PREFIX) ? path.slice(TRPC_PREFIX.length) : undefined;
}

/** A hook name that resolves two ways — refused rather than guessed. */
export const AMBIGUOUS = "ambiguous";

/** One `createEntityMutation` hook: the binding name and the procedure its `options` arm names. */
export interface MutationFactoryHook {
  readonly name: string;
  readonly procedure: string;
}

/** The corpus-wide factory-hook index. `size` is the BLINDNESS DENOMINATOR — a zero on a real corpus means
 *  the client-door arm never ran (a factory rename, a corpus that excludes the client), never "no doors". */
export interface MutationFactoryIndex {
  /** hook name → its procedure, or {@link AMBIGUOUS} when two declarations of that name name different verbs. */
  readonly byName: ReadonlyMap<string, MutationFactoryHook | typeof AMBIGUOUS>;
  readonly size: number;
}

/** `const useX = createEntityMutation<…>({ options: (trpc) => trpc.a.b.mutationOptions(), … })` — the
 *  declaration's procedure, or null when this declaration is not a factory hook (or names no procedure). */
function factoryProcedureOf(decl: VariableDeclaration): string | null {
  const init = decl.getInitializer();
  if (!TsNode.isCallExpression(init)) {
    return null;
  }
  if (init.getExpression().getText() !== MUTATION_FACTORY) {
    return null;
  }
  return mutationProcedures(init)[0] ?? null;
}

/** Index every `createEntityMutation` hook in `files` by its binding name. */
export function indexMutationFactories(files: readonly SourceFile[]): MutationFactoryIndex {
  const byName = new Map<string, MutationFactoryHook | typeof AMBIGUOUS>();
  for (const sf of files) {
    for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      const procedure = factoryProcedureOf(decl);
      if (procedure === null) {
        continue;
      }
      const name = decl.getName();
      const prior = byName.get(name);
      if (prior === undefined) {
        byName.set(name, { name, procedure });
        continue;
      }
      // A second declaration of the same name naming the SAME verb changes no answer; a different verb does.
      if (prior === AMBIGUOUS || prior.procedure !== procedure) {
        byName.set(name, AMBIGUOUS);
      }
    }
  }
  return { byName, size: byName.size };
}

/** A resolved fire site: the verb it fires and the chain that proved it (printed so a reader can audit the
 *  hop instead of trusting it). */
export interface ResolvedDoor {
  readonly procedure: string;
  readonly chain: string;
}

/** A fire site this resolver refused, with the reason — never dropped. */
export interface UnresolvedDoor {
  readonly reason: string;
}

/** Same-file variable declarations by name, memoized per SourceFile (a fire-site file is walked once, not
 *  once per fire site — a room with six mutations would otherwise re-walk its own AST six times). */
const DECLS_BY_FILE = new WeakMap<SourceFile, ReadonlyMap<string, readonly VariableDeclaration[]>>();

function declsNamed(sf: SourceFile, name: string): readonly VariableDeclaration[] {
  const cached = DECLS_BY_FILE.get(sf);
  if (cached !== undefined) {
    return cached.get(name) ?? [];
  }
  const built = new Map<string, VariableDeclaration[]>();
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const list = built.get(decl.getName()) ?? [];
    list.push(decl);
    built.set(decl.getName(), list);
  }
  DECLS_BY_FILE.set(sf, built);
  return built.get(name) ?? [];
}

/** The hook-call arm: `useX({ trpc, invalidation })` → the verb `useX` was built against. */
function doorOfHookCall(call: CallExpression, index: MutationFactoryIndex, chainHead: string): ResolvedDoor | UnresolvedDoor {
  const hookName = call.getExpression().getText();
  const hook = index.byName.get(hookName);
  if (hook === undefined) {
    return {
      reason: `receiver comes from \`${hookName}(…)\`, which is not a \`${MUTATION_FACTORY}\` hook this lens could index (resolution is LEVEL 1: a same-file receiver bound to a corpus-indexed factory hook)`,
    };
  }
  if (hook === AMBIGUOUS) {
    return { reason: `\`${hookName}\` is declared more than once against DIFFERENT procedures — refused rather than guessing which door this is` };
  }
  return { procedure: hook.procedure, chain: `${chainHead}${hookName} → trpc.${hook.procedure}` };
}

/**
 * The verb a `<receiver>.mutate(…)` / `.mutateAsync(…)` fire site fires.
 *
 * Returns `null` when `call` is not a fire site at all (the caller's cheap discriminator), a
 * {@link ResolvedDoor} at level 1, and an {@link UnresolvedDoor} — with the reason — for a fire site this
 * resolver refuses. The refusal arm is the whole point: a fire site whose verb is unknown could be a door
 * on ANY verb, so a consumer must count it as unjudged rather than as agreement.
 */
export function resolveFiredDoor(call: CallExpression, index: MutationFactoryIndex): ResolvedDoor | UnresolvedDoor | null {
  const expr = call.getExpression();
  if (!TsNode.isPropertyAccessExpression(expr)) {
    return null;
  }
  if (!MUTATION_FIRE_MEMBERS.has(expr.getName())) {
    return null;
  }
  const receiver = expr.getExpression();
  // `useX({ … }).mutate(…)` — the inline shape, no binding to follow.
  if (TsNode.isCallExpression(receiver)) {
    return doorOfHookCall(receiver, index, "");
  }
  if (!TsNode.isIdentifier(receiver)) {
    return { reason: `receiver is a ${receiver.getKindName()}, not an identifier bound to a ${MUTATION_FACTORY} hook (level-1 resolution)` };
  }
  const name = receiver.getText();
  const init = declsNamed(call.getSourceFile(), name)
    .map((d) => d.getInitializer())
    .find((i) => TsNode.isCallExpression(i));
  if (!TsNode.isCallExpression(init)) {
    return {
      reason: `receiver \`${name}\` has no same-file declaration initialized by a hook call — a parameter, a cross-module binding, or a receiver itself destructured from something unfollowable is outside level-1 resolution`,
    };
  }
  return doorOfHookCall(init, index, `\`${name}\` ← `);
}

/** A hook CALL reached from a destructure's initializer, plus the hop text that proves how (empty when the
 *  initializer IS the call). One identifier hop is followed — `const i = useX(); const { mutateAsync } = i;`
 *  is the tree's live spelling — and anything further stays unfollowed rather than guessed. */
function hookCallOf(expr: Node | undefined, sf: SourceFile): { readonly call: CallExpression; readonly hop: string } | null {
  if (expr === undefined) {
    return null;
  }
  if (TsNode.isCallExpression(expr)) {
    return { call: expr, hop: "" };
  }
  if (!TsNode.isIdentifier(expr)) {
    return null;
  }
  const name = expr.getText();
  const init = declsNamed(sf, name)
    .map((d) => d.getInitializer())
    .find((i) => TsNode.isCallExpression(i));
  return TsNode.isCallExpression(init) ? { call: init, hop: `\`${name}\` ← ` } : null;
}

/** ONE reference of a destructured fire binding that leaves this file's sight. The binding's DOOR is known
 *  (or refused, with its reason); the PAYLOAD is not, because whatever fires it lives somewhere this
 *  syntactic lens cannot read — which makes it an unjudged door, never an agreeing one. */
export interface EscapedFire {
  readonly node: Identifier;
  readonly name: string;
  readonly door: ResolvedDoor | UnresolvedDoor;
  readonly reason: string;
}

/** The LEVEL-2 destructures in one file: every local binding that names a fire member, mapped to the door it
 *  fires, plus the references of those bindings that ESCAPE the file. */
export interface DestructuredFires {
  /** local binding name → the door a bare `name(…)` call fires (or the refusal, with its reason). */
  readonly byName: ReadonlyMap<string, ResolvedDoor | UnresolvedDoor>;
  readonly escapes: readonly EscapedFire[];
}

const NO_DESTRUCTURED_FIRES: DestructuredFires = { byName: new Map(), escapes: [] };

/** The React hook-name convention, the one shape whose LAST argument is a dependency list. */
const HOOK_NAME = /^use[A-Z]/;

/** The fire member a binding element destructures (`{ mutate }` → `mutate`; `{ mutate: fire }` → `mutate`),
 *  or null when this element names no fire member. A COMPUTED property name (`{ [k]: fire }`) names nothing
 *  statically, so it falls out here rather than resolving to a door nobody can prove. */
function fireMemberOf(element: BindingElement): string | null {
  const property = element.getPropertyNameNode();
  const member = property === undefined ? element.getName() : property.getText();
  return MUTATION_FIRE_MEMBERS.has(member) ? member : null;
}

/** A dependency-list reference is NOT an escape: React compares the identity of a hook's LAST-argument array
 *  and never calls its elements, so counting it would mark every honest destructured door unjudged and train
 *  readers to skip the census. Anything else that holds the binding — an argument, a prop, an object, a
 *  return — genuinely can fire it out of sight. */
function isHookDependency(ref: Node): boolean {
  const array = ref.getParent();
  if (!TsNode.isArrayLiteralExpression(array)) {
    return false;
  }
  const call = array.getParent();
  if (!TsNode.isCallExpression(call)) {
    return false;
  }
  if (call.getArguments().at(-1)?.getStart() !== array.getStart()) {
    return false;
  }
  return HOOK_NAME.test(call.getExpression().getText().split(".").at(-1) ?? "");
}

/** The declaration parents whose NAME slot spells an identifier that is a NEW binding, not a reference to the
 *  destructured one — a parameter called `mutateAsync`, an interface member, a re-declaration. Reading those
 *  as escapes was a measured false positive (`endpoint-inspector-dialog.tsx:31`, a helper's parameter name).
 *  `ExportSpecifier` is deliberately ABSENT: `export { mutate }` genuinely is an escape. */
const DECLARATION_NAME_PARENTS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.Parameter,
  SyntaxKind.PropertySignature,
  SyntaxKind.PropertyDeclaration,
  SyntaxKind.MethodSignature,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.TypeParameter,
  SyntaxKind.EnumMember,
  SyntaxKind.ImportSpecifier,
  SyntaxKind.NamespaceImport,
  SyntaxKind.VariableDeclaration,
  SyntaxKind.PropertyAssignment,
  SyntaxKind.LabeledStatement,
]);

/** An identifier that names a declaration or sits in a TYPE — neither is a use of the value, so neither can
 *  fire the door. `{ fire: mutate }` still escapes: only the NAME slot (the first identifier child) is skipped. */
function isDeclarationNameOrType(ref: Identifier): boolean {
  const parent = ref.getParent();
  if (TsNode.isTypeNode(parent)) {
    return true;
  }
  return DECLARATION_NAME_PARENTS.has(parent.getKind()) && parent.getFirstChildByKind(SyntaxKind.Identifier)?.getStart() === ref.getStart();
}

/** HOW a reference escapes — named, because "unjudged" without the shape is a number a reader cannot act on. */
function escapeReason(ref: Identifier): string {
  const parent = ref.getParent();
  if (TsNode.isCallExpression(parent)) {
    return `passed as an ARGUMENT to \`${parent.getExpression().getText()}(…)\``;
  }
  if (TsNode.isJsxExpression(parent)) {
    return "passed as a JSX PROP";
  }
  if (TsNode.isPropertyAssignment(parent) || TsNode.isShorthandPropertyAssignment(parent)) {
    return "stored in an OBJECT literal";
  }
  if (TsNode.isArrayLiteralExpression(parent)) {
    return "stored in an ARRAY literal";
  }
  if (TsNode.isReturnStatement(parent)) {
    return "RETURNED from its scope";
  }
  if (TsNode.isExportSpecifier(parent)) {
    return "RE-EXPORTED";
  }
  if (TsNode.isVariableDeclaration(parent)) {
    return "re-bound to another name";
  }
  return `held by a ${parent.getKindName()}`;
}

/** The door ONE binding element fires, resolved through the same factory index a receiver uses — or null when
 *  the element names no fire member at all (every other key a mutation result is destructured for). */
function doorOfBinding(element: BindingElement, decl: VariableDeclaration, sf: SourceFile, index: MutationFactoryIndex): ResolvedDoor | UnresolvedDoor | null {
  const member = fireMemberOf(element);
  if (member === null) {
    return null;
  }
  const name = element.getName();
  const source = hookCallOf(decl.getInitializer(), sf);
  if (source === null) {
    return {
      reason: `destructured \`{ ${member} }\` binding \`${name}\` has no initializer this lens can follow to a ${MUTATION_FACTORY} hook (level 2 follows a hook CALL, or ONE same-file identifier hop to one)`,
    };
  }
  return doorOfHookCall(source.call, index, `\`${name}\` ← { ${member} } ← ${source.hop}`);
}

/** Every fire-member destructure in `sf`, by its LOCAL binding name (the name a bare fire call spells). */
function fireBindingsOf(sf: SourceFile, index: MutationFactoryIndex): Map<string, ResolvedDoor | UnresolvedDoor> {
  const byName = new Map<string, ResolvedDoor | UnresolvedDoor>();
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const pattern = decl.getNameNode();
    if (!TsNode.isObjectBindingPattern(pattern)) {
      continue;
    }
    for (const element of pattern.getElements()) {
      const door = doorOfBinding(element, decl, sf, index);
      if (door !== null) {
        byName.set(element.getName(), door);
      }
    }
  }
  return byName;
}

/** A reference of a fire binding that is neither the declaration nor a bare FIRE call — the value left this
 *  file's sight, so whatever fires it passes a payload nothing here can read. */
function escapesOf(sf: SourceFile, byName: ReadonlyMap<string, ResolvedDoor | UnresolvedDoor>): readonly EscapedFire[] {
  const escapes: EscapedFire[] = [];
  for (const ref of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const door = byName.get(ref.getText());
    if (door === undefined) {
      continue;
    }
    const parent = ref.getParent();
    // A bare `name(…)` fire is a SITE the consumer judges, and the binding element is the declaration itself.
    const isFireOrDeclaration = TsNode.isBindingElement(parent) || (TsNode.isCallExpression(parent) && parent.getExpression().getStart() === ref.getStart());
    if (isFireOrDeclaration || isDeclarationNameOrType(ref) || isHookDependency(ref)) {
      continue;
    }
    escapes.push({ node: ref, name: ref.getText(), door, reason: escapeReason(ref) });
  }
  return escapes;
}

/** Every fire-member destructure in `sf`, resolved through `index` (LEVEL 2), with its escapes.
 *
 * DECLARED LIMIT — the reference sweep is SAME-FILE and by NAME (the corpus carries no type graph), so a
 * nested re-declaration SHADOWING the binding reads as the same binding: it can add an escape, and it can
 * add a fire site that is really the shadow's. The live shape it was measured against passes the door itself
 * down (`runProbe(mutateAsync, …)` takes a parameter of the same name), where attributing the call to the
 * door is CORRECT; a genuinely unrelated shadow would over-report, which is the direction this lens errs in
 * everywhere else too — over-reporting is auditable, silence is not. */
export function destructuredFires(sf: SourceFile, index: MutationFactoryIndex): DestructuredFires {
  // Nothing can destructure a fire member without spelling one — a cheap gate against walking every file.
  if (![...MUTATION_FIRE_MEMBERS].some((member) => sf.getFullText().includes(member))) {
    return NO_DESTRUCTURED_FIRES;
  }
  const byName = fireBindingsOf(sf, index);
  return byName.size === 0 ? NO_DESTRUCTURED_FIRES : { byName, escapes: escapesOf(sf, byName) };
}

/** `chat.generate` answers to `generate` (the bare member) and to its full path — the two spellings a
 *  reader names a verb by. */
export function procedureMatches(procedure: string, symbol: string): boolean {
  return procedure === symbol || procedure.endsWith(`.${symbol}`);
}
