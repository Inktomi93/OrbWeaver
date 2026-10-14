// Complete SQLite lexical observations; consumers own syntax and authorization judgments.
export const SQLITE_TOKEN_KINDS = ["word", "number", "punct", "operator", "quoted-identifier", "string", "comment", "hole", "other"] as const;
export type SqliteTokenKind = (typeof SQLITE_TOKEN_KINDS)[number];

export interface SqliteToken {
  readonly kind: SqliteTokenKind;
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export interface SqliteLexical {
  readonly tokens: readonly SqliteToken[];
  readonly complete: boolean;
}
