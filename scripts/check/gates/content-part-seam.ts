// Gate: content-part-seam (D51 — the multimodal content-part shape is threaded at the engine WIRE SEAM,
// content stays a `string` everywhere upstream). `ChatContentPart` (home: `@orb/contracts/chat`) is
// PRODUCED exactly once — at the engine request seam (`domain/chat/engine/pipeline.ts`, where each shaped
// string row is tokenized → image refs resolved → parts) — and CONSUMED only by `infra/providers/**` (the
// sealed runners mapping parts onto each backend's wire). Everything upstream (assemble/shape, verbs, the
// rest of `domain/chat`, transport) stays `content: string` — the wasteful "content-parts everywhere"
// retrofit D51 explicitly avoids. Enforced as the sanctioned-importer allowlist on the symbol: a
// `ChatContentPart` import from a file outside the seam set is RED (an upstream module reaching for parts).
import type { SourceFile } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const SYMBOL = "ChatContentPart";
const CONTRACTS_CHAT = /^@orb\/contracts\/chat(?:\/|$)/u;
// Production source only — the seam rule governs the runtime dependency graph; the centralized `tests/`
// mirror legitimately imports the contract type to test it.
const PROD_SRC = /\/packages\/[^/]+\/src\//u;

/** Files sanctioned to import `ChatContentPart` — the seam producer + the request DTO it fills + the
 *  infra consumers + the contracts home. */
const SANCTIONED = [
  // The contracts home (declares it) — matched loosely (the whole chat namespace).
  /\/packages\/contracts\/src\/chat\//u,
  // The infra consumers: the sealed runner tier maps parts onto each backend wire.
  /\/packages\/server\/src\/infra\/providers\//u,
  // The engine request SEAM — the ONE producer (D51).
  /\/packages\/server\/src\/domain\/chat\/engine\/pipeline\.ts$/u,
  // The domain-side request DTO the seam populates (content: ChatContentPart[] handed to the runner).
  /\/packages\/server\/src\/domain\/chat\/contract\/results\.ts$/u,
] as const;

const MESSAGE =
  "`ChatContentPart` is imported outside the D51 seam set (the engine producer `domain/chat/engine/" +
  "pipeline.ts` · the request DTO `domain/chat/contract/results.ts` · the infra/providers consumers · the " +
  "@orb/contracts/chat home) — content-parts are produced ONCE at the engine request seam and everything " +
  "upstream stays `content: string`. See Core-Path-Registry-D44-D52.md D51.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** `ChatContentPart` named imports from `@orb/contracts/chat` in one file (value or type-only). */
function contentPartImportLines(sf: SourceFile): number[] {
  const lines: number[] = [];
  for (const decl of sf.getImportDeclarations()) {
    if (!CONTRACTS_CHAT.test(decl.getModuleSpecifierValue())) {
      continue;
    }
    for (const named of decl.getNamedImports()) {
      if (named.getName() === SYMBOL) {
        lines.push(named.getStartLineNumber());
      }
    }
  }
  return lines;
}

export const contentPartSeam: Check = {
  name: "content-part-seam",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!PROD_SRC.test(path)) {
        continue;
      }
      if (SANCTIONED.some((re) => re.test(path))) {
        continue;
      }
      const rel = relPath(root, path);
      for (const line of contentPartImportLines(sf)) {
        violations.push({ file: rel, line, message: MESSAGE });
      }
    }
    return violations;
  },
};
