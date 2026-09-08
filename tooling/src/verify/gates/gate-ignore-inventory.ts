// Gate: gate-ignore-inventory — the hygiene owner of the house's shared per-site suppression marker,
// `// @orb-gate-ignore <gate-name>[(<position>)]: <reason>` (GATE-AUTHORING.md §4.3/§4.3a/§4.4). FOUR
// arms: MALFORMED (no `: <reason>`, or an empty `()` position — it suppresses nothing, so it must not sit
// there LOOKING like protection) · UNREGISTERED (names no gate file) · STALE (well-formed and registered
// but suppressed NOTHING this run — a loaded gun: the next violation written there inherits an exemption
// nobody granted it) · OVER-EXEMPT (§4.3a: one UNPOSITIONED marker absolved MORE THAN ONE guarded thing —
// the `record(chatId: string, sessionId: string)` shape, where a line-scoped marker silently absolves the
// sibling nobody reasoned about; name the position instead). scanRoot is the workspace's WHOLE
// marker-bearing surface — `packages/` + `tests/` + `tooling/src/verify/gates/` (since 2026-08-08): the
// suppressor has no scanRoot of its own, so a marker in the gate corpus is LIVE vocabulary for every
// wide-scanRoot gate and must be audited like any other. WIDENED 2026-08-27 (#751) from
// `tooling/src/verify/gates/` to ALL of `tooling/src/`: `caught-failure-ownership` scans the whole tooling
// tree, so 44 live markers sat under `tooling/src/stack|_shared|model-ab|motion-audit` with NO stale arm
// over them — a one-sided exemption (§4.4), and exactly one of them had already gone stale unnoticed
// (`stack/ops/engines.ts`, deleted in the same commit). An exemption vocabulary is two-sided everywhere it
// is honoured, or nowhere. What makes the corpus scannable is pass.ts's
// MENTION FENCE (docs/history/design/gate-ignore-mention-fence.md): a marker IS a `//` comment that BEGINS with
// the vocabulary, so grammar quotations in gate prose/JSDoc and spellings inside string/template/regex
// literals are MENTIONS — skipped by the scanner and inert to the suppressor alike. DECLARED LIMITS: a
// marker naming a DORMANT gate reds as STALE (a dormant gate suppresses nothing, so the marker protects
// nothing); `scripts/` stays out of BOTH ledgers because NO gate's scanRoot admits it, so no gate can ever
// consume a marker there and every one would judge stale by construction (the old reason given here —
// "harnessGlobs never loads those files" — was FALSE: harnessGlobs has carried `scripts/**` since the
// @orb/tooling widening. The boundary survives; its reason is scanRoot, not the fileset); the OVER-EXEMPT arm is NOT conformance-provable (conformance runs
// ONE gate standalone, so no sibling gate can ever consume a marker in a mini-project) and is proven
// instead by the real-tree probe in tests/tooling/gate-ignore-grammar.repo.int.test.ts (both roots). Registered
// names come from each gate file's FILENAME, not a `name:` literal scan — the loader hard-enforces
// `descriptor.name === filename`, so the filename is the only source that cannot drift (a gate file can
// contain other `name:` literals in its own internal config, e.g. no-parallel-section-map.ts's `SectionId`
// vocab entry, which a first-match literal regex would misidentify). The GRAMMAR and its fence are not
// re-spelled here: both are imported from pass.ts, the suppressor itself, so the auditor cannot drift
// from the thing it audits. Self-hosts its gates-dir read (fsBacked — mirrors
// enforcement-registry-parity.ts), never importing loader.ts, so no import cycle. Both blindness
// tripwires and the STALE arm self-guard on the real-tree ANCHOR (§4.5).
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract/gate.ts";
import { findGateIgnoreMarkers } from "../lib/gate-ignore.ts";
import { gateIgnoreSuppressedInFinalize, gateIgnoreUseCount } from "../lib/pass.ts";

