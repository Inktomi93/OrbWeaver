# The `@orb-gate-ignore` mention fence — closing the scripts/ inventory gap

> Design record (2026-08-08, FORGE lane). Supersedes the 2026-08-08 board ruling "gate-ignore scanRoot:
> RULED UN-EXTENDABLE" — that ruling asked for "NEW structural info in the marker grammar"; this is it.
> Status at landing: BUILT. The law this creates lives in `scripts/check/pass.ts` (the grammar's one
> home) + `scripts/check/gates/gate-ignore-inventory.ts`; this file is the why + the receipts.

## The problem

`gate-ignore-inventory`'s scanRoot was `packages/` + `tests/` only, so a `// @orb-gate-ignore` marker
under `scripts/` was UNINVENTORIED — no malformed/unregistered/stale/over-exempt arm watched it. The gap
is LIVE, not theoretical: the suppression path (`pass.ts` `findGateIgnore`) has no scanRoot of its own —
any gate that scans `scripts/check/gates/` and reports node-anchored findings there is suppressible by a
marker in a gate file, and the census below shows the scanning population is wide. A marker that can
suppress but cannot be audited is exactly the "loaded gun" the inventory exists to prevent.

The naive fix (extend scanRoot to scripts/) was probed by the TOOLING lane and re-derived here on
2026-08-08's tree: it produces **12 false findings** — gate doc-comments that DESCRIBE the marker grammar
(census below). Strings have the `literalSpans()` fence; comments had no analogous fence.

## Census receipts (probe: real `loadGates` + real `getWorkspace` + real `findGateIgnoreMarkers`)

- Workspace: 4,559 files; gates-dir: 197 files; 197 registered gates.
- **28** regex matches of the marker grammar in gates-dir files: **16 inside literal spans** (fenced
  today) + **12 outside** — the false findings. All 12 name their OWN gate; every one is a QUOTATION
  (the match starts mid-comment, behind a backtick or a `*`-prefixed JSDoc line), none is its own
  comment. 11 well-formed (→ would red STALE) + 1 malformed (`no-inline-types.ts:6` → would red
  MALFORMED).
- **The brief's hypothesis ("inventory a marker in F for G only when G's scanRoot includes F") is
  REFUTED**: `no-inline-types` (`scanRoot: (_p) => true`) and `no-raw-intl-time`
  (`(p) => !p.startsWith("packages/kit/src/time/")`) both admit gates-dir files, so their own doc-prose
  (`no-inline-types.ts:6`, `no-raw-intl-time.ts:2`) stays red under that discriminator — 2 residual
  false positives. Consumability is also far too common to discriminate: ~60 gates admit gates-dir paths
  (every `scanRoot: undefined` run-gate plus wide visit-gates: `no-raw-id`, `no-context-provider`,
  `no-legacy-react-api`, `finding-overload-provenance`, `diagnostic-legibility`, …).
