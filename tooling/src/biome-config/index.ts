import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runNicedSync } from "../floor/process/proc.ts";
import { BIOME_POLICY } from "./policy.config.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const NON_ASCII = /[\u0080-\uffff]/gu;
const HEX_RADIX = 16;
const HEX_CODE_UNIT_WIDTH = 4;

/** Render only the authored policy, validated and formatted by the installed native Biome. */
export function renderBiomeConfig(): string {
  const scratch = mkdtempSync(join(tmpdir(), "orb-biome-config-"));
  try {
    const config = join(scratch, "biome.json");
    const source = JSON.stringify(BIOME_POLICY, null, BIOME_POLICY.formatter.indentWidth).replaceAll(
      NON_ASCII,
      (character) => `\\u${character.charCodeAt(0).toString(HEX_RADIX).padStart(HEX_CODE_UNIT_WIDTH, "0")}`,
    );
    writeFileSync(config, source);
    const formatted = runNicedSync(
      join(REPO_ROOT, "node_modules", ".bin", "biome"),
      ["format", `--config-path=${config}`, "--stdin-file-path=biome.json", "--vcs-enabled=false"],
      { cwd: scratch, input: source },
    );
    if (formatted.status !== 0) {
      throw new Error(`Biome configuration generation failed (${formatted.errorCode ?? formatted.signal ?? formatted.status}): ${formatted.stderr}`);
    }
    return formatted.stdout;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Check without changing the artifact, or explicitly replace it with the generated native configuration. */
export function syncBiomeConfig(mode: "--check" | "--write", target = join(REPO_ROOT, "biome.json")): boolean {
  const rendered = renderBiomeConfig();
  if (mode === "--write") {
    writeFileSync(target, rendered);
    return true;
  }
  return existsSync(target) && readFileSync(target, "utf8") === rendered;
}
