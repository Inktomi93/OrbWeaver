// The declaration-identity keys — the leaf both the liveness build and the edge map hang off
// (split to its own module at P4 to keep lib/liveness <-> lib/edges acyclic).
import type { Node, SourceFile } from "ts-morph";
import { KEY_SEP } from "./root.ts";

// ── Resolution-based liveness (the substrate for orphans + testonly) ──────────────────────────
// The rot lenses answer "is this (declaring-file, export) reached by anyone?" — keyed on RESOLVED
// identity, never bare name. A bare-name lens both over-reports (same-file use invisible; the ~170
// exported *Props class) and MISSES real dead code on name collisions (three `requireParticipant`s,
// two `MemoryLogEntry`s) — see the 2026-07-17 knip-testonly-liveness stickler report §6.
//
// THE KEYING RULE (one rule, both sides): a candidate export and every consumer of it key on the
// ORIGIN DECLARATION NODE — `<declaration's file>` + `<declaration's start offset>` — never on a NAME.
// `getExportedDeclarations()` follows re-export hops to the ORIGIN decl, so a symbol surfaced through N
// barrels still keys to one home; keying on the NODE means an alias on any hop cannot fork that home.
// A name cannot serve as the key half: a renaming barrel (`export { createCreate as createCreateBook }
// from "./create"` — the world-info/portability verb groups) hands the consumer side the ALIAS while the
// candidate side holds the origin's own name, and `export { Inner as Outer }` forks it inside one file.
// That mismatch reported 15 wired verbs as orphans (2026-08-02). The declaration node is the only
// identity BOTH sides observe identically (verified: barrel and origin resolve `createCreateBook` and
// `createCreate` to the same FunctionDeclaration at the same offset). Displayed names still come from
// the origin file's own export map — what a reader should go look for.
//
// WHY THERE IS NO REGISTRY SPECIAL-CASE (investigated 2026-08-03; do not re-litigate without new evidence).
// The repo's string-keyed dispatch tables (the client chrome/modal/section/settings-pane/home-tile
// contributor registries, `TEMPLATE_DEFS`, the 16 `as const satisfies Record<…>` maps across contracts/kit/
// server/ui) look like a consumption seam import-liveness cannot see — they are not. A registry property
// VALUE is either (a) an identifier IMPORTED into the registry file, which `markNamedAlive` resolves to the
// ORIGIN declaration and keys alive, or (b) declared in the same file, which `isReferencedInOwnFile` keeps
// alive. Receipt: `orphans client` reports ZERO — the package where every one of those registries lives.
// A marking pass over registry values could therefore only re-mark already-alive origins, i.e. add a
// false-NEGATIVE surface for nothing.
// THE BOUNDARY CONDITION — this holds ONLY while registry values are inline literals or imported
// identifiers. A registry that resolves its members from a CONSTRUCTED string breaks the guarantee:
// a template-literal dynamic import (`import(\`./features/${name}.ts\`)` — `resolveModule` reads string
// LITERALS only; there are currently ZERO such sites in packages/*/src) or a string-keyed module map that
// names files rather than importing them. The day one lands, the registry-value marking pass is the fix.
//
// THE ERR-ALIVE ARM AND ITS COST (the `swallowed` lens's whole reason to exist). Two consumption arms mark a
// module's ENTIRE export surface alive without naming a single member: `import * as ns` (markModuleAlive) and
// a dynamic `import()`. That is deliberate — a namespace object can be indexed at runtime in ways no static
// pass can enumerate, so erring alive is the only honest verdict for the LIVENESS sets. But it hides rot: db's
// `drizzle(client, { schema })` (packages/db/src/client/index.ts) hands the whole `#schema` namespace to a
// library, which kept the functionally-unused `usersRelations` reading as consumed for five weeks. So liveness
// records, IN PARALLEL, WHICH arm marked each key (`Liveness.arms`) plus every namespace-import SITE and the
// export names it exposes (`Liveness.namespaceSites`). Neither changes a liveness verdict — orphans/testonly/
// clientgap/the ratchet still read the same sets they always did. They exist so `swallowed` can ask the
// narrower question the sets cannot: "is `namespace` this key's ONLY arm, and does no swallowing file ever
// spell the member's name?" EXPIRY: the arm record is only as complete as `markImportConsumption` — a new
// consumption arm (a `require`, a registry-value marking pass, an `export * as ns` treated as consumption)
// MUST record its own arm there, or every key it marks becomes a false swallowed candidate.
/** `<declFile>` + `<declStart>` — the identity a candidate export and every consumer of it agree on. */
export function declKey(decl: Node): string {
  return `${decl.getSourceFile().getFilePath()}${KEY_SEP}${decl.getStart()}`;
}

/** origin-key → the export NAME(s) `target` surfaces it under. The inverse of `getExportedDeclarations()`,
 *  which is keyed by NAME: a namespace consumer writes `ns.<the barrel's name>`, so the swallowed lens needs
 *  the barrel's spelling for a key it identifies by declaration node. (A key can carry several names — a
 *  barrel may re-export the same declaration twice under different aliases.) */
export function exposedNames(target: SourceFile): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [name, decls] of target.getExportedDeclarations()) {
    for (const d of decls) {
      const key = declKey(d);
      out.set(key, [...(out.get(key) ?? []), name]);
    }
  }
  return out;
}
