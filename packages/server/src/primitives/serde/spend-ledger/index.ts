// The one home for the spend-ledger file: an owner's priced calls with no canon row of their own, id-less and
// owner-less. Entries are written in time order, so one ledger always builds the same bytes.

import { SPEND_LEDGER_SCHEMA_KIND } from "@orb/contracts/portability";
import type { PortableSpendLedger } from "@orb/contracts/stats";
import { portableSpendLedgerSchema } from "@orb/contracts/stats";
import { z } from "zod";
import { defineJsonObjectSerde } from "#primitives/serde/lib";

export { SPEND_LEDGER_SCHEMA_KIND } from "@orb/contracts/portability";

const SPEND_LEDGER_SCHEMA_VERSION = 1;

function canonicalLedger(ledger: PortableSpendLedger): PortableSpendLedger {
  const parsed = portableSpendLedgerSchema.parse(ledger);
  return {
    entries: parsed.entries.toSorted((a, b) => a.createdAt - b.createdAt || a.kind.localeCompare(b.kind) || a.costUsd - b.costUsd),
  };
}

const serde = defineJsonObjectSerde<PortableSpendLedger, PortableSpendLedger>({
  schemaKind: SPEND_LEDGER_SCHEMA_KIND,
  schemaVersion: SPEND_LEDGER_SCHEMA_VERSION,
  bodySchema: portableSpendLedgerSchema
    .safeExtend({ schemaKind: z.literal(SPEND_LEDGER_SCHEMA_KIND), schemaVersion: z.int().positive() })
    .transform(({ entries }): PortableSpendLedger => ({ entries })),
  toWire: canonicalLedger,
  fromWire: canonicalLedger,
});

export const buildSpendLedger = serde.build;
export const parseSpendLedger = serde.parse;
