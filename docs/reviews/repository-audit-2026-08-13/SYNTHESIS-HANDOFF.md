---
kind: handoff
status: ready
updated: 2026-08-14
---

# Cold Sol synthesis handoff

## Authority and exact inputs

Read these current bytes before any ranking. Hashes are SHA-256 from the shared checkout at closing HEAD `5783331a8a4403b056be8babc692436e33c4d4d6`.

| Input | SHA-256 | Role |
| --- | --- | --- |
| `README.md` | `738833fde2717dfb3bd6cd1f8bc436a327ca2dc773787a93752480516ced062b` | audit protocol |
| `RUBRIC.md` | `04d081b5e7b7816ce1dab862a26eb403af450658c822449aea327d646c2a4ac3` | evidence/severity/score law |
| `REPORT-TEMPLATE.md` | `2410c69138e3e9556a43dd602f237da0fed74616dd2c62d66dd382621343be16` | lane report schema |
| `SNAPSHOT-POLICY.md` | `b1bd8428de68a53fce678a46b32214ce61cd9bbc557efddc7c38ee8b74591b5f` | rolling-snapshot law |
| `SYNTHESIS-TEMPLATE.md` | `a9c1a8cd878523ecfaa19743b228d2d2aa10938833a0693b5acc15a0bff61da6` | required cold synthesis shape |
| `MANIFEST-ALL.json` | `d87146dfb3ca7f9cd058d77c7431e721ec684a418ce287f291f4665068546284` | frozen topology |
| `LANES-ALL.json` | `72c88d25845b2c51ac370890feeace0cef52ee6e0cd3bcf5c634dcc191fce7b9` | lane topology |
| `PORTFOLIO-QA.md` | `7f5554cbdbbe3da94a2a87cb1ba52206849917340a951b2a6e463eadd321931e` | receipt/report admission: READY on documented rolling receipts |
| `FINAL-VERIFICATION.md` | `c75fdc6b3d43e19f0834054440e208fd47ba919bd2c4cbf959266574f4da2b78` | fresh official static tier: READY at `5783331`; captured `verify.json` SHA `2fe09cec708b8e08a7f6780640864bd1c84434d693999a1eff980f823e8bc043` |
| `SECURITY-VALIDATION.md` | `6d2faed1e2853d3ec539294987b67b2cc68a3ad36e9e150a0c17f7965252a101` | authoritative override for `AGENT-TOOLING-01` and `DEPLOCK-01` |
| `ROLLING-RECONCILIATION.md` | `b0dd22ec3e99a8512e2c319adc21b5e424b085e68c2a80ccf77d93820f00ceab` | post-assignment status ledger |

Then read all 78 current lane artifact quartets. `PORTFOLIO-QA.md` admits the completed rolling receipts, and `FINAL-VERIFICATION.md` records a fresh official static-tier READY receipt at this HEAD (14/14 stages green). Its `reports/verify.json` was captured before a concurrent `pnpm verify --push` could overwrite that shared artifact. This is static-only: do not infer behavioral, browser, external-provider, push, full, or e2e readiness.

## Exact population and snapshot framing

| Population | Lanes | Paths | Text lines | Bytes |
| --- | ---: | ---: | ---: | ---: |
| Frozen `MANIFEST-ALL.json` at `c93253a3f907fb7fd93d411c511a98ed378505db` | 78 | 5,700 | 936,529 | 76,311,612 |
| Rolling OWNED assignment rows | 78 | 5,704 | 937,932 (5,621 text; 83 binary) | 76,427,616 |

The audit started at `e777c47e5860a105c114e061dcf98bcab1baa952`; selected late lanes can be based at `41e18afe74afa570b67a3e670a1a38863c486a00`; the current reconciliation close is `5783331a8a4403b056be8babc692436e33c4d4d6`. The four rolling-only additions are the event-bus survey, RPG rewind/staleness designs, and staleness diagnosis named in `PORTFOLIO-QA.md`. Never call this one immutable commit or replace 5,700 with 5,704.

## Deduplicated P1/P2 ledger

**Confirmed current at close**

