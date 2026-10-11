// Gate: wire-json-parsed-at-consumer — a client `.json()` body is parsed through its contract schema, never cast.
// ts-reset types `Response.json()` as `unknown`, so an `as`/`satisfies` over `<x>.json()` (awaited, parenthesised or
// typed `Promise<T>`) is the one way to skip the parse; a target of `unknown`, or a literal of only `unknown`
// members, is still unparsed data and passes. Subject: the `json` call's own name. Population: `@client`.
// FAMILY: singleton — no other policy reads response bodies; the contract-home rules judge declarations, not reads.
import type { Node } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const JSON_METHOD = "json";
const UNKNOWN = "unknown";

const MESSAGE =
  "a response body is cast instead of parsed — `.json()` returns `unknown` and the cast trusts a shape the server " +
  "can change without the client compiling differently. Parse it with the route's contract schema " +
  "(`schema.parse(await res.json())`). See Spine-TypeScript-and-Patterns.md §7.4.";
const FIX =
  "mint or import the route's zod schema in @orb/contracts and parse the body with it. A baselined site is waived " +
  "with `@orb-waive wire-json-parsed-at-consumer(json): <reason naming its burn-down item>` on the line above; the " +
  "position is the `json` method name.";

/** The `.json()` call under a cast operand, through `await` and parentheses. */
function jsonCallUnder(operand: Node): Node | undefined {
  let current = operand;
  while (N.isParenthesizedExpression(current) || N.isAwaitExpression(current)) {
    current = current.getExpression();
  }
  if (!N.isCallExpression(current)) {
    return;
  }
  const callee = current.getExpression();
  return N.isPropertyAccessExpression(callee) && callee.getName() === JSON_METHOD && current.getArguments().length === 0 ? callee.getNameNode() : undefined;
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
          const name = jsonCallUnder(node.getExpression());
          if (name !== undefined) {
            ctx.report.node(name, { token: JSON_METHOD, offset: 0 });
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
          'declare const doc: { json(key: string): unknown };\nexport const other = (): string => doc.json("k") as string;\n',
      },
      why: "the remedy (a schema parse), an `unknown` target, a literal of only `unknown` members (nested literals included), and a `json` method that takes an argument (not a body read)",
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
