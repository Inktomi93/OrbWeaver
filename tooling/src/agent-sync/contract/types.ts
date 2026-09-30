// agent-sync's shapes: the parsed Claude role manifest the Codex TOML is rendered from.
export interface ClaudeAgent {
  readonly body: string;
  readonly description: string;
  readonly effort: string;
  readonly name: string;
  readonly skills: readonly string[];
}

/** The Codex cache fields required to resolve and validate role models. */
export interface ModelCatalog {
  readonly fetchedAt: string;
  readonly models: readonly {
    readonly slug: string;
    readonly visibility: string;
    readonly supportedReasoningLevels: readonly { readonly effort: string }[];
  }[];
}

/** Codex role model families supported by this mirror. */
export const MODEL_FAMILIES = ["sol", "astra", "luna"] as const;
export type ModelFamily = (typeof MODEL_FAMILIES)[number];

export interface AgentPaths {
  readonly claudeAgents: string;
  readonly claudeSkills: string;
  readonly codexAgents: string;
  readonly codexSkills: string;
}

export interface AgentSyncResult {
  readonly roles: number;
  readonly fetchedAt: string;
}

/** A rule file's `paths:` frontmatter. The YAML list form is the one accepted spelling; a missing key
 *  makes Claude load the rule every session. */
export type RulePaths = { readonly kind: "list"; readonly globs: readonly string[] } | { readonly kind: "inline" } | { readonly kind: "missing" };
