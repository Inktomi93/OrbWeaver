// Self-test for the `contract-verb-presence` gate (scripts/check/gates/contract-verb-presence.ts —
// core/Spine-Testing.md §5, the interface-level complement to test-presence). Proves: a *Service verb with
// no test invocation fires; a verb covered by a bare `verb(` call passes; a verb covered only by its
// `create<Verb>(` factory (the alias-invoked shape) passes; the DEFERRED entries suppress their REDs;
// *ServiceDeps interfaces + non-Service interfaces are ignored; MethodSignature members are enumerated too.
import { contractVerbPresence } from "../../scripts/check/gates/contract-verb-presence.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const SVC = (domain: string): string => `packages/server/src/domain/${domain}/contract/service.ts`;
const TEST = (domain: string, name: string): string => `tests/server/domain/${domain}/${name}`;
const WIDGET_SVC = "export interface WidgetService {\n  readonly build: () => void;\n}\n";

test("fires on a *Service verb with no invocation in its domain tree", () => {
  const v = contractVerbPresence.run(ctxFor({ [SVC("widget")]: WIDGET_SVC }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("widget.build");
});

test("passes a verb covered by a bare call in a test", () => {
  const files = {
    [SVC("widget")]: WIDGET_SVC,
    [TEST("widget", "build.int.test.ts")]: "await build({ id: 1 });\n",
  };
  expect(contractVerbPresence.run(ctxFor(files))).toEqual([]);
});

test("passes a verb covered only by its create<Verb>( factory (alias-invoked)", () => {
  const files = {
    [SVC("widget")]: WIDGET_SVC,
    [TEST("widget", "build.int.test.ts")]: "const run = createBuild({ db });\nawait run();\n",
  };
  expect(contractVerbPresence.run(ctxFor(files))).toEqual([]);
});

test("a bare call to a LONGER identifier ending in the verb name does NOT count as coverage", () => {
  const files = {
    [SVC("widget")]: WIDGET_SVC,
    [TEST("widget", "build.int.test.ts")]: "await rebuild({ id: 1 });\n",
  };
  expect(contractVerbPresence.run(ctxFor(files))).toHaveLength(1);
});

test("DEFERRED entries suppress their REDs (the real-tree W1i backlog)", () => {
  const svc = "export interface DiscoveryService {\n  readonly themes: () => void;\n}\n";
  expect(contractVerbPresence.run(ctxFor({ [SVC("discovery")]: svc }))).toEqual([]);
});

test("ignores *ServiceDeps and non-Service interfaces (only the verb surface counts)", () => {
  const svc =
    "export interface WidgetServiceDeps {\n  readonly build: () => void;\n}\n" +
    "export interface WidgetContext {\n  readonly wipe: () => void;\n}\n";
  expect(contractVerbPresence.run(ctxFor({ [SVC("widget")]: svc }))).toEqual([]);
});

test("enumerates MethodSignature members too", () => {
  const svc = "export interface WidgetService {\n  save(): void;\n}\n";
  const v = contractVerbPresence.run(ctxFor({ [SVC("widget")]: svc }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("widget.save");
});
