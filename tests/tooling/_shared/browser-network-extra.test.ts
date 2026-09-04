// Pending ExtraInfo retention: exact queue accounting must preserve whole-queue FIFO eviction and the
// active-request overflow exception without rescanning every retained queue to learn the total.
import { exactScope } from "../../../tooling/src/_shared/artifact-scope.ts";
import type { NetworkExtraKind } from "../../../tooling/src/_shared/browser-network-extra.ts";
import { PendingNetworkExtras } from "../../../tooling/src/_shared/browser-network-extra.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

const SCOPE = exactScope(0, 0, "network-extra-test");

interface Assignment {
  readonly requestId: string;
  readonly kind: NetworkExtraKind;
  readonly value: string;
  readonly active?: ReadonlySet<string>;
}

function assign(extras: PendingNetworkExtras, input: Assignment): void {
  extras.assign({
    requestId: input.requestId,
    kind: input.kind,
    event: input.value,
    scope: SCOPE,
    isActive: (candidate) => input.active?.has(candidate) ?? false,
  });
}

function aggregate(extras: PendingNetworkExtras): ReturnType<PendingNetworkExtras["receipts"]>[number] {
  const receipt = extras.receipts()[0];
  expect(receipt).toBeDefined();
  return receipt as NonNullable<typeof receipt>;
}

test("over-cap eviction removes the oldest whole queue across request and response maps", () => {
  const extras = new PendingNetworkExtras(3);
  assign(extras, { requestId: "old", kind: "requestExtra", value: "old-1" });
  assign(extras, { requestId: "old", kind: "requestExtra", value: "old-2" });
  assign(extras, { requestId: "response", kind: "responseExtra", value: "response-1" });
  assign(extras, { requestId: "new", kind: "requestExtra", value: "new-1" });

  expect(extras.state()).toEqual({ requestIds: 1, responseIds: 1 });
  expect(extras.take("old", "requestExtra")).toBeNull();
  expect(extras.take("response", "responseExtra")).toBe("response-1");
  expect(extras.take("new", "requestExtra")).toBe("new-1");
  expect(aggregate(extras)).toMatchObject({ observed: 4, retained: 2, dropped: 2, complete: false });
});

test("active-only overflow is retained beyond the cap without fabricating drops", () => {
  const extras = new PendingNetworkExtras(2);
  const active = new Set(["a", "b", "c"]);
  assign(extras, { requestId: "a", kind: "requestExtra", value: "a", active });
  assign(extras, { requestId: "b", kind: "responseExtra", value: "b", active });
  assign(extras, { requestId: "c", kind: "requestExtra", value: "c", active });

  expect(extras.state()).toEqual({ requestIds: 2, responseIds: 1 });
  expect(aggregate(extras)).toMatchObject({ observed: 3, retained: 3, dropped: 0, complete: true });
  expect(extras.take("a", "requestExtra")).toBe("a");
  expect(extras.take("b", "responseExtra")).toBe("b");
  expect(extras.take("c", "requestExtra")).toBe("c");
});

test("take, discard, and clear reconcile the retained counter before later trims", () => {
  const taken = new PendingNetworkExtras(3);
  assign(taken, { requestId: "consumed", kind: "requestExtra", value: "consumed" });
  expect(taken.take("consumed", "requestExtra")).toBe("consumed");
  assign(taken, { requestId: "a", kind: "requestExtra", value: "a" });
  assign(taken, { requestId: "b", kind: "requestExtra", value: "b" });
  assign(taken, { requestId: "c", kind: "requestExtra", value: "c" });
  expect(aggregate(taken)).toMatchObject({ observed: 4, retained: 4, dropped: 0 });
  expect(taken.state()).toEqual({ requestIds: 3, responseIds: 0 });

  const discarded = new PendingNetworkExtras(3);
  assign(discarded, { requestId: "discarded", kind: "requestExtra", value: "request" });
  assign(discarded, { requestId: "discarded", kind: "responseExtra", value: "response" });
  discarded.discard("discarded");
  assign(discarded, { requestId: "a", kind: "requestExtra", value: "a" });
  assign(discarded, { requestId: "b", kind: "requestExtra", value: "b" });
  assign(discarded, { requestId: "c", kind: "requestExtra", value: "c" });
  expect(discarded.state()).toEqual({ requestIds: 3, responseIds: 0 });
  expect(aggregate(discarded)).toMatchObject({ observed: 5, retained: 3, dropped: 2 });
  discarded.clear();
  expect(discarded.state()).toEqual({ requestIds: 0, responseIds: 0 });
  expect(aggregate(discarded)).toMatchObject({ observed: 5, retained: 0, dropped: 5 });
});

test("a large planted cap retains the exact newest population without a timing benchmark", () => {
  const capacity = 4096;
  const overflow = 512;
  const extras = new PendingNetworkExtras(capacity);
  for (let index = 0; index < capacity + overflow; index += 1) {
    assign(extras, { requestId: `request-${String(index)}`, kind: index % 2 === 0 ? "requestExtra" : "responseExtra", value: String(index) });
  }

  expect(extras.state()).toEqual({ requestIds: capacity / 2, responseIds: capacity / 2 });
  expect(aggregate(extras)).toMatchObject({ observed: capacity + overflow, retained: capacity, dropped: overflow, complete: false });
  expect(extras.take("request-0", "requestExtra")).toBeNull();
  expect(extras.take(`request-${String(overflow)}`, "requestExtra")).toBe(String(overflow));
  expect(extras.take(`request-${String(capacity + overflow - 1)}`, "responseExtra")).toBe(String(capacity + overflow - 1));
});
