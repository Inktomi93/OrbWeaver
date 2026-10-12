// Gate: wire-json-parsed-at-consumer — a client response body is parsed through its contract schema, never cast.
// ts-reset types `Response.json()` as `unknown`, so an `as`/`satisfies` over the body is the one way to skip the parse:
// `<x>.json()` awaited, parenthesised, through an `as unknown` step, typed `Promise<T>`, returned from a `.then` callback,
// or held one hop in a local `const`; and `JSON.parse` over a `<x>.text()` body. A target of `unknown`, or a literal of
// only `unknown` members, is still unparsed data and passes. Subject: the `json` (or `parse`) name. Population: `@client`.
// DECLARED LIMIT: syntax tier, so the global `JSON` and the local `const` are matched lexically. FAMILY: singleton.
import type { Node } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const JSON_METHOD = "json";
const TEXT_METHOD = "text";
const THEN_METHOD = "then";
const JSON_GLOBAL = "JSON";
const PARSE_METHOD = "parse";
const UNKNOWN = "unknown";

const MESSAGE =
  "a response body is cast instead of parsed — `.json()` returns `unknown` and the cast trusts a shape the server " +
  "can change without the client compiling differently. Parse it with the route's contract schema " +
  "(`schema.parse(await res.json())`). See Spine-TypeScript-and-Patterns.md §7.4.";
const FIX =
  "mint or import the route's zod schema in @orb/contracts and parse the body with it. A baselined site is waived " +
  "with `@orb-waive wire-json-parsed-at-consumer(json): <reason naming its burn-down item>` on the line above; the " +
  "position is the `json` method name, or `parse` for `JSON.parse(await res.text())`.";

// Through what hands the body on unchanged: parentheses, `await`, and an `as unknown` / `satisfies unknown` step.
function unwrapBody(node: Node): Node {
  let current = node;
  for (;;) {
    if (N.isParenthesizedExpression(current) || N.isAwaitExpression(current)) {
      current = current.getExpression();
    } else if ((N.isAsExpression(current) || N.isSatisfiesExpression(current)) && keepsUnknown(current.getTypeNode())) {
      current = current.getExpression();
    } else {
      return current;
    }
  }
}

// The initializer of the nearest `const` an identifier names, declared before it in an enclosing block; a parameter of
// the same name in between shadows it. One lexical hop, so `const body = await res.json(); return body as T` is read.
function localConstInitializer(identifier: Node): Node | undefined {
  const name = identifier.getText();
  const shadows = (scope: Node): boolean =>
    (N.isArrowFunction(scope) || N.isFunctionExpression(scope) || N.isFunctionDeclaration(scope)) && scope.getParameters().some((p) => p.getName() === name);
  const declaredIn = (scope: Node): Node | undefined =>
    N.isBlock(scope) || N.isSourceFile(scope)
      ? scope
          .getStatements()
          .filter((statement) => N.isVariableStatement(statement) && statement.getEnd() <= identifier.getStart())
          .flatMap((statement) => (N.isVariableStatement(statement) && statement.getDeclarationKind() === "const" ? statement.getDeclarations() : []))
          .findLast((candidate) => candidate.getName() === name)
      : undefined;
  let found: Node | undefined;
  for (let scope = identifier.getParent(); scope !== undefined && found === undefined && !shadows(scope); scope = scope.getParent()) {
    found = declaredIn(scope);
  }
  return found !== undefined && N.isVariableDeclaration(found) ? found.getInitializer() : undefined;
}

// The body expression a cast operand or a callback result stands for: unwrapped, and through one local `const`.
function bodyExpression(node: Node): Node {
  const current = unwrapBody(node);
  const initializer = N.isIdentifier(current) ? localConstInitializer(current) : undefined;
  return initializer === undefined ? current : unwrapBody(initializer);
}

/** `<x>.<method>()` with no arguments: the method's name node. */
function bodyRead(node: Node, method: string): Node | undefined {
  if (!N.isCallExpression(node)) {
    return;
  }
  const callee = node.getExpression();
  return N.isPropertyAccessExpression(callee) && callee.getName() === method && node.getArguments().length === 0 ? callee.getNameNode() : undefined;
}

/** The value a `.then` callback resolves to: its expression body, or its body's final `return` expression. */
function callbackResult(callback: Node | undefined): Node | undefined {
  if (callback === undefined || !(N.isArrowFunction(callback) || N.isFunctionExpression(callback))) {
    return;
  }
  const body = callback.getBody();
  if (!N.isBlock(body)) {
    return body;
  }
  const last = body.getStatements().at(-1);
  return last !== undefined && N.isReturnStatement(last) ? last.getExpression() : undefined;
}

/** The body read under a cast operand: `.json()`, a `.then` callback returning `.json()`, or `JSON.parse(.text())`. */
function bodyReadUnder(operand: Node): Node | undefined {
  const current = bodyExpression(operand);
  const json = bodyRead(current, JSON_METHOD);
  if (json !== undefined || !N.isCallExpression(current)) {
    return json;
  }
  const callee = current.getExpression();
  if (!N.isPropertyAccessExpression(callee)) {
    return;
  }
  const [first] = current.getArguments();
  if (callee.getName() === THEN_METHOD) {
    const result = callbackResult(first);
    return result === undefined ? undefined : bodyRead(bodyExpression(result), JSON_METHOD);
  }
  const parsesText = callee.getName() === PARSE_METHOD && callee.getExpression().getText() === JSON_GLOBAL && first !== undefined;
  return parsesText && bodyRead(bodyExpression(first), TEXT_METHOD) !== undefined ? callee.getNameNode() : undefined;
}