| IDs | Status |
| --- | --- |
| `AGENT-TOOLING-01` | **P1 current, R5.** Retain; security validation proves the self-exemption bypass at the actual hook protocol. |
| `DEPLOCK-01` | **P2 current, narrowed.** Two bounded upgrade candidates (authenticated image→sharp; PDF extraction→pdfjs); not twelve P1 exploits. |
| `DEPLOCK-02`, `GA-H-01`, `client-forms-01`, `PPR-01`, `PROBES-RUNTIME-02`, `RC-01`, `UI-RENDERING-01` | **P2 current** per the rolling ledger/current source receipts. |
| `client-preset-refinery-01` | **P2 current.** Bus work is real but the primary content surface remains unmounted by its CT. |

**Candidate-only: do not promote**

`client-chat-components-01`, `SPR-01`, `SERVER-SEARCH-REFINERY-01`, and `STK-01` are P2 candidates/proof gaps, not confirmed defects. The server-discovery-automation “P1 candidate” is excluded entirely: it is provider-minus-client evidence without a demonstrated browser-product requirement.

**Snapshot-only P2 rows: retain as lane facts, but do not say they are current HEAD without re-reading**

`CC-01`, `CLIENT-SHELL-02`, `CMD-01`, `DARCHH-NZ-01`, `DOCS-CORE-SPINES-01`, `DOCS-CORE-UI-01`, `DOC-CUR-01`, `DOC-CUR-02`, `DDAF-01`, `DDAF-02`, `DOCS-DESIGN-G-M-01`–`03`, `DOCS-DESIGN-T-Z-02`, `DOCS-PROPOSED-AM-01`, `DOCS-PROPOSED-N-Z-01`, `AM-01`–`03`, `LOWER-DB-02`, `LOWER-KIT-01`, `platform-tooling-01`, `scripts-misc-01`, `UI-AI-01`, and `UI-SZ-01`. They are not deduplicated product defects merely because documentation/report lanes repeat the same stale-state class.

`GQZ-01` and `client-lib-01` are snapshot-only P3 lane facts; neither was re-read at closing HEAD, so do not call either current.

## Resolved at HEAD

| ID | Status | Commit |
| --- | --- | --- |
| `DEVRT-01` | resolved through shared positive-PID spawn-lock discipline; no direct GPU launcher regression receipt | `6abe255bb01497824d876c577df6f83355751650` |
| `DEVRT-02` | source newline fixed; prior lane receipt remains historical/pre-fix | `f18314e1db10bc9a6c0aeb91a117032dbb0913b4` |
| `GA-H-02` | per-gate denominators, ratchet exposure, and zero-scan tool errors implemented; re-run the dedicated tooling tests before reiterating R5 | `2b729cd261a43b65af47b91890dadcaa84260592` |
| `SID-01` | custom endpoint probes honestly; focused current integration receipt is 10/10 | `0fd1279cb2c5d4ab3515261c907a571e9be36fe7` |

Later commits `db011083874beb1c56935a5b629b8a3742dcc3b6` and `ddb68eb3048c8a593c4c9efc9365457dbed67595` add actual refinery/automation/databank/discovery bus work. The databank-lens pair (`36c137740c399aaf5e179d41b642df51fa608cc0` / `7501d2eb602dca0a5e7d1a4caa00ddcc4f54b720`) adds then `572306b0bfe139bbcb89087ab557710bd8fc7ce5` self-cleans its temporary `databank.bankHealth` deferment. The W5/W7a/lint commit `2426514c5111408a2a4829259be24ea579f848ad` changes no retained/resolved finding, but removes the exact source shape behind the prior ESLint red; the fresh official static-tier verification is green at this HEAD, while behavioral/push/full/e2e tiers remain unexecuted. Do not backdate this evidence into older scorecards or manufacture new lane findings.

## Final dirty-state caveat

At this handoff, `git status --short` is tracked-clean and has 15 pre-existing untracked entries: `.agents/skills/agent-authoring/`; twelve `.claude/apisurface-*.txt` inventories; `docs/reviews/repository-audit-2026-08-13/`; and `scripts/audit/`. Treat audit artifacts as working-tree inputs, not committed product state. Before publishing synthesis, recheck HEAD, the input hashes above, portfolio admission state, and dirty paths. If any changed, reconcile first—especially if a changed commit touches a retained/resolved finding.
