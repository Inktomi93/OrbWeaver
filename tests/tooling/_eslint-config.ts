// A resolved flat config read off `ESLint#calculateConfigForFile`, which types its result `any`. Each piece is
// checked as it is read, so a probe that feeds it to `Linter` gets the repo's rule levels and plugins or a throw.
import type { ESLint, Linter } from "eslint";

export interface ResolvedConfig {
  readonly plugins: Record<string, ESLint.Plugin>;
  readonly rules: Linter.RulesRecord;
  readonly settings: Record<string, unknown>;
  readonly languageOptions: Linter.LanguageOptions;
}

const LEVELS: readonly unknown[] = [0, 1, 2, "off", "warn", "error"];

function isLevel(value: unknown): value is Linter.RuleSeverity {
  return LEVELS.includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ruleEntry(rule: string, value: unknown): Linter.RuleEntry {
  if (isLevel(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    const level: unknown = value[0];
    if (isLevel(level)) {
      return [level, ...value.slice(1)];
    }
  }
  throw new Error(`Rule ${rule} resolved to an unreadable entry: ${JSON.stringify(value)}`);
}

function recordOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/** The plugins, rule entries, settings and language options ESLint resolves for a file. An ignored file has no config and reads as empty. */
export async function resolvedConfig(eslint: Pick<ESLint, "calculateConfigForFile">, filePath: string): Promise<ResolvedConfig> {
  const config = recordOf(await eslint.calculateConfigForFile(filePath));
  const plugins: Record<string, ESLint.Plugin> = {};
  for (const [name, plugin] of Object.entries(recordOf(config["plugins"]))) {
    if (isRecord(plugin)) {
      plugins[name] = plugin;
    }
  }
  const rules: Linter.RulesRecord = {};
  for (const [name, entry] of Object.entries(recordOf(config["rules"]))) {
    rules[name] = ruleEntry(name, entry);
  }
  return { plugins, rules, settings: recordOf(config["settings"]), languageOptions: recordOf(config["languageOptions"]) };
}

/** A rule entry's severity: the entry itself, or the first element of its `[severity, ...options]` form. */
export function levelOf(entry: Linter.RuleEntry | undefined): Linter.RuleSeverity | undefined {
  return Array.isArray(entry) ? entry[0] : entry;
}
