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
// DECLARED LIMIT — fire→verb resolution is LEVEL 1 and purely SYNTACTIC (the lens runs on the no-type-graph
// corpus, so there is no import resolution to lean on): a receiver identifier resolves through a same-file
// variable declaration whose initializer CALLS a factory hook, and that hook is looked up by NAME in a
// corpus-wide index of `createEntityMutation` declarations. A hook name declared twice against DIFFERENT
// procedures is AMBIGUOUS and refuses rather than picking one. A destructured `const { mutate } = useX()`,
// a receiver arriving as a parameter, or a hook re-exported under a second name are OUT of level 1 and come
// back with their reason — a consumer that drops those silently is reporting a clean it never measured.
import type { CallExpression, Node, SourceFile, VariableDeclaration } from "ts-morph";
import { SyntaxKind, Node as TsNode } from "ts-morph";

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
    const member = call.getExpression();
    if (!TsNode.isPropertyAccessExpression(member)) {
      continue;
    }
    if (!MUTATION_MEMBERS.has(member.getName())) {
      continue;
    }
    const path = member.getExpression().getText();
    if (path.startsWith(TRPC_PREFIX)) {
      out.push(path.slice(TRPC_PREFIX.length));
    }
  }
  return out;
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
      reason: `receiver \`${name}\` has no same-file declaration initialized by a hook call — a destructured \`{ mutate }\`, a parameter, or a cross-module binding is outside level-1 resolution`,
    };
  }
  return doorOfHookCall(init, index, `\`${name}\` ← `);
}

/** `chat.generate` answers to `generate` (the bare member) and to its full path — the two spellings a
 *  reader names a verb by. */
export function procedureMatches(procedure: string, symbol: string): boolean {
  return procedure === symbol || procedure.endsWith(`.${symbol}`);
}
