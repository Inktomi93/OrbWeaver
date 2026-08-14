# UI content audit

## Lane identity

- Lane: `ui-content`
- Semantic scope: @orb/ui content delivery, markdown, stream, styles/tokens, package shell, and assigned
  mirrored tests.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`.
- Working-tree basis: rolling current bytes read on 2026-08-14; this is not a single immutable repository
  claim.
- Assigned files read: 68 / 68 (100%).
- Assigned lines read: 8,738 / 8,738 text lines (100%).
- Assigned bytes read: 462,715 / 462,715 (100%).
- Dirty assigned paths: 0; every OWNED current SHA matches the assignment.
- Exclusions: none. Nine SHARED prerequisites were read separately; `scripts/codemods/ast.ts` drifted
  after assignment (documented in `commands.md`).

## Read receipt

`read-receipt.tsv` covers every OWNED row in `assignment.txt` with current line, byte, and SHA-256
values. Coverage is 100%.

## Architecture observed

@orb/ui is the sealed `kit ← ui ← client` layer: its package declares only `@orb/kit` as a workspace
dependency and publishes explicit content, markdown, stream, token, and theme-scope fronts
(`packages/ui/package.json:7-83,111-115`; R3 package boundary). The markdown front is consumed by seven
client components plus its CT test (`pnpm ast importers @orb/ui/markdown --max 200`; 8/4,812 complete
scan; R3). ThemeScope reaches thirteen client surfaces (`pnpm ast importers @orb/ui/theme-scope --max 100`;
18/4,812 complete scan; R3); the token API reaches client and test consumers
(`pnpm ast importers @orb/ui/tokens --max 200`; 61/4,812 complete scan; R3).

Untrusted card HTML remains in an empty-sandbox iframe, chooses exactly one routed-or-srcdoc delivery,
and clamps caller theme inputs at the render boundary (`packages/ui/src/content/sandbox-frame/sandbox-frame.tsx:72-98`;
R2 implementation; CT R5 below). The markdown seal makes trust and settled/streaming mode required rather
than ambient defaults (`packages/ui/src/markdown/markdown.tsx:23-47,90-95`; R2); its component behavior
has a browser receipt. The stream export is partly live: `TypingDots` and `useSmoothText` have two
client importers, while `StreamText` is only CT-consumed (`pnpm ast importers @orb/ui/stream --max 100`;
3/4,812 complete plus matching literal `rg`; R3 for the hooks, R4 for StreamText).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Sandbox-frame delivery | 4 | 3 | 5 | 3 | 4 | high | `sandbox-frame.tsx:72-98`; `sandbox-frame.ct.tsx:1-117`; CT 110/110 |
| Markdown trust/rendering | 4 | 3 | 5 | 3 | 4 | high | `markdown.tsx:23-95`; `policy.test.ts:1-161`; markdown CT; importer scan 8/4,812 |
| Theme scope and tokens | 4 | 3 | 5 | 3 | 4 | high | `theme-scope.tsx:1-26`; `tokens/index.ts:1-180`; 153 unit tests; 110/110 CT |
| Stream primitives | 3 | 3 | 4 | 2 | 3 | medium | `stream-text.tsx:1-42`; `use-smooth-text.ts:25-108`; stream CT; importer scan 3/4,812 |

## Findings

No P0–P3 defect met the evidence threshold in the assigned current bytes. The deliberately prebuilt,
unconsumed `StreamText` wrapper is not called a defect: its own source explicitly says no current consumer
and scopes it to future plain-text streaming (`packages/ui/src/stream/stream-text.tsx:1-3`; R2), while its
CT proves the wrapper behavior (R5). The separate live hooks are consumed by client chat components
(`pnpm ast importers @orb/ui/stream --max 100`; R3).

## Proven strengths

### UI-CONTENT-01 — Browser-verified content seals

- Class: `proven-strength`
- Confidence: high
- Evidence rung: R5
- Scope denominator: 10 / 10 assigned CT files; 110 / 110 expected browser results, 0 unexpected,
  `reports/ct-report.json` immediately after the exact scoped run; flakyCount 0 in
  `reports/ct-flaky.json`.
- Established fact: sandbox, lightbox, media, themed content, markdown, stream, tokens, density, and
  touch-target acceptance execute in Chromium. The sandbox has both iframe isolation and re-clamping
  (`sandbox-frame.tsx:72-98`).

### UI-CONTENT-02 — Token/theme integrity is regression-tested

- Class: `proven-strength`
- Confidence: high
- Evidence rung: R4
- Scope denominator: 13 / 13 assigned unit/suite files; 153 / 153 tests passed.
- Established fact: token emissions, duplicate detection, palette contrast, token classification, and
  theme-scope clamping are covered by focused assertions (`tests/ui/tokens/index.test.ts:1-183`,
  `tests/ui/content/theme-scope/clamp.test.ts:1-177`, `tests/ui/content/theme-scope/palette-contrast.suite.test.ts:1-275`).

## Declared versus completed

| Declared surface | Strongest current evidence | State |
| --- | --- | --- |
| SandboxFrame | R5 | Implemented, browser-tested; consumer tracing is limited to its hook because current component callers sit outside this lane. |
| Markdown | R5 | Implemented, eight importers registered in the scanned corpus, browser-tested. |
| ThemeScope and TOKENS | R5 | Implemented, client-consumed, unit and CT-tested. |
| useSmoothText / TypingDots / StreamShimmer | R3 | Two client chat importers; no separate owned CT covers every hook branch. |
| StreamText | R5 behavior, R4 only for live use | Intentional prebuilt wrapper; CT-tested, no production importer. |

## Tests and gates

The owned unit/suite scope passed 153 assertions across 13 files. The exact required CT scope passed 110
results across 10 files with no flake. The current type program and Biome scope passed, but remain static
receipts only. No positive control was run for a repository gate, so enforcement does not exceed score 3
and no clean-gate strength is claimed.

## Cross-lane edges

- Client lanes own the consumer behavior of markdown, theme-scope, token, and stream imports reported by
  the complete 4,812-file importer scans.
- The security semantics of `@orb/kit/card-frame` are outside this lane; this lane establishes only its
  `SandboxFrame` boundary use (`sandbox-frame.tsx:1,72-98`).

## Tool receipts

See `commands.md` for every command, durations, exact scope, scan denominators, static checks, and mutable
artifact caveat. No negative code claim is used in this report.

## Lane verdict

All 68 assigned files were read and checksum-reconciled to the lane snapshot; the owned surface did not
drift. Markdown, token/theme, content, and stream behavior have current scoped browser/unit proof. The main
remaining uncertainty is end-to-end application behavior, which belongs to client/e2e lanes and was not
claimed here. The only rolling drift was the SHARED AST instrument, read at its newer current hash.
