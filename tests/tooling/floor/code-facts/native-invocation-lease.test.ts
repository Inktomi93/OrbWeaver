// @subject tooling/src/floor/code-facts/semantic-inventory-queries.ts
// Owned and historical inventory leases pin their private connection, index closure membership once and leave
// borrowed savepoints, unfinished writes and DDL reads fresh.
import { join } from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import type { InventoryBuildRequest, NativeInvocationEvidence } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { invocationAtomSchema, invocationQuerySchema } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  latestInventoryGeneration,
  openInventoryDatabase,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { inventoryAuthoredFiles } from "../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts";
import { acquireInventoryReadLease, readInventoryInvocationEvidence } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryReader, ownedInventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { captureInvocationEvidence } from "../../../../tooling/src/floor/compiler/invocation-evidence-extract.ts";
import { scaledBudget } from "../../_load-budget.ts";
import type { NativeInventoryLifetime } from "../compiler/native-inventory-fixture.ts";
import { nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";
import { controls, PLAN, SOURCE, setup, snapshot, span } from "./_native-invocation-delivery-support.ts";

test(
  "the historical verdict lease pins its private connection before any consumer fact read",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const selected = calls.filter((call) => ["bound()", "rebound()"].includes(call.getText()));
    expect(selected).toHaveLength(2);
    const options = {
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"] as const,
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: selected.map((call) => ({ program: descriptor.id, query: { ...PLAN, node: span(call) } })),
    };
    const databasePath = join(scratch, ".cache/semantic-inventory.sqlite");
    let connection: DatabaseSync | undefined;
    const prepare = DatabaseSync.prototype.prepare;
    const observation = vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function (this: DatabaseSync, ...args) {
      if (this.location() === databasePath) {
        connection = this;
      }
      return prepare.apply(this, args);
    });
    let inventory: ReturnType<typeof nativeInventoryFixture>;
    try {
      inventory = nativeInventoryFixture(options);
    } finally {
      observation.mockRestore();
    }
    using owned = inventory;
    const privateConnection = connection;
    if (privateConnection === undefined) {
      throw new Error("private inventory connection was not observed");
    }
    expect(privateConnection.isTransaction).toBe(true);
    expect(privateConnection.prepare("PRAGMA query_only").get()).toEqual({ ["query_only"]: 1 });
    expect(() => privateConnection.exec("UPDATE inventory_global_binding SET lexicalCount=lexicalCount+1")).toThrow("readonly");
    using db = openInventoryDatabase(databasePath);
    const partitions = readInventoryGeneration(db, owned.generation);
    const partition = partitions[0];
    if (partition === undefined) {
      throw new Error("owned lease partition is missing");
    }
    db.prepare("UPDATE inventory_global_binding SET lexicalCount=lexicalCount+1 WHERE partition=?").run(partition.id);
    for (const call of selected) {
      expect(snapshot(call, owned.invocationEvidence(call, descriptor.id, PLAN))).toEqual(snapshot(call, captureInvocationEvidence(call, PLAN)));
    }
    using borrowed = inventoryReader(scratch, owned.generation, partitions, { db, dispose: () => undefined });
    for (const call of selected) {
      expect(() => borrowed.invocationEvidence(call, descriptor.id, PLAN)).toThrow("declarations are incomplete");
    }
    expect(() => nativeInventoryFixture(options)).toThrow("declarations are incomplete");
    db.prepare("UPDATE inventory_global_binding SET lexicalCount=lexicalCount-1 WHERE partition=?").run(partition.id);
    for (const call of selected) {
      expect(borrowed.invocationEvidence(call, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
    }
    owned[Symbol.dispose]();
    expect(privateConnection.isOpen).toBe(false);
    expect(db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()).toMatchObject({ busy: 0 });
  },
  scaledBudget(30_000),
);

test(
  "owned replay indexes immutable closure membership once while borrowed metadata remains fresh",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const selected = calls.filter((call) => ["bound()", "rebound()", "written()"].includes(call.getText()));
    expect(selected).toHaveLength(3);
    using built = nativeInventoryFixture({
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"],
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: selected.map((call) => ({ program: descriptor.id, query: { ...PLAN, node: span(call) } })),
    });
    const databasePath = join(scratch, ".cache/semantic-inventory.sqlite");
    using db = openInventoryDatabase(databasePath);
    const partitions = readInventoryGeneration(db, built.generation);
    using privateDb = openInventoryDatabase(databasePath);
    using lease = acquireInventoryReadLease(privateDb, built.generation, partitions);
    const partition = lease.partitions[0];
    const borrowedPartition = partitions[0];
    const anchor = selected[0];
    if (partition === undefined || borrowedPartition === undefined || anchor === undefined) {
      throw new Error("closure membership fixture missing");
    }
    const scans = vi.spyOn(partition.available, "includes");
    const enumerations = vi.spyOn(partition.available, Symbol.iterator);
    try {
      using indexed = ownedInventoryReader(scratch, built.generation, lease, { db: privateDb, dispose: () => undefined });
      for (const selectedCall of [...selected, ...selected]) {
        expect(snapshot(selectedCall, indexed.invocationEvidence(selectedCall, descriptor.id, PLAN))).toEqual(
          snapshot(selectedCall, captureInvocationEvidence(selectedCall, PLAN)),
        );
      }
      expect(scans.mock.calls.length).toBe(0);
      expect(enumerations).toHaveBeenCalledTimes(1);
      const retained = indexed.invocationEvidence(anchor, descriptor.id, PLAN);
      using borrowed = inventoryReader(scratch, built.generation, partitions, { db, dispose: () => undefined });
      const file = anchor.getSourceFile().getFilePath();
      const at = borrowedPartition.available.indexOf(file);
      expect(at).toBeGreaterThanOrEqual(0);
      const removed = borrowedPartition.available.splice(at, 1);
      try {
        expect(() => borrowed.invocationEvidence(anchor, descriptor.id, PLAN)).toThrow("source is outside its native closure");
        expect(indexed.invocationEvidence(anchor, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
      } finally {
        borrowedPartition.available.splice(at, 0, ...removed);
      }
      expect(borrowed.invocationEvidence(anchor, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
      indexed[Symbol.dispose]();
      expect(() => retained.declarations(anchor.getExpression())).toThrow("disposed");
    } finally {
      enumerations.mockRestore();
      scans.mockRestore();
    }
  },
  scaledBudget(30_000),
);

test(
  "owned inventory lease validates complete raw bindings once across multiple public queries",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const selected = calls.filter((call) => ["bound()", "rebound()", "written()"].includes(call.getText()));
    expect(selected).toHaveLength(3);
    const options = {
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"] as const,
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: selected.map((call) => ({ program: descriptor.id, query: { ...PLAN, node: span(call) } })),
    };
    using first = nativeInventoryFixture(options);
    using second = nativeInventoryFixture(options);
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, first.generation);
    const partition = partitions[0];
    if (partition === undefined) {
      throw new Error("raw binding work-count partition is missing");
    }
    const facts = selected.flatMap((call) => [...readInventoryInvocationEvidence(db, partition.id, { ...PLAN, node: span(call) })]);
    const unique = new Set(facts.flatMap((fact) => fact.sources.map(({ file }) => file)));
    expect(facts.reduce((count, fact) => count + fact.sources.length, 0)).toBeGreaterThan(unique.size);
    let enumerations = 0;
    const iterate = StatementSync.prototype.iterate;
    const observation = vi.spyOn(StatementSync.prototype, "iterate").mockImplementation(function (this: StatementSync, ...args) {
      if (this.sourceSQL.includes("b.lexicalCount,b.originCount FROM inventory_global_binding")) {
        enumerations++;
      }
      return iterate.apply(this, args);
    });
    let atomRows = 0;
    const all = StatementSync.prototype.all;
    const atoms = vi.spyOn(StatementSync.prototype, "all").mockImplementation(function (this: StatementSync, ...args) {
      const rows = all.apply(this, args);
      if (this.sourceSQL.includes("FROM inventory_invocation_atom")) {
        atomRows += rows.length;
      }
      return rows;
    });
    const extensions = vi.spyOn(invocationAtomSchema, "extend");
    try {
      for (const inventory of [first, second]) {
        for (const [index, call] of [...selected, ...selected].entries()) {
          const parses = vi.spyOn(invocationQuerySchema, "parse");
          let delivered: NativeInvocationEvidence;
          try {
            delivered = inventory.invocationEvidence(call, descriptor.id, PLAN);
            expect(parses).toHaveBeenCalledTimes(index < selected.length ? 2 : 1);
          } finally {
            parses.mockRestore();
          }
          expect(snapshot(call, delivered)).toEqual(snapshot(call, captureInvocationEvidence(call, PLAN)));
        }
        expect(enumerations).toBe(unique.size * (inventory === first ? 1 : 2));
      }
      using borrowed = inventoryReader(scratch, first.generation, partitions, { db, dispose: () => undefined });
      for (const call of selected) {
        borrowed.invocationEvidence(call, descriptor.id, PLAN);
      }
      expect(enumerations).toBeGreaterThan(unique.size * 2);
      expect(atomRows).toBeGreaterThan(selected.length);
      expect(extensions).toHaveBeenCalledTimes(0);
    } finally {
      extensions.mockRestore();
      atoms.mockRestore();
      observation.mockRestore();
    }
  },
  scaledBudget(30_000),
);

test(
  "owned inventory leaves borrowed savepoints, unfinished writes and DDL reads fresh",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const call = calls.find((node) => node.getText() === "bound()");
    if (call === undefined) {
      throw new Error("borrowed freshness call is missing");
    }
    using owned = nativeInventoryFixture({
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"],
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
    });
    const captured = owned.invocationEvidence(call, descriptor.id, PLAN);
    const declarations = captured.declarations(call.getExpression());
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    const partitions = readInventoryGeneration(db, owned.generation);
    const partition = partitions[0];
    if (partition === undefined) {
      throw new Error("borrowed freshness partition missing");
    }
    using borrowed = inventoryReader(scratch, owned.generation, partitions, { db, dispose: () => undefined });
    expect(borrowed.invocationEvidence(call, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
    db.exec("BEGIN IMMEDIATE;SAVEPOINT beforeWrite");
    try {
      db.prepare("UPDATE inventory_global_binding SET lexicalCount=lexicalCount+1 WHERE partition=?").run(partition.id);
      const changed = db.prepare("SELECT total_changes() AS count").get();
      expect(() => borrowed.invocationEvidence(call, descriptor.id, PLAN)).toThrow("declarations are incomplete");
      db.exec("ROLLBACK TO beforeWrite");
      expect(db.prepare("SELECT total_changes() AS count").get()).toEqual(changed);
      expect(borrowed.invocationEvidence(call, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
      db.exec("SAVEPOINT beforeDdl;ALTER TABLE inventory_global_binding RENAME TO displaced_binding");
      expect(() => borrowed.invocationEvidence(call, descriptor.id, PLAN)).toThrow("no such table");
      db.exec("ROLLBACK TO beforeDdl");
      expect(borrowed.invocationEvidence(call, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
    } finally {
      db.exec("ROLLBACK");
    }
    const before = db.prepare("SELECT total_changes() AS count").get();
    const pending = db.prepare("UPDATE inventory_global_binding SET lexicalCount=lexicalCount+1 WHERE partition=? RETURNING ordinal").iterate(partition.id);
    pending.next();
    try {
      expect(db.isTransaction).toBe(false);
      expect(db.prepare("SELECT total_changes() AS count").get()).toEqual(before);
      expect(() => borrowed.invocationEvidence(call, descriptor.id, PLAN)).toThrow("declarations are incomplete");
      expect(captured.declarations(call.getExpression())).toEqual(declarations);
      expect(owned.invocationEvidence(call, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
    } finally {
      pending.return?.();
    }
    db.prepare("UPDATE inventory_global_binding SET lexicalCount=lexicalCount-1 WHERE partition=?").run(partition.id);
    expect(borrowed.invocationEvidence(call, descriptor.id, PLAN).invocation?.kind).toBe("resolved");
    db.exec("BEGIN IMMEDIATE");
    borrowed[Symbol.dispose]();
    expect(db.isTransaction).toBe(true);
    db.exec("ROLLBACK");
  },
  scaledBudget(30_000),
);

test(
  "owned inventory overlay closes its query-only lease before removing isolated storage",
  ({ scratch, repoRoot }) => {
    setup(scratch, repoRoot);
    const { descriptor, calls } = controls(scratch);
    const call = calls.find((node) => node.getText() === "bound()");
    if (call === undefined) {
      throw new Error("overlay lease call missing");
    }
    const options = {
      root: scratch,
      programs: [descriptor],
      families: ["invocation-evidence", "global-origins", "computed-names"] as const,
      globalOriginQueries: [],
      globalBindingQueries: [],
      computedNameQueries: [],
      invocationQueries: [{ program: descriptor.id, query: { ...PLAN, node: span(call) } }],
    };
    using main = nativeInventoryFixture(options);
    const lifetime: NativeInventoryLifetime[] = [];
    const overlayRequests: InventoryBuildRequest[] = [];
    using overlay = nativeInventoryFixture(options, {
      projection: { root: scratch, files: [{ path: join(scratch, "vendor/bound.ts"), text: "export const bound=()=>1;" }], deleted: [] },
      lifetime,
      requests: overlayRequests,
    });
    expect(overlayRequests).toHaveLength(1);
    expect(overlayRequests[0]?.overlay?.files.find((file) => file.path === join(scratch, "vendor/bound.ts"))).toEqual({
      path: join(scratch, "vendor/bound.ts"),
      text: "export const bound=()=>1;",
    });
    expect(inventoryAuthoredFiles(scratch, overlayRequests[0]?.overlay).has(join(scratch, "vendor/bound.ts"))).toBe(false);
    expect(overlay.sourceCorpus().getSourceFile("vendor/bound.ts")?.getFullText()).toBe("export const bound=()=>1;");
    expect(lifetime).toEqual([{ transaction: true, queryOnly: 1, existed: true, closed: true, removed: true }]);
    const source = overlay.sourceCorpus().getSourceFile(SOURCE);
    const overlayCall = source?.getDescendantsOfKind(SyntaxKind.CallExpression).find((node) => node.getText() === "bound()");
    if (overlayCall === undefined) {
      throw new Error("overlay captured call missing");
    }
    expect(overlay.invocationEvidence(overlayCall, descriptor.id, PLAN).invocation).toMatchObject({
      kind: "resolved",
      value: { target: { kind: "module", canonical: { exportedName: "bound" } } },
    });
    using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
    expect(latestInventoryGeneration(db)).toBe(main.generation);
    overlay[Symbol.dispose]();
    expect(() => overlay.invocationEvidence(overlayCall, descriptor.id, PLAN)).toThrow("disposed");
  },
  scaledBudget(30_000),
);
