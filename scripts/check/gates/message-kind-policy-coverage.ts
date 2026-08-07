// Gate: message-kind-policy-coverage — MESSAGE_KIND_POLICY (packages/contracts/src/chat/participants.ts) is
// the ONE home for per-kind row behavior; an AXIS (interface column) with no production reader is law with no
// enforcer (`comment:{prompt:"never"}` sat unenforced while assembly shipped comments to the wire). Arms:
// MISSING (multi-arm axis, no reader, no DEFERRED row) · STALE (DEFERRED axis gained a reader) · ORPHAN ·
// blindness/mode-B tripwires. Single-LITERAL axes are vacuously exempt (nothing to dispatch on) — a mustPass row.
import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionRow, ExemptionTable, GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const HOME = "packages/contracts/src/chat/participants.ts";
const RECORD = "MESSAGE_KIND_POLICY";
const IFACE = "MessageKindPolicy";
const GATE_SELF = "scripts/check/gates/message-kind-policy-coverage.ts";
/** Real-tree anchor for the mode-B (home file GONE) arm — present on every real run, never planted by an
 *  example except the one that PROVES mode B (GATE-AUTHORING.md §4.4a/§4.5). */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";
/** Where a production reader counts: BEHAVIOR tiers only (a contracts-internal derivation is a carrier, not
 *  an enforcer — it must itself be imported by one of these). */
const READER_SCOPE_RE = /(?:^|\/)packages\/(?:server|client)\/src\//u;

/** Axes whose reader is another lane's NAMED in-flight work — the bus-coverage DEFERRED idiom, self-cleaning
 *  in both directions (missing RED above · stale RED below the moment the reader lands). */
const DEFERRED: ExemptionTable<ExemptionRow> = {
  prompt: {
    why:
      "the prompt-plane consumers (assembly's comment prompt:'never' filter + the narrator system-channel " +
      "dispatch) are FANOUT-1's live wiring in domain/chat/assembly/shape.ts (fenced from this gate's landing " +
      "lane, 2026-08-07). ENDS: the commit a production `.prompt` read lands — the STALE arm forces this row's " +
      "deletion then.",
  },
};

const MESSAGE =
  `a ${RECORD} axis with NO production reader — a policy cell nobody reads is law with no enforcer (the ` +
  "comment prompt:'never' cell was unenforced while assembly shipped comments to the wire). Wire the reader " +
  "(a direct `MESSAGE_KIND_POLICY[…].<axis>` read or an imported home-file derivation like " +
  "MEMORY_INGEST_KINDS), or add a cited DEFERRED row in scripts/check/gates/message-kind-policy-coverage.ts. " +
  "Home: packages/contracts/src/chat/participants.ts.";
const FIX =
  "read the axis in packages/{server,client}/src (directly or via a home-file derived export), or add a cited DEFERRED row naming the lane that wires it.";

interface Axis {
  readonly name: string;
  /** A single-LITERAL type (`reading: "show"`) admits one value — no dispatch can exist, so demanding a
   *  reader would demand dead code. Self-cleaning: the exemption vanishes the commit the axis widens. */
  readonly singleArm: boolean;
  readonly line: number;
}

function readAxes(home: SourceFile): readonly Axis[] | undefined {
  const iface = home.getInterface(IFACE);
  if (iface === undefined) {
    return;
  }
  return iface.getProperties().map((p) => ({
    name: p.getName(),
    singleArm: p.getTypeNode()?.getKind() === SyntaxKind.LiteralType,
    line: p.getStartLineNumber(),
  }));
}

/** Home-file consts that DERIVE from the record reading `.axis` (MEMORY_INGEST_KINDS' shape) — their names
 *  are the axis's carrier symbols; importing one from a behavior tier counts as reading the axis. */
function carrierNames(home: SourceFile, axis: string): readonly string[] {
  const names: string[] = [];
  for (const decl of home.getVariableDeclarations()) {
    const init = decl.getInitializer()?.getText() ?? "";
    if (decl.getName() !== RECORD && init.includes(RECORD) && init.includes(`.${axis}`)) {
      names.push(decl.getName());
    }
  }
  return names;
}

/** Does any behavior-tier file read the axis — directly off the record, or by importing a carrier? */
function axisHasReader(ctx: GateRunCtx, home: SourceFile, axis: string): boolean {
  const carriers = new Set(carrierNames(home, axis));
  return ctx.project.getSourceFiles().some((sf) => sf !== home && READER_SCOPE_RE.test(sf.getFilePath()) && fileReadsAxis(sf, axis, carriers));
}

/** One file's verdict, behind a full-text pre-filter (structural-fast budget): only files that MENTION the
 *  record or a carrier pay for an AST walk. */
function fileReadsAxis(sf: SourceFile, axis: string, carriers: ReadonlySet<string>): boolean {
  const text = sf.getFullText();
  if (!(text.includes(RECORD) || [...carriers].some((c) => text.includes(c)))) {
    return false;
  }
  for (const access of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (access.getName() === axis && access.getExpression().getText().includes(RECORD)) {
      return true;
    }
  }
  if (carriers.size === 0) {
    return false;
  }
  return sf.getDescendantsOfKind(SyntaxKind.ImportSpecifier).some((spec) => carriers.has(spec.getName()));
}

