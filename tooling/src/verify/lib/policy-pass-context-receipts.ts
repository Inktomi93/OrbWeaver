// Receipt acceptance helpers for policy-pass-context.ts, extracted to keep the host under the line cap.
import type { PolicySemanticReceipt } from "../contract/policy-pass.ts";

function exactKeys(value: object, allowed: ReadonlySet<string>, label: string): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    throw new Error(`${label} cannot author ${JSON.stringify(unknown)}`);
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

function assertCount(value: unknown, label: string): number {
  if (!(Number.isInteger(value) && (value as number) >= 0)) {
    throw new Error(`${label} must be a nonnegative integer`);
  }
  return value as number;
}

const POPULATION_RECEIPT_KEYS = new Set(["kind", "source", "members", "unresolved"]);
const RESOURCE_RECEIPT_KEYS = new Set(["kind", "source", "resources", "unresolved"]);

function receiptRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("policy receipt must be an object with an exact discriminant");
  }
  return value as Record<string, unknown>;
}

function acceptPopulationReceipt(receipts: Map<string, PolicySemanticReceipt>, receipt: Record<string, unknown>): void {
  exactKeys(receipt, POPULATION_RECEIPT_KEYS, "policy receipt");
  const source = requiredText(receipt["source"], "policy receipt source");
  const members = assertCount(receipt["members"], "policy receipt members");
  const unresolved = assertCount(receipt["unresolved"] ?? 0, "policy receipt unresolved");
  const key = JSON.stringify(["population", source]);
  const prior = receipts.get(key);
  receipts.set(key, {
    kind: "population",
    source,
    members: (prior?.kind === "population" ? prior.members : 0) + members,
    unresolved: (prior?.unresolved ?? 0) + unresolved,
  });
}

function acceptResourceReceipt(receipts: Map<string, PolicySemanticReceipt>, receipt: Record<string, unknown>): void {
  exactKeys(receipt, RESOURCE_RECEIPT_KEYS, "policy receipt");
  const source = requiredText(receipt["source"], "policy receipt source");
  const resources = assertCount(receipt["resources"], "policy receipt resources");
  const unresolved = assertCount(receipt["unresolved"] ?? 0, "policy receipt unresolved");
  const key = JSON.stringify(["resource", source]);
  const prior = receipts.get(key);
  receipts.set(key, {
    kind: "resource",
    source,
    resources: (prior?.kind === "resource" ? prior.resources : 0) + resources,
    unresolved: (prior?.unresolved ?? 0) + unresolved,
  });
}

export function acceptReceipt(receipts: Map<string, PolicySemanticReceipt>, value: unknown): void {
  const receipt = receiptRecord(value);
  if (receipt["kind"] === "population") {
    acceptPopulationReceipt(receipts, receipt);
    return;
  }
  if (receipt["kind"] === "resource") {
    acceptResourceReceipt(receipts, receipt);
    return;
  }
  throw new Error(`policy receipt has invalid discriminant ${JSON.stringify(receipt["kind"])}`);
}
