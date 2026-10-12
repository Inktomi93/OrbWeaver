// Gate: trpc-input-declarations — a tRPC query, mutation or subscription whose handler reads `input` carries a
// zod `.input(<schema>)` on its builder chain, and that schema is not a pass-anything spelling (`LOOSE_CALLEES`).
// The chain is followed through builder variables (`const chatProcedure = authedProcedure.input(…)`), so a
// shared base procedure's parser counts. DECLARED LIMIT: a handler passed by reference is read from its declaration.
// FAMILY: singleton — `trpc-output-declarations` walks the mounted AppRouter record for a different relation and
// keeps its readers module-private; this policy reads authored builder chains and shares no reader with it.
import type { CallExpression, Node } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { resolveStableExpression, staticMemberAccess } from "../../floor/code-facts/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { MEMBER_ACCESS_KINDS, readsMemberNamed } from "../lib/symbol-reference.ts";

const TERMINALS: ReadonlySet<string> = new Set(["query", "mutation", "subscription"]);
const INPUT_MEMBER: ReadonlySet<string> = new Set(["input"]);
const LOOSE_CALLEES: ReadonlySet<string> = new Set(["z.any", "z.unknown", "z.looseObject"]);
const PASSTHROUGH = "passthrough";
/** Builder variables are short chains; a longer walk means a cycle through re-assignment. */
const MAX_CHAIN_HOPS = 32;

const MESSAGE =
  "a tRPC procedure reads `input` without a zod `.input(<schema>)` on its builder chain, or declares a pass-anything " +
  "parser (`z.any()`, `z.unknown()`, `z.looseObject`, `.passthrough()`). Every procedure input is parsed at the " +
  "transport boundary (docs/law/Tier-4-Transport.md).";
const FIX = "declare the procedure's contract input schema with `.input(schema)` on its own chain or on the shared builder it extends.";

/** The function a terminal call runs: an inline function, or the declaration a reference names. */
function handlerOf(arg: Node | undefined): Node | undefined {
  if (arg === undefined || N.isArrowFunction(arg) || N.isFunctionExpression(arg)) {
    return arg;
  }
  const held = resolveStableExpression(arg);
  const value = held.kind === "resolved" ? held.value : undefined;
  return value !== undefined && (N.isArrowFunction(value) || N.isFunctionExpression(value) || N.isFunctionDeclaration(value)) ? value : undefined;
}

/** Does the handler read `input`: a destructured `input` binding, or `.input` read off its first parameter
 *  (`readers` holds every function whose first parameter has `.input` read off it, from the visitor). */
function readsInput(handler: Node, readers: ReadonlySet<Node>): boolean {
  if (!(N.isArrowFunction(handler) || N.isFunctionExpression(handler) || N.isFunctionDeclaration(handler))) {
    return false;
  }
  const param = handler.getParameters()[0]?.getNameNode();
  if (param === undefined) {
    return false;
  }
  if (N.isObjectBindingPattern(param)) {
    return param.getElements().some((element) => (element.getPropertyNameNode()?.getText() ?? element.getName()) === "input");
  }
  return readers.has(handler);
}

/** The function whose first parameter this `<param>.input` (or `<param>["input"]`) read names, if any. */
function inputReader(access: Node): Node | undefined {
  const read = readsMemberNamed(access, INPUT_MEMBER);
  if (read === undefined) {
    return;
  }
  const receiver = read.receiver.getText();
  const fn = access.getFirstAncestor((ancestor) => N.isArrowFunction(ancestor) || N.isFunctionExpression(ancestor) || N.isFunctionDeclaration(ancestor));
  const first = fn !== undefined && (N.isArrowFunction(fn) || N.isFunctionExpression(fn) || N.isFunctionDeclaration(fn)) ? fn.getParameters()[0] : undefined;
  return first !== undefined && N.isIdentifier(first.getNameNode()) && first.getName() === receiver ? fn : undefined;
}

/** One step down a builder chain: the receiver of a call, a builder variable's initializer, or an unwrapped expression. */
function chainStep(current: Node): Node | undefined {
  if (N.isCallExpression(current)) {
    return staticMemberAccess(current.getExpression())?.receiver;
  }
  if (N.isIdentifier(current) || staticMemberAccess(current) !== undefined) {
    const held = resolveStableExpression(current);
    if (held.kind === "resolved") {
      return held.value === current ? undefined : held.value;
    }
    // An opaque chain root (`declare const authed`) leaves the builder variable on the trace; its initializer is the chain.
    const builder = held.trace.declarations.find((declaration) => N.isVariableDeclaration(declaration) && declaration.getInitializer() !== undefined);
    return builder !== undefined && N.isVariableDeclaration(builder) ? builder.getInitializer() : undefined;
  }
  return N.isParenthesizedExpression(current) || N.isAsExpression(current) || N.isSatisfiesExpression(current) ? current.getExpression() : undefined;
}

/** The `.input(…)` arguments on a builder chain, following builder variables to their initializers. */
function inputParsers(receiver: Node): readonly Node[] {
  const parsers: Node[] = [];
  let current: Node | undefined = receiver;
  for (let hop = 0; current !== undefined && hop < MAX_CHAIN_HOPS; hop++) {
    if (N.isCallExpression(current) && readsMemberNamed(current.getExpression(), INPUT_MEMBER) !== undefined) {
      parsers.push(...current.getArguments());
    }
    current = chainStep(current);
  }
  return parsers;
}

