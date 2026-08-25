import type { BusCoverageSpec } from "../../../../tooling/src/verify/contract/readers.ts";
import { reconcileBusCoverage } from "../../../../tooling/src/verify/lib/bus-coverage.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

const HOME = "packages/contracts/src/user-bus/index.ts";
const EMIT = "packages/server/src/domain/settings/x.ts";
const SPEC: BusCoverageSpec = {
  contractsFile: /\/packages\/contracts\/src\/user-bus\/index\.ts$/u,
  typesConst: "USER_BUS_EVENT_TYPES",
  keyShape: "object",
  reportFile: HOME,
  deferred: {},
  missingPrefix: "missing: ",
  stalePrefix: "stale: ",
};

const CHAT_HOME = "packages/contracts/src/chat/bus.ts";
const CHAT_EMIT = "packages/server/src/transport/trpc/stream/sources/chat.ts";
const CHAT_SPEC: BusCoverageSpec = {
  contractsFile: /\/packages\/contracts\/src\/chat\/bus\.ts$/u,
  typesConst: "CHAT_BUS_EVENT_TYPES",
  keyShape: "object",
  reportFile: CHAT_HOME,
  deferred: {},
  missingPrefix: "missing: ",
  stalePrefix: "stale: ",
};

function findings(files: Record<string, string>): ReturnType<typeof reconcileBusCoverage> {
  return reconcileBusCoverage(ctxFor(files).project, SPEC);
}

test("arbitrary discriminator literals do not count as bus emits", () => {
  expect(
    findings({
      [HOME]: "export const USER_BUS_EVENT_TYPES = { alpha: true } as const;\n",
      [EMIT]: 'export const decoy = "alpha";\n',
    }),
  ).toHaveLength(1);
});

test("an unrelated call carrying a type-shaped object does not count as a bus emit", () => {
  expect(
    findings({
      [HOME]: "export const USER_BUS_EVENT_TYPES = { alpha: true } as const;\n",
      [EMIT]: 'record({ type: "alpha" });\n',
    }),
  ).toHaveLength(1);
});

test("a same-named method on the wrong receiver does not count as a bus emit", () => {
  expect(
    findings({
      [HOME]: "export const USER_BUS_EVENT_TYPES = { alpha: true } as const;\n",
      [EMIT]: 'logger.emitUserEvent(ownerId, { type: "alpha" });\n',
    }),
  ).toHaveLength(1);
});

test("a locally shadowed emitter name does not count as the injected bus operation", () => {
  expect(
    findings({
      [HOME]: "export const USER_BUS_EVENT_TYPES = { alpha: true } as const;\n",
      [EMIT]: 'function emitUserEvent(_ownerId: string, _event: object) {}\nemitUserEvent(ownerId, { type: "alpha" });\n',
    }),
  ).toHaveLength(1);
});

test("the user-bus emitter call with the discriminator object counts", () => {
  expect(
    findings({
      [HOME]: "export const USER_BUS_EVENT_TYPES = { alpha: true } as const;\n",
      [EMIT]: 'ctx.emitUserEvent(ownerId, { type: "alpha" });\n',
    }),
  ).toEqual([]);
});

test("an alias bound from the injected user-bus operation counts", () => {
  expect(
    findings({
      [HOME]: "export const USER_BUS_EVENT_TYPES = { alpha: true } as const;\n",
      [EMIT]: 'const publish = ctx.emitUserEvent;\npublish(ownerId, { type: "alpha" });\n',
    }),
  ).toEqual([]);
});

test("an event object bound to a local and passed to the user publisher counts", () => {
  expect(
    findings({
      [HOME]: "export const USER_BUS_EVENT_TYPES = { alpha: true } as const;\n",
      [EMIT]:
        'import { publishUserEvent } from "../../../transport/trpc/index.ts";\nconst event = ready ? { type: "alpha" } : { type: "alpha", detail: true };\npublishUserEvent(ownerId, event);\n',
    }),
  ).toEqual([]);
});

test("a chat stream synthesis counts only when it is yielded on the chat channel", () => {
  expect(
    reconcileBusCoverage(
      ctxFor({
        [CHAT_HOME]: "export const CHAT_BUS_EVENT_TYPES = { chatOpened: true } as const;\n",
        [CHAT_EMIT]: 'function* stream() { yield { channel: "chat", event: { type: "chatOpened" } }; }\n',
      }).project,
      CHAT_SPEC,
    ),
  ).toEqual([]);
});

test("a missing canonical event belt fails loud", () => {
  expect(findings({ [HOME]: "export const OTHER = { alpha: true } as const;\n" })[0]?.message).toContain("canonical");
});

test("a missing canonical contracts home fails loud", () => {
  expect(findings({ [EMIT]: 'ctx.emitUserEvent(ownerId, { type: "alpha" });\n' })[0]?.message).toContain("canonical");
});
