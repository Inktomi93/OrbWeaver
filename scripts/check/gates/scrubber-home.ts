// Gate: scrubber-home (security — the §3.6 member-strip trust boundary; ed2aafc5 "the cold-scrubber
// leak"). The hidden-span stream scrubber (`@orb/kit/content::createHiddenSpanStreamScrubber`) is
// STATEFUL over a slot's whole stream: a scrubber constructed anywhere but the producer stamp
// cold-starts mid-stream, and a reader that begins — or resumes — while a `<lie …/>` open is in flight
// sees no `<` in the tail and forwards the secret's bytes (worse, the withheld-open stall is an ORACLE
// telling a member exactly when to reconnect). Per-subscription scrub state cannot survive replay→live
// handoffs; the producer stamp is the ONE home. Construction (import OR call) outside the sanctioned
// producer home `packages/server/src/domain/chat/substrate/member-visibility.ts` is RED.
//
// CITED EXEMPTION (inside the home, so never flagged — recorded here as the standing verdict):
// `scrubStreamReplayForMember` (member-visibility.ts, called from chat/verbs/read.ts) still cold-starts
// a fresh per-slot scrubber over the durable SSE token log — an unwired token log; it needs the
// producer-stamp treatment IF ever wired (already cited on the board).
//
// Scope: every packages/**/src file except the kit definition module itself
// (packages/kit/src/content/index.ts) and the sanctioned home. Both arms fire per occurrence: the
// ImportSpecifier arm catches the honest import; the CallExpression arm (matched by NAME) catches a
// barrel re-export / local re-binding dodge. DECLARED BLIND SPOT: an aliased import
// (`createHiddenSpanStreamScrubber as x`) hides the call arm — the import arm still catches the
// ImportSpecifier itself, so the construction site is never silently green.
//
// TWO-SIDED (gate-hub #10): the seal ratchets DOWN — a SANCTIONED zone that no longer imports or calls the
// scrubber symbol is RED. Both zones are CLAIMS about where the stateful scrubber lives (the producer stamp
// + the kit definition); when a zone stops touching it, the row stops being a seal and becomes a standing
// permission for whatever moves in there next. The arm self-guards on a REAL-TREE ANCHOR (gate-hub #11) —
// the kit module that DEFINES the factory.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Finding, GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const SCRUBBER_SYMBOL = "createHiddenSpanStreamScrubber";
const KIT_CONTENT_SPECIFIER = /^@orb\/kit\/content(?:\/|$)/u;
const PACKAGES_SRC = /\/packages\/[^/]+\/src\//u;
/** The two sanctioned zones, named individually so the stale arm can name the dead one: the producer stamp
 *  (the ONE construction home) and the kit module that defines the factory. */
const SANCTIONED_ZONES: readonly RegExp[] = [/\/packages\/server\/src\/domain\/chat\/substrate\/member-visibility\.ts/u, /\/packages\/kit\/src\/content\//u];

const GATE_SELF = "scripts/check/gates/scrubber-home.ts";
/** Real-tree anchor (gate-hub #11): the kit module that DEFINES the scrubber factory. */
const ANCHOR = "packages/kit/src/content/index.ts";
const STALE_PREFIX =
  "stale SANCTIONED zone — nothing it matches declares, imports or calls the hidden-span scrubber any more, so the " +
  "zone is no longer a seal over anything: it is a standing permission for whatever moves in next " +
  "(ratchet down). Re-point it at the real producer home or delete it: ";

const MESSAGE =
  "hidden-span stream scrubber constructed outside its producer home — per-subscription scrub state cannot survive replay→live handoffs (a cold scrubber mid-`<lie>` forwards the secret's tail; ed2aafc5); the producer stamp is the one home: domain/chat/substrate/member-visibility.ts.";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** Arm 1: an ImportSpecifier of the scrubber factory from @orb/kit/content. */
function scrubberImport(node: Node): boolean {
  if (!node.isKind(SyntaxKind.ImportSpecifier) || node.getName() !== SCRUBBER_SYMBOL) {
    return false;
  }
  const decl = node.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
  return decl !== undefined && KIT_CONTENT_SPECIFIER.test(decl.getModuleSpecifierValue());
}

/** Arm 2: a `createHiddenSpanStreamScrubber(...)` call, matched by NAME (catches re-exports/rebinds). */
function scrubberCall(node: Node): boolean {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return false;
  }
  const callee = node.getExpression();
  return callee.getText() === SCRUBBER_SYMBOL;
}