/** A parser that admits anything: the whole argument is `z.any()`, `z.unknown()`, `z.looseObject(…)` or ends in `.passthrough()`. */
function isLooseParser(parser: Node): boolean {
  if (!N.isCallExpression(parser)) {
    return false;
  }
  const callee = parser.getExpression();
  const read = staticMemberAccess(callee);
  const spelled = read === undefined ? callee.getText() : `${read.receiver.getText()}.${read.name}`;
  return LOOSE_CALLEES.has(spelled) || read?.name === PASSTHROUGH;
}

export const gate = defineGate({
  id: "trpc-input-declarations",
  family: "trpc-input-declarations",
  authority: "hard",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/transport/trpc/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const terminals: CallExpression[] = [];
    const readers = new Set<Node>();
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            if (N.isCallExpression(node) && readsMemberNamed(node.getExpression(), TERMINALS) !== undefined) {
              terminals.push(node);
            }
          },
        },
        {
          kinds: MEMBER_ACCESS_KINDS,
          visit: (node): void => {
            const reader = inputReader(node);
            if (reader !== undefined) {
              readers.add(reader);
            }
          },
        },
      ],
      evaluate: () => {
        for (const call of terminals) {
          const terminal = staticMemberAccess(call.getExpression());
          const handler = handlerOf(call.getArguments()[0]);
          if (terminal === undefined || handler === undefined || !readsInput(handler, readers)) {
            continue;
          }
          const parsers = inputParsers(terminal.receiver);
          const loose = parsers.find(isLooseParser);
          if (parsers.length === 0 || loose !== undefined) {
            const name = terminal.nameNode;
            const detail = loose === undefined ? "no `.input()` on the chain" : `loose parser \`${loose.getText()}\``;
            ctx.report.node(name, { token: name.getText(), offset: 0, message: `Found: ${detail}. ${MESSAGE}` });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/transport/trpc/routers/chat.ts": "declare const authed: any;\nexport const read = authed.query(({ input }) => input);\n" },
      expect: { count: 1, token: "query", messageIncludes: "no `.input()` on the chain" },
      why: "the founding shape: a destructured `input` with no parser anywhere on the chain",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/routers/chat.ts": "declare const authed: any;\nexport const write = authed.mutation((opts) => opts.input.id);\n",
      },
      expect: { count: 1, token: "mutation" },
      why: "the non-destructured spelling: `.input` read off the handler's first parameter",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/routers/chat.ts":
          "declare const authed: any;\ndeclare const z: any;\nexport const a = authed.input(z.unknown()).query(({ input }) => input);\nexport const b = authed.input(schema.passthrough()).mutation(({ input }) => input);\ndeclare const schema: any;\n",
      },
      expect: { count: 2, messageIncludes: "loose parser" },
      why: "pass-anything parsers count as no parser: `z.unknown()` and `.passthrough()`",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/routers/chat.ts":
          'declare const authed: any;\nexport const read = authed["query"](({ input }) => input);\nexport const write = authed["mutation"]((opts) => opts["input"].id);\n',
      },
      expect: { count: 2, messageIncludes: "no `.input()` on the chain" },
      why: "the bracket spelling of the terminal and of the `input` read off the handler's first parameter",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/routers/chat.ts":
          'declare const authed: any;\ndeclare const z: any;\ndeclare const schema: any;\nexport const a = authed["input"](z["unknown"]()).query(({ input }) => input);\nexport const b = authed["input"](schema["passthrough"]()).mutation(({ input }) => input);\n',
      },
      expect: { count: 2, messageIncludes: "loose parser" },
      why: "the bracket spelling of the `.input()` call, of a pass-anything callee and of `.passthrough()`",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/routers/chat.ts":
          "declare const authed: any;\ndeclare const schema: any;\nconst chatProcedure = authed.input(schema);\nexport const own = authed.input(schema).query(({ input }) => input);\nexport const shared = chatProcedure.use(() => 1).query(({ input }) => input);\nexport const nullary = authed.query(({ ctx }) => ctx);\n" +
          "declare const z: any;\nexport const nested = authed.input(z.object({ patch: z.record(z.string(), z.unknown()) })).mutation(({ input }) => input);\n",
      },
      why: "a parser on the procedure's own chain, a parser on a shared builder variable the chain extends, a nullary handler that never reads input, and an object parser holding an open record field: only a WHOLE pass-anything parser is loose",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/routers/anchor.ts": "export const anchor = 1;\n",
        "packages/server/src/domain/chat/verbs/read.ts": "declare const authed: any;\nexport const read = authed.query(({ input }) => input);\n",
      },
      why: "the population: only the tRPC transport tree declares procedures",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/transport/trpc/routers/chat.ts":
          'declare const authed: any;\ndeclare const schema: any;\nexport const a = authed["input"](schema)["query"](({ input }) => input);\nexport const b = authed["input"](schema)["mutation"]((opts) => opts["input"].id);\nexport const c = authed["query"](({ ctx }) => ctx);\n',
      },
      why: "the bracket spelling with a parser on the chain, and a bracket-spelled handler that never reads input, stay silent",
    },
  ],
});
