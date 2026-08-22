// agent-sync's shapes: the parsed Claude role manifest the Codex TOML is rendered from.
export interface ClaudeAgent {
  readonly body: string;
  readonly description: string;
  readonly effort: string;
  readonly name: string;
  readonly skills: readonly string[];
}