/** Does this file still have a stake in the scrubber — importing it, calling it, or DECLARING it? The kit
 *  zone earns its sanction by being the factory's definition home, which is neither an import nor a call. */
function touchesScrubber(sf: SourceFile): boolean {
  const declares =
    sf.getFunction(SCRUBBER_SYMBOL) !== undefined ||
    sf.getVariableDeclaration(SCRUBBER_SYMBOL) !== undefined ||
    sf.getExportedDeclarations().has(SCRUBBER_SYMBOL);
  return declares || sf.getDescendants().some((n) => scrubberImport(n) || scrubberCall(n));
}

export const gate: GateDescriptor = {
  name: "scrubber-home",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) · member-visibility.ts §3.6 producer-stamp",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "read the already-stamped `memberText` (createMemberDeltaStamper, domain/chat/substrate/member-visibility.ts) — a read seam is a STATELESS field read; never build a scrubber of your own.",
  scanRoot: (p) => PACKAGES_SRC.test(`/${p}`) && !SANCTIONED_ZONES.some((zone) => zone.test(`/${p}`)),
  kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression],
  visit: (node, sf, ctx) => {
    if (!(scrubberImport(node) || scrubberCall(node))) {
      return;
    }
    const finding: Finding = {
      file: relPath(ctx.root, sf.getFilePath()),
      line: node.getStartLineNumber(),
      column: sf.getLineAndColumnAtPos(node.getStart()).column,
      message: MESSAGE,
      token: SCRUBBER_SYMBOL,
    };
    ctx.report(finding);
  },
  // The sanctioned zones are scanRoot-EXCLUDED, so the walk never sees them — the stale arm reads them off
  // the shared project directly, with the SAME two predicates the walk uses.
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    for (const zone of SANCTIONED_ZONES) {
      const touches = ctx.project
        .getSourceFiles()
        .filter((sf) => zone.test(sf.getFilePath()))
        .some((sf) => touchesScrubber(sf));
      if (!touches) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}${zone.source} — the zone list lives in scripts/check/gates/scrubber-home.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'import { createHiddenSpanStreamScrubber } from "@orb/kit/content";\nexport const s = createHiddenSpanStreamScrubber();\n',
      at: "packages/server/src/transport/trpc/x.ts",
      // Both arms fire: the ImportSpecifier + the CallExpression.
      expect: { count: 2 },
      why: "a per-subscription scrubber in transport — the exact cold-scrubber reconnect leak ed2aafc5 closed",
    },
    {
      files: "declare function createHiddenSpanStreamScrubber(): unknown;\nexport const s = createHiddenSpanStreamScrubber();\n",
      at: "packages/server/src/domain/chat/verbs/y.ts",
      why: "the CALL arm matches by name — a barrel re-export / local re-binding dodge still flags",
    },
    {
      files: {
        [ANCHOR]: "export function createHiddenSpanStreamScrubber(): unknown {\n  return null;\n}\n",
        "packages/server/src/domain/chat/substrate/member-visibility.ts": "export const stamp = null;\n",
      },
      expect: { count: 1, messageIncludes: "stale SANCTIONED zone" },
      why: "THE STALE ARM: the anchor (the kit definition) is loaded and still owns the factory, but the producer-stamp home no longer constructs a scrubber — that zone seals nothing and ratchets down instead of standing as a blanket permission on the file",
    },
  ],
  mustPass: [
    {
      files: 'import { stripHiddenSpans } from "@orb/kit/content";\nexport const s = stripHiddenSpans;\n',
      at: "packages/server/src/domain/chat/verbs/z.ts",
      why: "the STATELESS at-commit strip from the same kit module — not the stateful scrubber, passes",
    },
    {
      files: 'import { scrubStreamReplayForMember } from "../substrate/member-visibility";\nexport const s = scrubStreamReplayForMember;\n',
      at: "packages/server/src/domain/chat/verbs/read2.ts",
      why: "consuming the home's exported scrub SEAMS is the sanctioned path — only constructing a scrubber is the breach; with no anchor in this project the stale arm stays silent (THE ANCHOR GUARD)",
    },
    {
      files: {
        [ANCHOR]: "export function createHiddenSpanStreamScrubber(): unknown {\n  return null;\n}\n",
        "packages/server/src/domain/chat/substrate/member-visibility.ts":
          'import { createHiddenSpanStreamScrubber } from "@orb/kit/content";\nexport const s = createHiddenSpanStreamScrubber();\n',
      },
      why: "both zones STILL EARNED, judged against the real-tree anchor: the kit defines the factory and the producer stamp constructs it — the seal is over something, so neither arm fires",
    },
  ],
};
