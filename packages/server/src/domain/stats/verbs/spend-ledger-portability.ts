// The spend ledger travels as one file per owner. Export writes nothing for an owner with no entries; import adds
// only the entries this box lacks, and the bundle's closing stats rebuild folds them.

import type { PortableFile, PortableImportOutcome } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import { portableParseError } from "#primitives/serde/lib";
import { buildSpendLedger, parseSpendLedger, SPEND_LEDGER_SCHEMA_KIND } from "#primitives/serde/spend-ledger";
import type { SpendLedgerPortabilityService } from "../contract/portability.ts";
import type { StatsContext } from "../contract/service.ts";
import { readOwnedSpendLedger, writeImportedSpendLedger } from "../persistence/spend-ledger-portability.ts";

const SPEND_LEDGER_FILE = "ledger.json";

export function createSpendLedgerPortability(ctx: Pick<StatsContext, "db" | "idSource">): SpendLedgerPortabilityService {
  return {
    exportAll: async function* exportAll(ownerId: UserId): AsyncIterable<PortableFile> {
      const ledger = await readOwnedSpendLedger(ctx.db, ownerId);
      if (ledger.entries.length > 0) {
        yield { filename: SPEND_LEDGER_FILE, bytes: buildSpendLedger(ledger) };
      }
    },
    importFile: async (ownerId, file): Promise<PortableImportOutcome> => {
      const parsed = parseSpendLedger(file.bytes);
      if (!parsed.ok) {
        return { ok: false, error: `${portableParseError(SPEND_LEDGER_SCHEMA_KIND, parsed.reason)} (${file.filename})` };
      }
      const added = await writeImportedSpendLedger(ctx.db, ownerId, parsed.value, ctx.idSource);
      return { ok: true, created: added > 0 };
    },
  };
}
