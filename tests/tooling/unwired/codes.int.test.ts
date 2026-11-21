// `pnpm unwired codes` lists each code of a contracts code vocabulary with its throws, its wire crossing and its client
// branches. A vocabulary is one of codes when production throws a member or a tRPC answer carries it; a code nothing
// throws, and a crossing code only a generic toast meets, are reported. A switch label and a comparison with the member's
// constant are handlers, a fault thrown through a class the transport does not carry needs none, and a tuple no error and
// no answer carries is never read as codes.
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { scanCodes } from "../../../tooling/src/unwired/index.ts";
import { LIB } from "./_planted.ts";

const WORLD = "packages/server/tsconfig.json";

const TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB, include: ["src", "../contracts/src", "../client/src"] }),
  // A planted tree has no node_modules: the procedure builder is the one tRPC surface the scan knows a send by.
  "node_modules/@trpc/server/package.json": JSON.stringify({ name: "@trpc/server", types: "index.d.ts" }),
  "node_modules/@trpc/server/index.d.ts": [
    "export interface Procedure<T> {",
    "  readonly answer?: T;",
    "}",
    "export interface ProcedureBuilder {",
    "  query<T>(resolver: () => T): Procedure<Awaited<T>>;",
    "}",
    "export declare const publicProcedure: ProcedureBuilder;",
  ].join("\n"),
  "packages/contracts/src/codes.ts": [
    "// Thrown codes: the client keys on `scroll_unreadable`, toasts `scroll_invalid`, and nothing throws `scroll_retired`.",
    'export const IMPORT_REFUSALS = ["scroll_unreadable", "scroll_invalid", "scroll_retired"] as const;',
    "export type ImportRefusal = (typeof IMPORT_REFUSALS)[number];",
    "// A fault only the server sees: thrown through a class the transport does not carry, and no client code names it.",
    'export const VAULT_FAULTS = ["vault_locked"] as const;',
    "export type VaultFault = (typeof VAULT_FAULTS)[number];",
    "// Returned refusals: a procedure answers with a notice typed by the tuple, and the client branches on `share_oidc` only.",
    'export const SHARE_REFUSALS = ["share_oidc", "share_single_user"] as const;',
    "export type ShareRefusal = (typeof SHARE_REFUSALS)[number];",
    "export interface ShareNotice {",
    "  readonly code: ShareRefusal;",
    "  readonly message: string;",
    "}",
    "export const OP_CODES = {",
    '  notFound: "op_not_found",',
    '  labelEmpty: "op_label_empty",',
    "} as const;",
    "export type OpCode = (typeof OP_CODES)[keyof typeof OP_CODES];",
    "// No code vocabulary: production builds a member, but no error and no answer carries it.",
    'export const MODES = ["on", "off"] as const;',
    "export type Mode = (typeof MODES)[number];",
  ].join("\n"),
  "packages/server/src/errors.ts": [
    'import type { ImportRefusal, OpCode, VaultFault } from "../../contracts/src/codes.ts";',
    "export class DomainOperationError extends Error {",
    "  readonly code: string;",
    "  constructor(code: string, message: string) {",
    "    super(message);",
    "    this.code = code;",
    "  }",
    "}",
    "export class ImportRefusalError extends DomainOperationError {",
    "  constructor(code: ImportRefusal) {",
    '    super(code, "The scroll was refused.");',
    "  }",
    "}",
    "export class OpError extends DomainOperationError {",
    "  constructor(code: OpCode) {",
    '    super(code, "The operation was refused.");',
    "  }",
    "}",
    "export class VaultError extends Error {",
    "  readonly fault: VaultFault;",
    "  constructor(fault: VaultFault) {",
    '    super("The vault is locked.");',
    "    this.fault = fault;",
    "  }",
    "}",
  ].join("\n"),
  "packages/server/src/transport/trpc/error-mapping.ts": [
    'import { DomainOperationError } from "../../errors.ts";',
    "export function domainReason(error: { readonly cause?: unknown }): string | undefined {",
    "  return error.cause instanceof DomainOperationError ? error.cause.code : undefined;",
    "}",
  ].join("\n"),
  "packages/server/src/verbs.ts": [
    'import { OP_CODES } from "../../contracts/src/codes.ts";',
    'import type { Mode } from "../../contracts/src/codes.ts";',
    'import { ImportRefusalError, OpError, VaultError } from "./errors.ts";',
    "export function readCard(text: string): string {",
    '  if (text === "") {',
    '    throw new ImportRefusalError("scroll_unreadable");',
    "  }",
    '  if (text === "?") {',
    '    throw new ImportRefusalError("scroll_invalid");',
    "  }",
    "  return text;",
    "}",
    "export function rename(label: string): string {",
    '  if (label === "") {',
    "    throw new OpError(OP_CODES.notFound);",
    "  }",
    "  return label;",
    "}",
    "export function unlock(open: boolean): void {",
    "  if (!open) {",
    '    throw new VaultError("vault_locked");',
    "  }",
    "}",
    'export const mode: Mode = "on";',
  ].join("\n"),
  "packages/server/src/router.ts": [
    'import { publicProcedure } from "@trpc/server";',
    'import type { ShareNotice } from "../../contracts/src/codes.ts";',
    "export const shareRouter = {",
    '  oidc: publicProcedure.query((): ShareNotice => ({ code: "share_oidc", message: "Sign in through your provider." })),',
    '  single: publicProcedure.query(async (): Promise<ShareNotice> => ({ code: "share_single_user", message: "This box has one user." })),',
    "};",
  ].join("\n"),
  "packages/client/src/notice.ts": [
    'import type { ImportRefusal, ShareRefusal } from "../../contracts/src/codes.ts";',
    'import { OP_CODES } from "../../contracts/src/codes.ts";',
    "export const toast = (line: string): string => line;",
    "export function importCopy(code: ImportRefusal): string {",
    "  switch (code) {",
    '    case "scroll_unreadable":',
    '      return "That scroll could not be read.";',
    "    default:",
    '      return toast("The import failed.");',
    "  }",
    "}",
    "export const failureToast = (error: { readonly message: string }): string => toast(error.message);",
    "export function shareCopy(code: ShareRefusal): string {",
    "  switch (code) {",
    '    case "share_oidc":',
    '      return "Sharing needs a local sign-in.";',
    "    default:",
    '      return toast("Sharing is off.");',
    "  }",
    "}",
    "export const isMissing = (reason: string): boolean => reason === OP_CODES.notFound;",
  ].join("\n"),
};