/** The per-axis MISSING/STALE judgment — extracted from `run` for the complexity cap. */
function judgeAxis(ctx: GateRunCtx, home: SourceFile, axis: Axis): void {
  if (axis.singleArm) {
    return; // one legal value ⇒ no dispatch can exist; arms itself the commit the axis widens
  }
  const hasReader = axisHasReader(ctx, home, axis.name);
  const deferred = axis.name in DEFERRED;
  if (!(hasReader || deferred)) {
    ctx.report({ file: HOME, line: axis.line, column: 0, token: axis.name });
  }
  if (hasReader && deferred) {
    ctx.report({
      file: GATE_SELF,
      line: 0,
      column: 0,
      message: `DEFERRED axis \`${axis.name}\` now HAS a production reader — delete its stale row in scripts/check/gates/message-kind-policy-coverage.ts`,
    });
  }
}

export const gate: GateDescriptor = {
  name: "message-kind-policy-coverage",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  run: (ctx) => {
    const home = ctx.project.getSourceFile(`${ctx.root}/${HOME}`);
    if (home === undefined) {
      // Mode B (§4.4a): the home file is GONE. Only judged on the real tree — a mini-project without the
      // anchor legitimately omits the home.
      if (fileLoaded(ctx, REAL_TREE_ANCHOR)) {
        ctx.report({
          file: GATE_SELF,
          line: 0,
          column: 0,
          message: `${HOME} is gone/moved — this gate keys on it by path and is now BLIND. Retarget HOME in scripts/check/gates/message-kind-policy-coverage.ts`,
        });
      }
      return;
    }
    const axes = readAxes(home);
    const record = home.getVariableDeclaration(RECORD);
    if (axes === undefined || record === undefined) {
      ctx.report({
        file: HOME,
        line: 1,
        column: 0,
        message: `\`${RECORD}\`/\`${IFACE}\` not found in ${HOME} — renamed past a name-keyed gate (blind, never silently green). Retarget RECORD/IFACE in scripts/check/gates/message-kind-policy-coverage.ts`,
      });
      return;
    }
    const axisNames = new Set(axes.map((a) => a.name));
    for (const key of Object.keys(DEFERRED)) {
      if (!axisNames.has(key)) {
        ctx.report({
          file: GATE_SELF,
          line: 0,
          column: 0,
          message: `DEFERRED row \`${key}\` names no live ${IFACE} axis — an orphan exemption; delete it from scripts/check/gates/message-kind-policy-coverage.ts`,
        });
      }
    }
    for (const axis of axes) {
      judgeAxis(ctx, home, axis);
    }
  },
  mustFlag: [
    {
      files: {
        [HOME]:
          "export interface MessageKindPolicy {\n  readonly prompt: 'conversation' | 'never';\n  readonly wire: 'carry' | 'drop';\n}\n" +
          "export const MESSAGE_KIND_POLICY = { standard: { prompt: 'conversation', wire: 'carry' } };\n",
      },
      expect: { count: 1, messageIncludes: "NO production reader" },
      why: "the founding disease one axis over: a NEW multi-arm axis (`wire`) with no reader and no DEFERRED row is RED at birth (`prompt` rides its live DEFERRED row, so exactly ONE finding)",
    },
    {
      files: {
        [HOME]:
          "export interface MessageKindPolicy {\n  readonly prompt: 'conversation' | 'never';\n}\n" +
          "export const MESSAGE_KIND_POLICY = { standard: { prompt: 'conversation' } };\n",
        "packages/server/src/domain/chat/assembly/shape.ts": "export const p = MESSAGE_KIND_POLICY.standard.prompt;\n",
      },
      expect: { count: 1, messageIncludes: "now HAS a production reader" },
      why: "the STALE arm — the live DEFERRED `prompt` row while a production `.prompt` read exists is a rotting exemption",
    },
    {
      files: {
        "packages/db/src/schema/index.ts": "export const anchor = 1;\n",
      },
      expect: { count: 1, messageIncludes: "BLIND" },
      why: "mode B (§4.4a): the real-tree anchor is present but the policy home is gone — the gate must announce its own blindness, never go silently green",
    },
  ],
  mustPass: [
    {
      files: {
        [HOME]:
          "export interface MessageKindPolicy {\n  readonly prompt: 'conversation' | 'never';\n  readonly memory: 'ingest' | 'exclude';\n  readonly reading: 'show';\n}\n" +
          "export const MESSAGE_KIND_POLICY = { standard: { prompt: 'conversation', memory: 'ingest', reading: 'show' } };\n" +
          "export const MEMORY_INGEST_KINDS = ['standard'].filter(() => MESSAGE_KIND_POLICY.standard.memory === 'ingest');\n",
        "packages/server/src/domain/chat/memory/persistence/queries.ts":
          "import { MEMORY_INGEST_KINDS } from '@orb/contracts/chat';\nexport const k = MEMORY_INGEST_KINDS;\n",
      },
      why: "the healthy shape: `memory` is read through its imported home-file carrier (MEMORY_INGEST_KINDS), `reading` is a single-LITERAL axis (vacuously exempt until it widens — the declared-limit row), and reader-less `prompt` rides its DEFERRED row",
    },
    {
      files: {
        [HOME]:
          "export interface MessageKindPolicy {\n  readonly prompt: 'conversation' | 'never';\n  readonly memory: 'ingest' | 'exclude';\n}\n" +
          "export const MESSAGE_KIND_POLICY = { standard: { prompt: 'conversation', memory: 'ingest' } };\n",
        "packages/server/src/domain/chat/memory/persistence/queries.ts": "export const m = MESSAGE_KIND_POLICY.standard.memory;\n",
      },
      why: "a DIRECT record read in a behavior tier satisfies the axis without any carrier",
    },
  ],
};
