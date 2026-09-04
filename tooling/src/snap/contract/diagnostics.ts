export interface DiagnosticQuery {
  readonly level: "verbose" | "info" | "warning" | "error" | null;
  readonly source: string | null;
  readonly category: string | null;
  readonly text: string | null;
  readonly page: number | null;
  readonly window: "current" | number | null;
}