/** `unknown`, `Promise<unknown>`, or a type literal whose every member is (recursively) `unknown`: the body stays unparsed data. */
function keepsUnknown(target: Node | undefined): boolean {
  if (target === undefined) {
    return false;
  }
  if (target.getText() === UNKNOWN) {
    return true;
  }
  if (N.isTypeReference(target)) {
    const [argument] = target.getTypeArguments();
    return target.getTypeArguments().length === 1 && keepsUnknown(argument);
  }
  return N.isTypeLiteral(target) && target.getMembers().every((member) => N.isPropertySignature(member) && keepsUnknown(member.getTypeNode()));
}

export const gate = defineGate({
  id: "wire-json-parsed-at-consumer",
  family: "wire-json-parsed-at-consumer",
  authority: "ordinary",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.AsExpression, SyntaxKind.SatisfiesExpression],
        visit: (node): void => {
          if (!(N.isAsExpression(node) || N.isSatisfiesExpression(node)) || keepsUnknown(node.getTypeNode())) {
            return;
          }
          const name = bodyReadUnder(node.getExpression());
          if (name !== undefined) {
            ctx.report.node(name, { token: name.getText(), offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/client/src/data/import-chats.ts":
          "interface ChatImportResult { readonly chatId: string }\nexport async function read(res: Response): Promise<ChatImportResult> {\n  return (await res.json()) as ChatImportResult;\n}\n",
      },
      expect: { count: 1, token: "json" },
      why: "the founding cast: an awaited body cast to a hand-spelled response shape",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/data/auth-config.ts":
          "interface AuthConfig { readonly mode: string }\nexport const load = (res: Response): Promise<AuthConfig> => res.json() as Promise<AuthConfig>;\n" +
          "export const peek = async (res: Response): Promise<{ readonly error?: string }> => (await res.json()) satisfies { readonly error?: string } as never;\n",
      },
      expect: { count: 2, token: "json" },
      why: "the unawaited `Promise<T>` cast and a `satisfies` over the body; a typed error envelope is still a cast shape",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/data/chained.ts":
          "interface Row { readonly id: string }\n" +
          "export const load = (u: string): Promise<Row> => fetch(u).then((r) => r.json()) as Promise<Row>;\n" +
          "export const loadBlock = (u: string): Promise<Row> => fetch(u).then(function (r) {\n  return r.json();\n}) as Promise<Row>;\n",
      },
      expect: { count: 2, token: "json" },
      why: "a `.then` callback returning the body, as an expression body and as a single `return`, is the same unparsed read",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/data/texted.ts":
          "interface Row { readonly id: string }\nexport const load = async (res: Response): Promise<Row> => JSON.parse(await res.text()) as Row;\n",
      },
      expect: { count: 1, token: "parse" },
      why: "`JSON.parse` over the `.text()` body skips the parse the same way; the position is `parse`",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/data/stepped.ts":
          "interface Row { readonly id: string }\n" +
          "export async function doubled(res: Response): Promise<Row> {\n  return (await res.json()) as unknown as Row;\n}\n" +
          "export async function twoStep(res: Response): Promise<Row> {\n  const body = await res.json();\n  return body as Row;\n}\n" +
          "export const inThen = (u: string): Promise<Row> => fetch(u).then(async (r) => {\n  const b = await r.json();\n  return b;\n}) as Promise<Row>;\n",
      },
      expect: { count: 3, token: "json" },
      why: "an `as unknown` step does not launder the body, and a body held in a local `const` (also inside a `.then` block) is the same read",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/data/x.ts":
          "declare const schema: { parse(value: unknown): { id: string } };\n" +
          "export const parsed = async (res: Response): Promise<{ id: string }> => schema.parse(await res.json());\n" +
          "export const opaque = async (res: Response): Promise<unknown> => (await res.json()) as unknown;\n" +
          "export const open = async (res: Response): Promise<{ readonly error?: unknown }> => (await res.json()) as { readonly error?: unknown; readonly written?: { readonly json?: unknown } };\n" +
          'declare const doc: { json(key: string): unknown };\nexport const other = (): string => doc.json("k") as string;\n' +
          "export const chained = (u: string): Promise<unknown> => fetch(u).then((r) => r.json()) as Promise<unknown>;\n" +
          "export const viaSchema = (u: string): Promise<{ id: string }> => fetch(u).then(async (r) => schema.parse(await r.json()));\n" +
          "declare const stored: string;\nexport const local = (): { id: string } => JSON.parse(stored) as { id: string };\n" +
          "export async function reassigned(res: Response): Promise<{ id: string }> {\n  let body: unknown = await res.json();\n  body = schema.parse(body);\n  return body as { id: string };\n}\n" +
          "const outer = fetch('/x').then((r) => r.json());\nexport const shadow = (outer: unknown): { id: string } => outer as { id: string };\n",
      },
      why: "a local that is reassigned is not followed, and a same-named parameter shadows an outer const — plus the remedy (a schema parse, also inside a `.then`), an `unknown` target (also through `.then`), a literal of only `unknown` members (nested literals included), a `json` method that takes an argument, and `JSON.parse` of a string that is not a `.text()` body",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/data/anchor.ts": "export const anchor = 1;\n",
        "packages/server/src/entry/http/x.ts": "export const read = async (res: Response): Promise<{ id: string }> => (await res.json()) as { id: string };\n",
      },
      why: "the population: the server reads bodies through its route schemas and is outside this policy",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/data/import-chats.ts":
          "interface ChatImportResult { readonly chatId: string }\nexport async function read(res: Response): Promise<ChatImportResult> {\n" +
          "  // @orb-waive wire-json-parsed-at-consumer(json): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "  return (await res.json()) as ChatImportResult;\n}\n",
      },
      why: "POSITIONAL IDENTITY: the position is the `json` method name, built on the founding one-finding row",
    },
  ],
});
