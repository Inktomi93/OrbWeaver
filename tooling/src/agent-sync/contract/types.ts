// agent-sync's shapes: the parsed Claude role manifest the Codex TOML is rendered from.
export interface ClaudeAgent {
  readonly body: string;
  readonly description: string;
  readonly effort: string;
  readonly name: string;
  readonly skills: readonly string[];
}

/** A rule file's `paths:` frontmatter. The YAML list form is the one accepted spelling; a missing key
 *  makes Claude load the rule every session. */
export type RulePaths = { readonly kind: "list"; readonly globs: readonly string[] } | { readonly kind: "inline" } | { readonly kind: "missing" };
