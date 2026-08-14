# Snapshot policy and coordinator correction

This audit runs while the repository owner is committing and editing the same checkout. It is therefore a
per-lane rolling audit, not a claim that all evidence describes one immutable commit.

- `assignment.txt` is the frozen dispatch snapshot for that lane.
- `read-receipt.tsv` is the byte authority for what the lane actually read. Any assignment-to-receipt drift
  must be disclosed in `report.md` as audit state and relevant tests must be rerun.
- `MANIFEST-ALL.json` defines partition topology and the progress denominator. It must not override an older
  lane assignment or current read receipt.
- Synthesis must name the snapshot range and must not describe the result as a single-commit audit.

Coordinator correction: selected-lane staging originally rewrote `MANIFEST-ALL.json` as a side effect. That
rolling manifest reached `c93253a3f907fb7fd93d411c511a98ed378505db` before the defect was caught. The original
audit began at `e777c47e5860a105c114e061dcf98bcab1baa952`; completed lane assignments preserve their own
actual snapshots. On 2026-08-13, `scripts/audit/build-repository-audit-manifest.mjs` was changed so
`--write-lanes=...` writes only selected assignments and reports `manifestWritten: false`. A behavioral check
proved the global-manifest SHA remained unchanged while a new lane assignment was generated.

From that correction onward, `MANIFEST-ALL.json` is frozen at the `c93253a...` partition denominator. Future
selected assignments may use newer commits, but staging them cannot mutate the global denominator.
