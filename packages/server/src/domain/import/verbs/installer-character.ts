// Plugin identity is provenance only; both byte forms run the same parser and owner-gated import funnel.
import type { InstallerCharacterImportDeps, RunInstallerCharacterImport } from "../contract/installer-character.ts";
import { createImportService } from "../service.ts";

export function createInstallerCharacterImport(deps: InstallerCharacterImportDeps): RunInstallerCharacterImport {
  return async (installerUserId, bytes, pluginId): ReturnType<RunInstallerCharacterImport> => {
    const principal = await deps.resolvePrincipal(installerUserId);
    const { characterId, created } = await createImportService(deps.contextFor(principal)).importCharacter({
      card: { bytes, ...(pluginId === null ? {} : { pluginId }) },
    });
    return { characterId, created };
  };
}
/** The JSON-safe guest card is still untrusted; validation occurs in the ordinary import parser. */
export function serializeImportCard(card: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(card));
}
