// Structured population and limit metadata for a validated HAR. Kept separate from the CDP-to-HAR
// serializer because this recursive inventory is a different concern and the serializer is a hard-size
// tooling file.
import type { InstrumentArtifactLimitReceipt } from "../../_shared/artifact-out.ts";
import { browserEvidenceRetentionBatchSchema } from "../../_shared/browser-evidence-ring.ts";

export interface NetworkHarWriteReceipt {
  readonly entries: number;
  readonly contexts: readonly number[];
  readonly pages: readonly { readonly context: number; readonly page: number }[];
  readonly limits: readonly InstrumentArtifactLimitReceipt[];
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

function finiteNumber(value: unknown, key: string): number {
  const found = field(value, key);
  return typeof found === "number" && Number.isFinite(found) ? found : -1;
}

function measuredLimitEvents(record: Readonly<Record<string, unknown>>): InstrumentArtifactLimitReceipt["events"] {
  const measured = record["_orbMeasuredLimit"];
  if (measured === undefined || measured === null) {
    return [];
  }
  if (typeof measured !== "object") {
    throw new Error("INSTRUMENT ERROR: HAR measured-limit receipt is not an object");
  }
  const hasEvents = Object.hasOwn(measured, "events");
  const rawEvents = field(measured, "events");
  if (hasEvents && !Array.isArray(rawEvents)) {
    throw new Error("INSTRUMENT ERROR: HAR measured-limit receipt has no events array");
  }
  if (!hasEvents) {
    const inputBytes = field(measured, "inputBytes");
    const retainedBytes = field(measured, "retainedBytes");
    const truncated = field(measured, "truncated");
    if (
      (inputBytes === null || (typeof inputBytes === "number" && Number.isFinite(inputBytes))) &&
      typeof retainedBytes === "number" &&
      Number.isFinite(retainedBytes) &&
      typeof truncated === "boolean"
    ) {
      return [];
    }
    throw new Error("INSTRUMENT ERROR: HAR measured-limit receipt has an unrecognized shape");
  }
  if (!Array.isArray(rawEvents)) {
    throw new Error("INSTRUMENT ERROR: HAR measured-limit receipt has no events array");
  }
  return rawEvents.map((event, index) => {
    const kind = field(event, "kind");
    const path = field(event, "path");
    const original = field(event, "original");
    const retained = field(event, "retained");
    const omitted = field(event, "omitted");
    if (
      typeof kind !== "string" ||
      typeof path !== "string" ||
      !(original === null || typeof original === "number") ||
      !(retained === null || typeof retained === "number") ||
      !(omitted === null || typeof omitted === "number")
    ) {
      throw new Error(`INSTRUMENT ERROR: HAR measured-limit event ${String(index)} is malformed`);
    }
    return { kind, path, original, retained, omitted };
  });
}

function limitEvent(value: unknown, path: string, fallback: string): InstrumentArtifactLimitReceipt["events"][number] | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const retained = Reflect.get(value, "limitBytes");
  return {
    kind: String(Reflect.get(value, "reason") ?? fallback),
    path,
    original: null,
    retained: typeof retained === "number" ? retained : null,
    omitted: null,
  };
}

function collectLimitEvents(value: unknown, path: string, events: InstrumentArtifactLimitReceipt["events"][number][]): void {
  if (Array.isArray(value)) {
    for (const [index, member] of value.entries()) {
      collectLimitEvents(member, `${path}[${String(index)}]`, events);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const record = value as Readonly<Record<string, unknown>>;
  events.push(...measuredLimitEvents(record));
  const collection = limitEvent(record["_orbCollectionLimit"], path, "collection-limit");
  const omission = limitEvent(record["_orbOmission"], path, "omission");
  if (collection !== null) {
    events.push(collection);
  }
  if (omission !== null) {
    events.push(omission);
  }
  for (const [key, member] of Object.entries(record)) {
    if (key !== "_orbMeasuredLimit" && key !== "_orbCollectionLimit" && key !== "_orbOmission") {
      collectLimitEvents(member, `${path}.${key}`, events);
    }
  }
}

export function networkHarReceipt(har: unknown): NetworkHarWriteReceipt {
  const log = field(har, "log");
  const entries = field(log, "entries");
  if (!Array.isArray(entries)) {
    throw new Error("INSTRUMENT ERROR: HAR log has no entries array");
  }
  const contexts = new Set<number>();
  const pages = new Map<string, { readonly context: number; readonly page: number }>();
  const events: InstrumentArtifactLimitReceipt["events"][number][] = [];
  for (const candidate of entries) {
    const orb = field(candidate, "_orb");
    const context = finiteNumber(orb, "contextIndex");
    const page = finiteNumber(orb, "pageIndex");
    if (context < 0 || page < 0) {
      throw new Error("INSTRUMENT ERROR: HAR entry has no finite context/page identity");
    }
    contexts.add(context);
    pages.set(`${String(context)}:${String(page)}`, { context, page });
  }
  collectLimitEvents(har, "$har", events);
  const rawRetention = field(log, "_orbRetention");
  const retention = browserEvidenceRetentionBatchSchema.safeParse(rawRetention);
  if (rawRetention !== undefined && !retention.success) {
    throw new Error("INSTRUMENT ERROR: HAR browser retention receipt is malformed");
  }
  return {
    entries: entries.length,
    contexts: [...contexts].sort((left, right) => left - right),
    pages: [...pages.values()].sort((left, right) => left.context - right.context || left.page - right.page),
    limits: [
      { source: "har-redaction-and-body-collection", complete: events.length === 0, policy: null, events },
      ...(retention.success ? retention.data.limits : []),
    ],
  };
}
