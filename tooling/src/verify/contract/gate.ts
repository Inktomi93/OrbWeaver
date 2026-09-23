// THE SHARED EXEMPTION + FINDING VOCABULARY — what survives of the legacy single-pass gate contract after
// the #2176 Phase F cutover retired its runtime (the `GateDescriptor` interface, `GateRunCtx`, `GateExample`,
// `GateScanDeclaration`, `Scope`, `GateStatus` and `ScopeSafety` were deleted with `lib/pass.ts` on
// 2026-09-14). Three shapes are left and none of them is a descriptor:
//   `Finding`        — the coordinate shape `lib/grant-liveness.ts` still produces for its config-liveness
//                      consumers (`biome-grant-liveness`, `depcruise-grant-liveness`, `tsconfig-entry-liveness`,
//                      `runner-config-path-liveness`), which map it onto `ctx.report.*`;
//   `ExemptionRow` / `ExemptionTable` — the canonical exemption vocabulary.
//
// THE FILENAME IS LOAD-BEARING AND IS NOT A LEFTOVER. `gates/policy-legacy-imports.ts` keys ARM A on
// `contract/gate.ts` as a FORBIDDEN IMPORT HOME (a gate module receives no grant table,
// docs/law/gate-runtime-standardization.md §12.5) and ARM D on the EXACT path
// `/tooling/src/verify/contract/gate.ts` as the type identity of `ExemptionTable`/`ExemptionRow`. Moving
// these two declarations would retire that arm's real-tree subject, which is enforcement, not tidiness —
// so the ruling survives and its INPUT changed: the home stays, the descriptor went.
//
// AND THE HOME IS A KNOWN RESIDUE, NOT A DESTINATION. `ExemptionTable` as a row type any gate-adjacent
// module can reach is still the #1922 / #2147 RETYPE obligation: each surviving table migrates to exact
// reviewed grants keyed on `(subject, operation)`, or gets a per-subject row interface of its own. When the
// last carrier is retyped this file has no consumer left and goes with it. Do not read its survival as a
// sanctioned place to declare a new exemption table.

/** A single-pass finding — one per distinct violation instance (a class-string gate emits one per
 *  offending token, not one per className). The reason lives once on the policy
 *  (`message`/`fix`); a Finding never repeats prose. `message`/`fix` here are per-occurrence overrides
 *  for the rare finding whose text varies (e.g. a stale-registry arm naming the dead entry). */
export interface Finding {
  readonly file: string; // repo-relative, posix — the jump-link path
  readonly line: number; // 1-based, FROM THE NODE. 0 only for genuinely file-level findings.
  readonly column: number; // 1-based, FROM THE NODE. 0 for file-level findings.
  readonly token?: string; // the exact offending lexeme (the class token / identifier / import name)
  readonly message?: string; // per-occurrence override; normally OMITTED — the reason lives on the gate
  readonly fix?: string; // per-occurrence override; normally OMITTED — the fix lives on the gate
}

/** ONE exemption row — the shared shape for every allowlist / sanctioned-home / deferred-debt table a gate
 *  carries. `why` is MANDATORY and TYPE-enforced: an exemption that cannot say why it exists is a rubber
 *  stamp, and one that cannot say what would END it is permanent by accident. Write the END CONDITION into
 *  the reason. The full law (and the mandatory STALE arm every table also owes) is
 *  `tooling/src/verify/gates/GATE-AUTHORING.md` §"The exemption grammar".
 *
 *  Widen it per gate by intersection, never by re-declaring a parallel shape:
 *  `Record<string, ExemptionRow & { readonly owners: readonly string[] }>` (own-tables-only.ts's
 *  SCHEMA_OWNERS is the archetype). */
export interface ExemptionRow {
  /** Why this exemption is granted AND the condition that would end it. Never empty. */
  readonly why: string;
}

/** A keyed exemption table: the KEY is the thing exempted (a repo-relative path, a domain name, a table
 *  name, a settings key); the VALUE carries the reason. Every table declared with this type owes a stale
 *  arm — a row matching zero live sites must be RED, not silence (tooling/src/verify/gates/GATE-AUTHORING.md §"The exemption
 *  grammar"). Kept as an alias rather than a branded type so a gate can widen the row by intersection. */
export type ExemptionTable<Row extends ExemptionRow = ExemptionRow> = Readonly<Record<string, Row>>;
