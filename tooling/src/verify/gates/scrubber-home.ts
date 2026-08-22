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
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the two sanctioned homes are SCANNED and exempted
// by a cited row, not scoped OUT of scanRoot. This gate's exclusion shape WAS the law's named anti-pattern —
// an excluded home follows its old path into the void on a rename while the new path is judged by nobody.
//
// TWO-SIDED (gate-hub #10), now on both axes: MODE A — a sanctioned home that no longer imports, calls or
// declares the scrubber symbol is RED (the row stops being a seal and becomes a standing permission for
// whatever moves in next); MODE B — a row resolving to no file at all is RED (the rename tripwire, shared
// with every other scan-and-allowlist gate: lib/sanctioned-home.ts). Both self-guard on a REAL-TREE ANCHOR
// (gate-hub #11) — the kit module that DEFINES the factory.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { fileLoaded, repoRel } from "../lib/pass.ts";
import { HOME_SWEEP_ANCHOR, homeFiles, reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const SCRUBBER_SYMBOL = "createHiddenSpanStreamScrubber";
const KIT_CONTENT_SPECIFIER = /^@orb\/kit\/content(?:\/|$)/u;
const PACKAGES_SRC = /\/packages\/[^/]+\/src\//u;
/** The two sanctioned homes, keyed by path so a stale arm can name the dead one: the producer stamp (the
 *  ONE construction home) and the kit module that defines the factory. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/server/src/domain/chat/substrate/member-visibility.ts": {
    why: "THE producer stamp — the one place a stateful per-slot scrubber may be constructed (§3.6, ed2aafc5). Ends when the stamp moves (mode B reds it) or stops constructing a scrubber (mode A reds it)",
  },
  "packages/kit/src/content/": {
    why: "the kit module that DEFINES createHiddenSpanStreamScrubber — the factory's declaration site cannot be a violation of its own construction rule. Same end conditions",
  },
};

const GATE_SELF = "tooling/src/verify/gates/scrubber-home.ts";
/** Real-tree anchor (gate-hub #11): the kit module that DEFINES the scrubber factory. */
const ANCHOR = "packages/kit/src/content/index.ts";
const STALE_PREFIX =
  "stale SANCTIONED zone — nothing it matches declares, imports or calls the hidden-span scrubber any more, so the " +
  "zone is no longer a seal over anything: it is a standing permission for whatever moves in next " +
  "(ratchet down). Re-point it at the real producer home or delete it: ";
/** What the rows sanction, for the shared rename tripwire's message. */
const HOME_NOUN = "hidden-span scrubber construction home";

const MESSAGE =
  "hidden-span stream scrubber constructed outside its producer home — per-subscription scrub state cannot survive replay→live handoffs (a cold scrubber mid-`<lie>` forwards the secret's tail; ed2aafc5); the producer stamp is the one home: domain/chat/substrate/member-visibility.ts.";

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
  // SCANNED, not excluded: every packages/**/src file, the sanctioned homes included. The only exemption
  // is a cited SANCTIONED_HOMES row, so a home that moves is RED at its new path.
  scanRoot: (p) => PACKAGES_SRC.test(`/${p}`),
  kinds: [SyntaxKind.ImportSpecifier, SyntaxKind.CallExpression],
  visit: (node, sf, ctx) => {
    if (!(scrubberImport(node) || scrubberCall(node))) {
      return;
    }
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    ctx.report(node, { token: SCRUBBER_SYMBOL, offset: 0 });
  },
  finalize: (ctx) => {
    // MODE B (the rename tripwire) — a row that resolves to no file at all.
    // Anchored on the SHARED anchor, deliberately NOT on this gate's kit ANCHOR: that file lives inside a
    // sanctioned home, so a home that died would take its own guard with it and the tripwire would sleep.
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: HOME_NOUN });
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    // MODE A — the home still exists but no longer has a stake in the scrubber, so the row seals nothing.
    // Honest for THIS gate specifically: both rows are claims that the symbol LIVES there.
    for (const key of Object.keys(SANCTIONED_HOMES)) {
      const files = homeFiles(ctx, key);
      if (files.length > 0 && !files.some((sf) => touchesScrubber(sf))) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}${key} — the sanctioned-home table lives in tooling/src/verify/gates/scrubber-home.ts`,
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
      why: "THE STALE ARM, MODE A: the anchor (the kit definition) is loaded and still owns the factory, but the producer-stamp home no longer constructs a scrubber — that zone seals nothing and ratchets down instead of standing as a blanket permission on the file",
    },
    {
      files: {
        [HOME_SWEEP_ANCHOR]: "export const schema = {};\n",
        [ANCHOR]: "export function createHiddenSpanStreamScrubber(): unknown {\n  return null;\n}\n",
      },
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE STALE ARM, MODE B (the rename tripwire): the anchor is loaded but the producer-stamp path resolves to NO file — the home moved, and the scanRoot-exclusion shape this gate used to carry would have followed it into the void while the new path went unjudged",
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
      why: "THE ALLOWLIST ITSELF: the producer stamp is now SCANNED (it constructs a scrubber right there) and passes ONLY because a cited SANCTIONED_HOMES row covers its path — plus both rows are still earned against the real-tree anchor, so neither stale arm fires",
    },
  ],
};
