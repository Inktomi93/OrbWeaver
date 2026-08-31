// Shared builders for the gate's exact-census and shell-producer controls.
import { CLIENT_GLOBALS, SHELL, THEME, TIERS, UI_GLOBALS } from "../contract/css-family.ts";

interface CensusControlCounts {
  readonly themeDirect: number;
  readonly themeRules: number;
  readonly ui: number;
  readonly tiers: number;
  readonly client: number;
  readonly shell: number;
}

function controlDeclarations(prefix: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `  --${prefix}-${index}: 0;`).join("\n");
}

/** A complete five-home fixture with independently specified declaration counts. The controls below spell
 * the production baseline as literals instead of deriving their oracle from the gate's manifest. */
export function shellClassProducer(...classes: readonly string[]): string {
  return `export const shellProbe = <div className=${JSON.stringify(classes.join(" "))} />;\n`;
}

export function censusControlFiles(counts: CensusControlCounts): Record<string, string> {
  return {
    [THEME]:
      `@theme {\n${controlDeclarations("theme-probe", counts.themeDirect)}\n}\n` +
      `:root {\n${controlDeclarations("theme-rule-probe", counts.themeRules)}\n}\n`,
    [UI_GLOBALS]: `:root {\n${controlDeclarations("ui-probe", counts.ui)}\n}\n`,
    [TIERS]: `[data-surface-tier="base"] {\n${controlDeclarations("tier-probe", counts.tiers)}\n}\n`,
    [CLIENT_GLOBALS]: `:root {\n${controlDeclarations("client-probe", counts.client)}\n}\n`,
    [SHELL]: `.shell-grid {\n${controlDeclarations("shell-probe", counts.shell)}\n}\n`,
    "packages/client/src/features/app-shell/probe.tsx": shellClassProducer("shell-grid"),
  };
}
