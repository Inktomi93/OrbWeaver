// Validates `manifest.json` through the contracts' own manifest schema and the membrane majors the host serves,
// the checks the install funnel runs on the bytes it receives.
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, pluginManifestSchema } from "@orb/contracts/plugin";
import type { PluginAuthorDiagnostic } from "./contract/index.ts";

export interface CheckedManifest {
  /** Present only when every check passed. */
  readonly manifest: PluginManifest | undefined;
  readonly diagnostics: readonly PluginAuthorDiagnostic[];
}

function refusal(file: string, message: string): CheckedManifest {
  return { manifest: undefined, diagnostics: [{ file, line: 1, column: 1, message }] };
}

export function checkManifest(file: string, bytes: Uint8Array): CheckedManifest {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    return refusal(file, `manifest.json is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = pluginManifestSchema.safeParse(json);
  if (!parsed.success) {
    return {
      manifest: undefined,
      diagnostics: parsed.error.issues.map((issue) => ({
        file,
        line: 1,
        column: 1,
        message: `manifest.json ${issue.path.join(".") || "(root)"}: ${issue.message}`,
      })),
    };
  }
  if (!PLUGIN_HOST_VERSIONS.some((served) => served === parsed.data.hostVersion)) {
    return refusal(file, `manifest.json hostVersion ${parsed.data.hostVersion} is not served; the host serves ${PLUGIN_HOST_VERSIONS.join(", ")}`);
  }
  return { manifest: parsed.data, diagnostics: [] };
}
