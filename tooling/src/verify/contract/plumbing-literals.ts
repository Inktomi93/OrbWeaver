// What `lib/plumbing-literals.ts` answers the two runner-config literal laws with (#1988).
// `gates/tooling-runner-config-literals.ts` narrows the read (`unparseable` REFUSES, `ok` reports each
// literal) and prints each row's `token`/`label`, so both shapes cross the lib↔policy boundary and `lib/`
// is not a type home (Spine-TypeScript-and-Patterns.md §7.4, Core-Tooling-Law.md §2.5).

export interface RunnerConfigLiteral {
  readonly kind: "port" | "clock";
  readonly line: number;
  /** The literal's exact text — the finding token. */
  readonly token: string;
  readonly label: string;
}

export type RunnerConfigRead =
  | { readonly kind: "unparseable"; readonly detail: string }
  | { readonly kind: "ok"; readonly literals: readonly RunnerConfigLiteral[] };
