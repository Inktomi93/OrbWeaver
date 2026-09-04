---
kind: research
status: active
updated: 2026-09-03
---

# Snap instrument bundle operator battery — 2026-09-03

## Scope and acceptance

This is the durable execution receipt for `1208-instrument-substrate.md` §10.8 and #1292/#1295. The
inputs below are immutable `run.json` files produced by real Snap CLI invocations. The operator path is
only normal `pnpm snap --help`, the terminal end card, and
`pnpm snap --report <absolute-index> --problems`; source inspection and trace extraction are disallowed.

Every listed index passed the browser-free reader after creation. The reader reproduced run/checkout/SHA/
dirty identity, session provenance where applicable, terminal verdict, analyzer source/lifetime, diagnostic
completeness and immutable artifact paths. The ordinary case retains a real PNG. Playwright traces are raw
human fallback only and must never enter the primary artifact shortlist.

## Immutable battery

| Case | Immutable index | Expected cold-read fact |
| - | - | - |
| ordinary visual + map + diagnostics | `/home/inktomi/inktomi-stack/development/orbweaver/reports/runs/snap/main-346110-2026-09-03T21-50-25-092Z/run.json` | pass; `app-snapshot`, ARIA and map arms; primary `snaps/bundle.png` (5,182 bytes) and JSON |
| planted motion finding | `/home/inktomi/inktomi-stack/development/orbweaver/reports/runs/snap/main-359914-2026-09-03T21-52-34-408Z/run.json` | fail; selective motion is distinct from refused fixture `app-snapshot`; motion artifact retains 63 raw/budgeted frames and the over-budget `#spin` width flag |
| planted interaction-performance finding | `/home/inktomi/inktomi-stack/development/orbweaver/reports/runs/snap/main-352471-2026-09-03T21-51-27-507Z/run.json` | fail; selective perf identifies the two `#target` steps with roughly 3.9s blocking/rAF gaps across two tape cycles |
| CPU profile positive | `/home/inktomi/inktomi-stack/development/orbweaver/reports/runs/snap/main-353812-2026-09-03T21-51-41-764Z/run.json` | pass; `cpu-profile/cpu-cpu.cpuprofile` is primary and populated (71 nodes, 28,679 samples) |
| React development profile | `/home/inktomi/inktomi-stack/development/orbweaver/reports/runs/snap/main-364670-2026-09-03T21-53-16-320Z/run.json` | pass; session call/window/binding are explicit; 1 renderer, 2 commits, 4 ranked components, and `HotComponent[key=hot-key]` carries 9.6ms self time |
| planted request failure in stateful session | `/home/inktomi/inktomi-stack/development/orbweaver/reports/runs/snap/main-394701-2026-09-03T22-00-40-106Z/run.json` | fail; request artifact identifies the failed network member and the session call/window |
| stateful session export + HAR | `/home/inktomi/inktomi-stack/development/orbweaver/reports/runs/snap/main-395544-2026-09-03T22-00-52-676Z/run.json` | pass export of the same session; HAR has 10 correlated entries; console/diagnostic/request/session artifacts are primary; `trace-000.zip` is raw fallback |
| session continuation | `/home/inktomi/inktomi-stack/development/orbweaver/reports/runs/snap/main-395661-2026-09-03T22-00-53-582Z/run.json` | pass; same binding, call/window advance to 2, proving export did not close the browser owner |
| matrix + appearance scenario | `/home/inktomi/inktomi-stack/development/orbweaver/reports/runs/snap/main-365868-2026-09-03T21-53-29-094Z/run.json` | pass; one matrix aggregate plus all 16 cell JSON artifacts; session provenance identifies call/window 2 |
| explicit React compatibility refusal | `/home/inktomi/inktomi-stack/development/orbweaver/reports/runs/snap/main-364386-2026-09-03T21-53-14-544Z/run.json` | refusal, never a clean zero; the report names `react-profile=REFUSED`, diagnostic incompleteness, and the shape-drift evidence artifacts |

For any row, the exact recovery command is:

```text
pnpm snap --report <absolute-index-above> --problems
```

Useful cold-agent follow-ups must be constructible from help alone, for example:

```text
pnpm snap --report <index> --all --arm perf
pnpm snap --report <index> --all --level error --source orb-console-ring
pnpm snap --report <index> --all --context 0 --page 0 --window 1
```

## Planted controls and observed repairs

- `tests/tooling/snap/ops/run-bundle.suite.int.test.ts` is the exact #1295 suite. It covers immutable
  writer/reader round trips, same-SHA worktree ambiguity, byte-sensitive dirty identity, bounded diagnostic
  severity, corrupt/stale/incomplete refusal, interruption, session provenance, query validation and help.
- A cold-read of the first session export found `trace-000.zip` incorrectly classified as primary. A new
  planted filename control failed, the classifier was repaired, and the replacement export index above
  now classifies it as `raw-fallback`. The immutable earlier index was deliberately not rewritten.
- The normal help now advertises `--report <index|run-id|latest>`, `--reports`, filters and the explicit
  browser/stage/session/run-slot-free reader contract.

## Independent acceptance still owed

The orchestrator must give only the normal help/card/report output above to two or three cold low/medium
agents. They must identify identity, selective versus always-on arms, highest-severity problem, omissions,
primary artifact and a valid narrower filter without source. Side-eye must inspect the ordinary PNG at its
indexed path. A verifier must re-check artifact identity/completeness and the writer→index→reader round trip.
If any reviewer needs to unzip a Playwright trace for an ordinary explanation, acceptance fails.