const HOME = "packages/contracts/src/codes.ts";

test("the codes scan reports a code nothing throws and a crossing code no client branch names, and passes a switch, a constant comparison and a server-only fault", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const root = await plantedTree(TREE);
  const report = scanCodes({ root, worlds: [WORLD], testWorlds: [], deliberate: [], log: () => undefined });
  expect(report.unwired.map(({ kind, home, member, line }) => ({ kind, home, member, line }))).toEqual([
    { kind: "unhandled", home: "IMPORT_REFUSALS", member: "scroll_invalid", line: 2 },
    { kind: "unthrown", home: "IMPORT_REFUSALS", member: "scroll_retired", line: 2 },
    { kind: "unthrown", home: "OP_CODES", member: "op_label_empty", line: 16 },
    { kind: "unhandled", home: "SHARE_REFUSALS", member: "share_single_user", line: 8 },
  ]);
  expect(report.codes.map(({ member, throws, builds, crosses, handlers }) => ({ member, throws, builds, crosses, handlers }))).toEqual([
    {
      member: "scroll_unreadable",
      throws: ["packages/server/src/verbs.ts:6"],
      builds: [],
      crosses: ["reason", "client"],
      handlers: ["packages/client/src/notice.ts:6"],
    },
    { member: "scroll_invalid", throws: ["packages/server/src/verbs.ts:9"], builds: [], crosses: ["reason", "client"], handlers: [] },
    { member: "scroll_retired", throws: [], builds: [], crosses: ["client"], handlers: [] },
    {
      member: "op_not_found",
      throws: ["packages/server/src/verbs.ts:15"],
      builds: [],
      crosses: ["reason", "client"],
      handlers: ["packages/client/src/notice.ts:21"],
    },
    { member: "op_label_empty", throws: [], builds: [], crosses: ["client"], handlers: [] },
    {
      member: "share_oidc",
      throws: [],
      builds: ["packages/server/src/router.ts:4"],
      crosses: ["answer", "client"],
      handlers: ["packages/client/src/notice.ts:15"],
    },
    { member: "share_single_user", throws: [], builds: ["packages/server/src/router.ts:5"], crosses: ["answer", "client"], handlers: [] },
    { member: "vault_locked", throws: ["packages/server/src/verbs.ts:21"], builds: [], crosses: [], handlers: [] },
  ]);
  expect(report.vocabularies).toEqual([
    { key: `${HOME}:IMPORT_REFUSALS`, channels: ["thrown"], sends: [] },
    { key: `${HOME}:OP_CODES`, channels: ["thrown"], sends: [] },
    { key: `${HOME}:SHARE_REFUSALS`, channels: ["returned"], sends: ["packages/server/src/router.ts:4", "packages/server/src/router.ts:5"] },
    { key: `${HOME}:VAULT_FAULTS`, channels: ["thrown"], sends: [] },
  ]);
  expect(report.scanned).toBe(5);
});
