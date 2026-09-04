// Browser evidence retention truth: replacement is not observation/eviction, while protected overflow
// is incomplete even though no active request body may be dropped.
import { exactScope } from "../../../tooling/src/_shared/artifact-scope.ts";
import { BoundedEvidenceRing, BoundedLatestMap, retentionBatch } from "../../../tooling/src/_shared/browser-evidence-ring.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

test("same-key latest-map replacement updates value and scope without receipt growth", () => {
  const latest = new BoundedLatestMap<string, string>(100);
  latest.set("same", "one", exactScope(0, 0, "one"));
  latest.set("same", "two", exactScope(0, 0, "two"));
  latest.set("same", "three", exactScope(1, 2, "three"));

  expect(latest.get("same")).toBe("three");
  expect(latest.size).toBe(1);
  expect(latest.receipts("latest")).toEqual([
    expect.objectContaining({ observed: 1, retained: 1, dropped: 0, complete: true }),
    expect.objectContaining({
      observed: 1,
      retained: 1,
      dropped: 0,
      complete: true,
      scope: exactScope(1, 2, "three"),
    }),
  ]);
});

test("a new distinct latest-map key still produces an honest eviction receipt", () => {
  const latest = new BoundedLatestMap<string, string>(2);
  const scope = exactScope(0, 0, "latest");
  latest.set("a", "a", scope);
  latest.set("b", "b", scope);
  latest.set("c", "c", scope);

  expect(latest.has("a")).toBe(false);
  expect(latest.view()).toEqual(
    new Map([
      ["b", "b"],
      ["c", "c"],
    ]),
  );
  const batch = retentionBatch(latest.receipts("latest"));
  expect(batch.rows[0]).toMatchObject({ observed: 3, retained: 2, dropped: 1, complete: false });
  expect(batch.limits).toEqual([
    expect.objectContaining({
      source: "latest",
      complete: false,
      events: [expect.objectContaining({ kind: "eviction", original: 3, retained: 2, omitted: 1 })],
    }),
  ]);
});

test("replacement moves a latest-map key newest without desynchronizing its eviction receipts", () => {
  const latest = new BoundedLatestMap<string, number>(2);
  const scope = exactScope(0, 0, "latest-replacement");
  latest.set("a", 1, scope);
  latest.set("b", 1, scope);
  latest.set("a", 2, scope);
  latest.set("c", 1, scope);

  expect(latest.view()).toEqual(
    new Map([
      ["a", 2],
      ["c", 1],
    ]),
  );
  expect(() => latest.set("a", 3, scope)).not.toThrow();
  expect(latest.get("a")).toBe(3);
  expect(latest.receipts("latest")[0]).toMatchObject({ observed: 3, retained: 2, dropped: 1, complete: false });
});

test("protected oldest evidence may exceed capacity but receipt and limit stay explicitly incomplete", () => {
  const oldest = { id: "active", protected: true };
  const ring = new BoundedEvidenceRing<{ readonly id: string; protected: boolean }>(2, { canEvict: (value) => !value.protected });
  const scope = exactScope(0, 0, "active-body");
  ring.push(oldest, scope);
  ring.push({ id: "second", protected: false }, scope);
  ring.push({ id: "third", protected: false }, scope);

  expect(ring.length).toBe(3);
  expect(ring.read(0, ring.cursor(), "network").receipt).toMatchObject({ capacity: 2, observed: 3, retained: 3, dropped: 0, complete: false });
  const overflow = retentionBatch(ring.receipts("network"));
  expect(overflow.rows[0]).toMatchObject({ capacity: 2, observed: 3, retained: 3, dropped: 0, complete: false });
  expect(overflow.limits).toEqual([
    expect.objectContaining({
      source: "network",
      complete: false,
      policy: { capacity: 2 },
      events: [expect.objectContaining({ kind: "protected-overflow", original: 3, retained: 3, omitted: 0 })],
    }),
  ]);

  oldest.protected = false;
  ring.trim();
  expect(ring.length).toBe(2);
  const reconciled = retentionBatch(ring.receipts("network"));
  expect(reconciled.rows[0]).toMatchObject({ capacity: 2, observed: 3, retained: 2, dropped: 1, complete: false });
  expect(reconciled.limits.flatMap((limit) => limit.events).some((event) => event.kind === "protected-overflow")).toBe(false);
  expect(reconciled.limits.flatMap((limit) => limit.events)).toContainEqual(expect.objectContaining({ kind: "eviction", omitted: 1 }));
});