- packages/ + tests/: 83 matches, 8 in literals, **75 live markers — 75/75 are comment OPENERS**
  (whitespace-only line prefix; the comment's own text begins with the vocabulary). Zero quotations
  outside literals. So the fence below has **zero blast radius** on the existing marker corpus.
- Latent bypass found during design: `parseGateIgnoreMarker` used an UNANCHORED `exec`, so the
  SUPPRESSOR itself could parse a quotation embedded mid-comment as a marker — prose sitting above a
  reported node could absolve a real violation (today's 12 fail to only by accident: malformedness or a
  position string like `tolocale|intl-formatter` that equals no real token). Proven live before the fix:
  a planted quotation-comment above a `bg-black` literal suppressed `no-color-literals` AND satisfied
  the inventory (consumed=1, zero findings) — an invisible exemption granted by documentation.

## The design: a marker IS a comment (the mention fence)

**One structural law, living in the grammar's one home (`pass.ts`), read identically by BOTH sides:**

> A marker is a `//` comment whose own text begins (after `//` + optional whitespace) with
> `@orb-gate-ignore`. Marker-shaped text anywhere else — inside a string/template/JSX-text/regex
> literal, or inside ANOTHER comment (a backtick quotation in `//` prose, a JSDoc block) — is a MENTION
> of the vocabulary, never a use of it.

- **Suppressor side:** `parseGateIgnoreMarker` anchors at the comment's start (`^`). A quotation inside
  a leading prose comment can no longer grant a suppression (closes the bypass). 75/75 live markers
  parse identically — no live consumption changes.
- **Inventory side:** `findGateIgnoreMarkers` takes the `SourceFile` and returns only matches at
  line-comment OPENER positions: AST-derived literal spans (StringLiteral, NoSubstitutionTemplateLiteral,
  TemplateExpression, JsxText, RegularExpressionLiteral) are excluded, and a small left-to-right scan of
  the remaining text tracks `//` / `/* */` state so a `//` inside a comment is not an opener. Outside
  literal spans, a bare `//` in TS is always a comment opener, so the computation is exact.
- **`gate-ignore-inventory` scanRoot extends to `scripts/check/gates/`** — the ONLY scripts/ surface the
  harness workspace loads (`harnessGlobs`, pinned). All four arms apply there unchanged. The gate's own
  `literalSpans` fence is deleted (subsumed by the grammar-home fence, so no future consumer can use an
  unfenced scan).

Why this discriminator is the honest one: it matches the CONSUMER's real semantics. Suppression walks
`getLeadingCommentRanges()` — the unit of consumption is the COMMENT, and a comment consumes only if it
IS a marker. A TRAILING marker after code (`code; // @orb-gate-ignore g: r`) is still an opener → still
inventoried → reds STALE (it can never suppress: TS leading-trivia semantics exclude same-line-after-code
comments) — the attempted-but-inert-marker class stays watched, which pure line-start anchoring would
have lost. The permissive-tail grammar stays: malformed ATTEMPTS at opener positions are still
recognized and judged (the d55350d07 lesson — a stricter parser must not make broken markers invisible).

## Rejected alternatives

1. **Consumability discriminator** (the brief's strong hypothesis): refuted by census — 2 residual false
   positives (`no-inline-types`, `no-raw-intl-time` scan the gates dir); also forks STALE semantics per
   root (the "gate no longer scans this file" stale flavour would silently vanish under scripts/), and
   its premise ("gate prose is inert there") is false for wide-scanRoot gates.
2. **Naive scanRoot extension**: 12 false reds (re-derived above).
3. **Allowlist the 12**: a hand-list that grows with every new gate documenting its own marker; the gate
   would red its own docs at birth; violates the no-allowlist-to-dodge-a-rule law.
4. **Line-start-only anchoring**: silently un-watches trailing markers that today red as STALE — a
   watched class regressed (see above).
5. **"Assemble the marker from parts" in prose** (the finding-overload gate's self-fence prior art):
   pushes an unenforced style rule onto every future gate author's doc-comments; one natural sentence
   re-introduces the false positive; requires rewording 12 existing prose sites. The fence belongs in
   the READER, once.
6. **Extend `harnessGlobs` to all of scripts/**: violates the pinned harness scope
   (`ts-workspace.ts` — "never widen it"), floods wide-scanRoot gates (`no-inline-types` scans
   everything), and adds nothing live — a marker in a file the walk never feeds can neither suppress
   nor mislead.

## Declared limit (real, with its reason)

`scripts/` OUTSIDE `scripts/check/gates/` stays out of BOTH ledgers: those files are not in
`harnessGlobs`, so no gate ever visits them — a marker there can never suppress anything
(inert-by-construction) and is not inventoried, the same status as a marker spelled in a `.md` file.
The boundary is the workspace's pinned scope, not this gate's choice.

## Coupled sites (all touched in this change)

1. `scripts/check/pass.ts` — anchored parse; SourceFile-based scanner with the opener fence + literal
   spans (moved here from the gate).
2. `scripts/check/gates/gate-ignore-inventory.ts` — scanRoot + header + the flipped proof row (the old
   "scripts/ is out" mustPass row becomes the "bare marker in a gate file REDS" mustFlag row) + mention
   mustPass rows (quotation, JSDoc, trailing-stale mustFlag).
3. `tests/tooling/gate-ignore-grammar.int.test.ts` — the scripts-side plant matrix (fixtures under
   `scripts/check/gates/__g_gi/` — loader-invisible via its flat `*.ts` glob, workspace-visible via
   `**/*.ts`) + the bypass-closure pin (quotation must NOT suppress) + live-corpus filter widened.
4. `docs/architecture/core/Core-Enforcement-Active-Gates.md` — the gate's row said "under
   `packages/**`"; now names the true watched set.
5. `scripts/check/GATE-AUTHORING.md` — the mention-fence law beside the §4.3 marker grammar.
6. `docs/history/retro-workboard-2026-08-14.md:676-680` — the frozen landing receipt; the design and gate source above carry the durable grammar ruling.

## Proof matrix (the plant → verdict table the suites pin)

| plant (under `scripts/check/gates/__g_gi/`) | expected |
| - | - |
| violation (`.toLocaleString()`), no marker | carrier (`no-raw-intl-time`) RED; inventory silent |
| well-formed positioned marker on that violation | carrier suppressed; inventory silent (consumed) |
| marker naming an unregistered gate | UNREGISTERED red |
| bare marker (registered name, no reason) | MALFORMED red |
| well-formed marker naming a gate that consumes nothing | STALE red |
| one unpositioned marker over two guarded things in one statement | OVER-EXEMPT red (`absolved 2`) |
| quotation-style mention (backtick inside prose comment) | silent |
| the 12 live gate doc-prose sites | silent (the whole-corpus case asserts zero live findings) |
| packages-side: quotation above a real violation | violation REDS (bypass closed; pre-fix this SUPPRESSED) |

Controls: `node scripts/check/report.ts` before/after (byte-diff of `check-structure.json`, both clean);
census re-run after (same 75-marker packages/tests pending set).
