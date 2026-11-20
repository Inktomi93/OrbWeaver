// A domain's contract/ stays a typed surface: the installed dependency checker refuses a runtime import from it into
// its own domain's other homes, the server tiers, @orb/db or @orb/inference, and admits the same targets type-only.
import { expect, test } from "@orb/testkit/tooling";
import { cruiseRules, unresolvable } from "./_native-cruise.ts";

const SRV = "packages/server/src";
const CONTRACT = `${SRV}/domain/alpha/contract`;
// The probe sits in a contract file; every target is one the rule names, planted beside it.
const ENTRY = `${CONTRACT}/probe.ts`;
const RULE = "domain-contract-types-only";

const PLANTED = {
  [`${CONTRACT}/view.ts`]: "export interface AlphaView { readonly id: string; }\nexport const ALPHA_KINDS = ['a'] as const;",
  [`${SRV}/domain/alpha/persistence/rows.ts`]: "export interface AlphaRow { readonly id: string; }\nexport const readRow = (): number => 1;",
  [`${SRV}/domain/alpha/substrate/views.ts`]: "export interface AlphaShape { readonly id: string; }\nexport const shape = (): number => 1;",
  [`${SRV}/domain/alpha/verbs/read.ts`]: "export interface ReadParams { readonly id: string; }\nexport const read = (): number => 1;",
  [`${SRV}/infra/probe/index.ts`]: "export interface Adapter { readonly id: string; }\nexport const adapter = (): number => 1;",
  [`${SRV}/foundation/probe/index.ts`]: "export interface Logger { readonly id: string; }\nexport const getLog = (): number => 1;",
  [`${SRV}/primitives/probe/index.ts`]: "export const pure = (): number => 1;",
  ["packages/db/src/index.ts"]: "export interface Db { readonly id: string; }\nexport const createDb = (): number => 1;",
  ["packages/inference/src/index.ts"]: "export interface Model { readonly id: string; }\nexport const runModel = (): number => 1;",
};

test.for([
  {
    name: "a runtime import of its domain's persistence",
    source: 'import { readRow } from "../persistence/rows.ts"; export const value = readRow;',
    refused: true,
  },
  { name: "a runtime import of its domain's substrate", source: 'import { shape } from "../substrate/views.ts"; export const value = shape;', refused: true },
  { name: "a runtime import of its domain's verbs", source: 'import { read } from "../verbs/read.ts"; export const value = read;', refused: true },
  { name: "a runtime import of infra", source: 'import { adapter } from "../../../infra/probe/index.ts"; export const value = adapter;', refused: true },
  {
    name: "a runtime import of foundation",
    source: 'import { getLog } from "../../../foundation/probe/index.ts"; export const value = getLog;',
    refused: true,
  },
  { name: "a runtime import of @orb/db", source: 'import { createDb } from "../../../../../db/src/index.ts"; export const value = createDb;', refused: true },
  {
    name: "a runtime import of @orb/inference",
    source: 'import { runModel } from "../../../../../inference/src/index.ts"; export const value = runModel;',
    refused: true,
  },
  { name: "a runtime re-export of persistence", source: 'export { readRow } from "../persistence/rows.ts";', refused: true },
  { name: "a type-only import of @orb/db", source: 'import type { Db } from "../../../../../db/src/index.ts"; export type Value = Db;', refused: false },
  {
    name: "a type-only import of @orb/inference",
    source: 'import type { Model } from "../../../../../inference/src/index.ts"; export type Value = Model;',
    refused: false,
  },
  {
    name: "a type-only import of its domain's persistence",
    source: 'import type { AlphaRow } from "../persistence/rows.ts"; export type Value = AlphaRow;',
    refused: false,
  },
  {
    name: "a type-only import of foundation",
    source: 'import type { Logger } from "../../../foundation/probe/index.ts"; export type Value = Logger;',
    refused: false,
  },
  { name: "a runtime import of its own contract", source: 'import { ALPHA_KINDS } from "./view.ts"; export const value = ALPHA_KINDS;', refused: false },
  {
    name: "a runtime import of the server primitives",
    source: 'import { pure } from "../../../primitives/probe/index.ts"; export const value = pure;',
    refused: false,
  },
] as const)("the contract purity rule judges $name", async ({ source, refused }, { plantedTree }) => {
  const root = await plantedTree({ ...PLANTED, [ENTRY]: source });
  const violations = await cruiseRules(root, [ENTRY], [RULE]);
  expect(unresolvable(violations)).toEqual([]);
  expect(violations.filter(({ from }) => from === ENTRY).map((violation) => violation.rule)).toEqual(refused ? [RULE] : []);
});
