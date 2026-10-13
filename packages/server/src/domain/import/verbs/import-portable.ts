import type { PortableImportOutcome } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import type { OwnerImportDeps, PortableImportDeps, PortableImports } from "../contract/portable.ts";
import type { ImportService } from "../contract/service.ts";
import { createImportService } from "../service.ts";
import { buildImportContext } from "../substrate/build-context.ts";

async function ownerImport(deps: OwnerImportDeps, ownerId: UserId): Promise<ImportService> {
  const principal = await deps.resolveOwnerPrincipal(ownerId);
  return createImportService(
    buildImportContext({
      ...deps.contextFor(principal),
      principal,
      profile: { ...deps.profile, stWallClockZone: deps.wallClockZone(), personaByUserName: new Map() },
    }),
  );
}
function errorOutcome(err: unknown): PortableImportOutcome {
  return { ok: false, error: err instanceof Error ? err.message : String(err) };
}

/** Portable import outcomes isolate malformed files while preserving each owner's refusal and lossiness. */
export function createPortableImports(deps: PortableImportDeps): PortableImports {
  return {
    tag: async (ownerId, file): Promise<PortableImportOutcome> => {
      try {
        const { created } = await deps.tags(ownerId, file.bytes);
        return { ok: true, created: created > 0 };
      } catch (err) {
        return errorOutcome(err);
      }
    },
    regex: async (ownerId, file): Promise<PortableImportOutcome> => {
      try {
        const { created } = await deps.regex({ ownerId, bytes: file.bytes });
        return { ok: true, created };
      } catch (err) {
        return errorOutcome(err);
      }
    },
    databank: async (ownerId, file): Promise<PortableImportOutcome> => {
      try {
        const outcome = await deps.document({ ownerId, bytes: file.bytes });
        return outcome.ok ? { ok: true, created: outcome.created } : { ok: false, error: outcome.error };
      } catch (err) {
        return errorOutcome(err);
      }
    },
    persona: async (ownerId, file): Promise<PortableImportOutcome> => {
      try {
        const principal = await deps.resolveOwnerPrincipal(ownerId);
        const outcome = await deps.persona.import({ principal, bytes: file.bytes });
        return outcome.ok ? { ok: true, created: outcome.created } : { ok: false, error: outcome.error };
      } catch (err) {
        return errorOutcome(err);
      }
    },
    character: async (ownerId, file): Promise<PortableImportOutcome> => {
      try {
        const service = await ownerImport(deps, ownerId);
        const result = await service.importCharacter({ card: { bytes: file.bytes, filename: file.filename } });
        return { ok: true, created: result.created, ...(result.skippedOverlays.length > 0 ? { notes: result.skippedOverlays } : {}) };
      } catch (err) {
        return errorOutcome(err);
      }
    },
    chat: async (ownerId, file): Promise<PortableImportOutcome> => {
      try {
        const service = await ownerImport(deps, ownerId);
        const outcome = await service.importChatFile({ filename: file.filename, bytes: file.bytes });
        return outcome.ok
          ? {
              ok: true,
              created: outcome.created,
              ...(outcome.skippedOverlays.length > 0 ? { notes: outcome.skippedOverlays } : {}),
              ...(outcome.memoryChatIds.length > 0 ? { memoryChatIds: outcome.memoryChatIds } : {}),
            }
          : { ok: false, error: outcome.error };
      } catch (err) {
        return errorOutcome(err);
      }
    },
  };
}