const GATES_DIR_REL = "tooling/src/verify/gates";
const TS_EXT_RE = /\.ts$/u;
/** Real-tree anchor (§4.5): present on every real run and NEVER a planted example path, so the STALE arm
 *  and the tripwires stay silent inside conformance's synthetic mini-projects. It is also the module this
 *  gate reads its verdicts from, so the anchor and the dependency are the same fact. */
const ANCHOR_REL = "tooling/src/verify/lib/pass.ts";

const MESSAGE =
  "`// @orb-gate-ignore` marker hygiene: the grammar is `// @orb-gate-ignore <gate-name>[(<position>)]: <reason>` — the reason is REQUIRED, the name must be a registered gate, and the marker must guard a LIVE violation. See tooling/src/verify/gates/GATE-AUTHORING.md §4.3.";
const FIX =
  "write the missing `: <reason>` (why the suppression is correct + what would end it), correct the name to a real gate file in tooling/src/verify/gates/, or delete the marker.";

const MSG_UNREGISTERED =
  "`// @orb-gate-ignore <name>` names a gate that isn't registered (tooling/src/verify/gates/) — stale suppression rot: either the gate was retired (delete the ignore comment) or the name is a typo (fix it to the real gate's kebab-case filename).";
const MSG_MALFORMED =
  "MALFORMED `@orb-gate-ignore` marker — no `: <reason>` (or an empty `()` position). The house grammar requires the reason, so this marker suppresses NOTHING while reading as an exemption. Write `// @orb-gate-ignore <gate-name>: <why it is correct + what would end it>`, or delete it. See tooling/src/verify/gates/GATE-AUTHORING.md §4.3.";
const MSG_STALE =
  "STALE `@orb-gate-ignore` marker — it suppressed nothing in this run: the violation it was granted for is fixed, the gate no longer scans this file, the gate is dormant, or a named `(position)` no longer matches. A stale marker is a LOADED GUN — the next violation written here inherits an exemption nobody granted it. Delete it. See tooling/src/verify/gates/GATE-AUTHORING.md §4.4.";
const MSG_OVER_EXEMPT =
  "OVER-EXEMPTING `@orb-gate-ignore` marker — one UNPOSITIONED marker absolved MORE THAN ONE guarded thing, so it grants an exemption nobody reasoned about to every violation but the one it was written for (`record(chatId: string, sessionId: string)` is the founding case). Name the position you meant: `// @orb-gate-ignore <gate>(<position>): <reason>`, one marker per guarded thing — the position is the finding's reported token. If you genuinely meant all of them, split the code so each guarded thing carries its own marker.";
const MSG_NO_GATES = `blindness tripwire: no gate names could be derived from ${GATES_DIR_REL}/ — the derivation came back EMPTY, so every marker would judge as unregistered and this gate's verdict is unknowable. Re-point GATES_DIR_REL at the gate corpus. See tooling/src/verify/gates/GATE-AUTHORING.md §4.6.`;
const MSG_LATE_SUPPRESSION =
  "soundness tripwire: a gate suppressed a finding during the `finalize` phase, but this gate's STALE sweep also runs in `finalize` — a marker consumed after the sweep would be reported stale by mistake. Move that gate's report to `run`, or give this sweep a later hook. See tooling/src/verify/lib/pass.ts.";

/** Every registered gate's name, derived from its FILENAME (basename minus .ts) — the loader
 *  hard-enforces descriptor.name === filename, so the filename is the truth (fsBacked — this gate's
 *  own read of the gates dir, never importing the loader). */
function discoverGateNames(gatesDir: string): ReadonlySet<string> {
  if (!existsSync(gatesDir)) {
    return new Set();
  }
  const names = new Set<string>();
  for (const entry of readdirSync(gatesDir).sort()) {
    if (!TS_EXT_RE.test(entry)) {
      continue;
    }
    names.add(entry.replace(TS_EXT_RE, ""));
  }
  return names;
}

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** A well-formed, registered marker awaiting the finalize-time consumption verdict. `positioned` is §4.3a's
 *  discriminator: an UNPOSITIONED marker is judged on how MANY findings it absolved, a positioned one is
 *  already scoped to a single guarded thing by construction. */
interface PendingMarker {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly positioned: boolean;
}

let pending: PendingMarker[] = [];

export const gate: GateDescriptor = {
  name: "gate-ignore-inventory",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  scopeSafety: "whole-project",
  // The AUDITOR of this vocabulary is never reachable by it (#828). Before the Finding overload became
  // suppressible this held by construction — every arm here reports file-anchored. Now it is DECLARED, or a
  // marker written one line above a malformed/stale marker would absolve the report that indicts it.
  markerImmune: true,
  fsBacked: true,
  message: MESSAGE,
  fix: FIX,
  // The workspace's whole marker-bearing surface, gate corpus included — pass.ts's mention fence is what
  // keeps the corpus's own grammar prose/fixtures from self-flagging (see the header). `tooling/src/` is
  // covered WHOLE since #751: a gate that scans the tooling tree makes every marker there live vocabulary.
  scanRoot: (p) => p.startsWith("packages/") || p.startsWith("tests/") || p.startsWith("tooling/src/"),
  begin: () => {
    pending = [];
  },
  visitFile: (sf, ctx) => {
    const registered = discoverGateNames(join(ctx.root, GATES_DIR_REL));
    const file = relPath(ctx.root, sf.getFilePath());
    for (const { index, marker } of findGateIgnoreMarkers(sf)) {
      const { line } = sf.getLineAndColumnAtPos(index);
      if (marker.malformed) {
        // @finding-overload-ok: the finding IS a COMMENT, not a node — `index` is a text offset from the marker scanner, so there is no node to anchor the report on; and this gate is `markerImmune` (#828), because a marker absolving the report that indicts it is the one exemption the vocabulary can never grant
        ctx.report({ file, line, column: 0, token: marker.gate, message: MSG_MALFORMED });
        continue;
      }
      if (!registered.has(marker.gate)) {
        // @finding-overload-ok: the finding IS a COMMENT, not a node — `index` is a text offset from the marker scanner, so there is no node to anchor the report on; and this gate is `markerImmune` (#828), because a marker absolving the report that indicts it is the one exemption the vocabulary can never grant
        ctx.report({ file, line, column: 0, token: marker.gate, message: MSG_UNREGISTERED });
        continue;
      }
      pending.push({ file, line, name: marker.gate, positioned: marker.position !== undefined });
    }
  },
  finalize: (ctx) => {
    if (!existsSync(join(ctx.root, ANCHOR_REL))) {
      return; // synthetic conformance tree: no sibling gates ran, so "consumed nothing" proves nothing.
    }
    if (discoverGateNames(join(ctx.root, GATES_DIR_REL)).size === 0) {
      ctx.report({ file: `${GATES_DIR_REL}/${gate.name}.ts`, line: 0, column: 0, message: MSG_NO_GATES });
    }
    if (gateIgnoreSuppressedInFinalize()) {
      ctx.report({ file: `${GATES_DIR_REL}/${gate.name}.ts`, line: 0, column: 0, message: MSG_LATE_SUPPRESSION });
    }
    for (const m of pending) {
      const used = gateIgnoreUseCount(m.file, m.line);
      if (used === 0) {
        ctx.report({ file: m.file, line: m.line, column: 0, token: m.name, message: MSG_STALE });
      } else if (used > 1 && !m.positioned) {
        ctx.report({
          file: m.file,
          line: m.line,
          column: 0,
          token: m.name,
          // The count is interpolated FIRST and the pointer written LITERALLY last: diagnostic-legibility
          // reads a template's own text, so a pointer hidden behind `${CONST}` is invisible to it.
          message: `it absolved ${used} guarded things. ${MSG_OVER_EXEMPT} See tooling/src/verify/gates/GATE-AUTHORING.md §4.3a.`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: {
        "tooling/src/verify/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "// @orb-gate-ignore no-such-gate: this comment names a retired/nonexistent gate\nexport const x = 1;\n",
      },
      expect: { messageIncludes: "isn't registered" },
      why: "the ignore names a gate that doesn't exist in tooling/src/verify/gates/ — stale suppression rot",
    },
    {
      files: {
        "tooling/src/verify/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "packages/server/src/domain/x/x.ts": "  // @orb-gate-ignore   no-such-gate-2  :  odd spacing before/after the name\n  export const y = 2;\n",
      },
      expect: { messageIncludes: "isn't registered" },
      why: "odd comment spacing (extra indent + extra spaces around the name and the colon) must still be parsed and still RED on a fake name",
    },
    {
      files: {
        "tooling/src/verify/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "// @orb-gate-ignore real-gate\nexport const x = 1;\n",
      },
      expect: { messageIncludes: "MALFORMED" },
      why: "§4.3 case 4 — a BARE marker (registered name, no `: <reason>`) is its OWN flavour of red: it suppresses nothing, so it must not sit there looking like protection",
    },
    {
      files: {
        "tooling/src/verify/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "// @orb-gate-ignore real-gate() : a position that names nothing\nexport const x = 1;\n",
      },
      expect: { messageIncludes: "MALFORMED" },
      why: "§4.3a — an EMPTY `()` position names no position at all; it is malformed, not a wildcard",
    },
    {
      files: {
        "tooling/src/verify/lib/pass.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "// @orb-gate-ignore real-gate: well-formed, registered — but it guards no live violation\nexport const x = 1;\n",
      },
      expect: { messageIncludes: "STALE" },
      why: "§4.4 two-sidedness — with the real-tree anchor present, a well-formed registered marker that suppressed NOTHING is a loaded gun and reds",
    },
    {
      files: {
        "tooling/src/verify/lib/pass.ts": "export const anchor = 1;\n",
        "packages/ui/src/x/x.ts": "export const x = 1;\n",
      },
      expect: { messageIncludes: "blindness tripwire" },
      why: "§4.6 — the anchor is present but the gates dir derived ZERO names: the gate is blind, and blind must be RED, never a silent ✓",
    },
    {
      files: {
        "tooling/src/verify/lib/pass.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/dormant-gate.ts": 'export const gate = { name: "dormant-gate", status: "dormant" };\n',
        "packages/ui/src/x/x.ts": "// @orb-gate-ignore dormant-gate: well-formed, and the named gate FILE exists — but it is dormant\nexport const x = 1;\n",
      },
      expect: { messageIncludes: "STALE" },
      why: "DECLARED LIMIT, written down: a marker naming a DORMANT gate reds as STALE, not as unregistered — the file exists (so discovery registers it) but `runPass` never runs it, so it can suppress nothing and the marker protects nothing",
    },
    {
      files: {
        "tooling/src/verify/gates/real-gate.ts": '// @orb-gate-ignore real-gate\nexport const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "export const x = 1;\n",
      },
      expect: { messageIncludes: "MALFORMED" },
      why: "the gate corpus is IN scanRoot since 2026-08-08 (pass.ts's mention fence made it scannable): a REAL bare marker at a comment-opener inside a gate file is exactly as red there as anywhere. Before the fence this exact example was a mustPass documenting the old scripts-out limit — the closed gap, written down as its own proof",
    },
    {
      files: {
        "tooling/src/verify/lib/pass.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "export const x = 1; // @orb-gate-ignore real-gate: written trailing, after code on the same line\n",
      },
      expect: { messageIncludes: "STALE" },
      why: "a TRAILING marker opens a real comment (an attempted marker, NOT a mention) but sits in no node's LEADING trivia, so the suppressor can never honour it — the mention fence must keep it VISIBLE so the stale arm reds the attempt instead of letting it sit there looking like protection",
    },
    {
      files: {
        "tooling/src/verify/lib/pass.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "tooling/src/stack/lib/spawn-lock.ts": "// @orb-gate-ignore real-gate(error): a tooling-tree marker outside the gates dir\nexport const x = 1;\n",
      },
      expect: { messageIncludes: "STALE" },
      why: "#751 — the WIDENED root. A marker under `tooling/src/<tool>/` is live vocabulary for every gate that scans the tooling tree; before the widening 44 of them had no stale arm at all, and one had silently gone stale",
    },
  ],
  mustPass: [
    {
      files: {
        "tooling/src/verify/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "// @orb-gate-ignore real-gate: names a real registered gate and carries its reason\nexport const x = 1;\n",
      },
      why: "the ignore names `real-gate`, a registered descriptor discovered from tooling/src/verify/gates/, and is well-formed — passes",
    },
    {
      files: {
        "tooling/src/verify/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "// @orb-gate-ignore real-gate(chatId): §4.3a — the marker names the guarded position\nexport const x = 1;\n",
      },
      why: "DECLARED LIMIT + §4.3a: a position-named marker is well-formed; the position's own two-sidedness is enforced by the SUPPRESSOR (a position that matches no reported token simply fails to suppress, so the violation reds) plus the STALE arm, not by a name lookup here",
    },
    {
      files: {
        // A decoy `name:` literal (an internal vocab entry, mirroring no-parallel-section-map.ts's
        // `SectionId` config object) appears BEFORE the descriptor's own `name:` literal in the same
        // file — a first-match literal-regex scan would register the decoy, not the real gate, and
        // wrongly RED a legitimate ignore naming it. Filename-derived discovery isn't fooled: the
        // registered name is always the basename, regardless of what literals the file's body contains.
        "tooling/src/verify/gates/parallel-map-gate.ts":
          'const vocab = { name: "SectionId", ids: ["a", "b"] };\nexport const gate = { name: "parallel-map-gate", vocab };\n',
        "packages/ui/src/x/x.ts":
          "// @orb-gate-ignore parallel-map-gate: names the real gate, whose file also carries a decoy name literal\nexport const x = 1;\n",
      },
      why: "a legit ignore naming a gate whose file has a decoy name literal before its descriptor name must still pass — filename is the truth, not a first-match literal scan",
    },
    {
      files: {
        "tooling/src/verify/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "tests/tooling/x.ts": 'export const fixture = "// @orb-gate-ignore no-such-gate\\nexport const x = 1;\\n";\n',
      },
      why: "DECLARED LIMIT: a marker spelled inside a STRING LITERAL is a fixture/doc mention, not a suppression — check-gates.repo.int.test.ts's own gate-ignore fixture is exactly this shape and must not self-flag",
    },
    {
      files: {
        "tooling/src/verify/gates/real-gate.ts": 'export const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "// @orb-gate-ignore real-gate: well-formed but nothing consumed it\nexport const x = 1;\n",
      },
      why: "DECLARED LIMIT (§4.5): WITHOUT the real-tree anchor the STALE arm must stay silent — in a synthetic mini-project no sibling gate ran, so 'consumed nothing' carries no information",
    },
    {
      files: {
        "tooling/src/verify/lib/pass.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/real-gate.ts":
          '// suppression works here: `// @orb-gate-ignore real-gate(someProp): <reason>` names its position\nexport const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "export const x = 1;\n",
      },
      why: "the founding false-positive shape (12 live sites at fence-design time): a gate doc-comment QUOTING the grammar — the spelling sits mid-comment behind a backtick, NOT at a comment opener, so it is a MENTION and stays silent even though it names a real registered gate, a position, and a reason",
    },
    {
      files: {
        "tooling/src/verify/lib/pass.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/real-gate.ts":
          '/** The escape hatch is the shared `// @orb-gate-ignore real-gate(prop): <why + end condition>` marker. */\nexport const gate = { name: "real-gate" };\n',
        "packages/ui/src/x/x.ts": "export const x = 1;\n",
      },
      why: "a JSDoc BLOCK comment quoting the grammar is a mention too — the inner slashes sit inside the block, never at a line-comment opener (the platform-spellings.ts:392 shape), so the fence keeps it silent",
    },
  ],
};
