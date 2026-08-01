# kit-candidates lens — first run (2026-07-25)

Ran `pnpm lens:kit-candidates` (jscpd, `--min-tokens 40`, format `typescript,tsx`, scope
`packages/server/src` + `packages/client/src`, ignores tests/migrations/snapshots/fixtures/`*.d.ts`/
generated tokens/suppressions baselines). Only cross-corpus pairs (one side server, one side client)
are surfaced — same-side clones stay jscpd.json's job.

## Ranked findings (min-tokens 40)

1. **[kit candidate]** 73 tokens, 16 lines
   - server: `packages/server/src/kit/serde/card/index.ts:300-320`
   - client: `packages/client/src/forms/entity-form-base.ts:28-43`
   - Both implement a recursive `stableStringify` (sort object keys at every depth, `JSON.stringify`
     `undefined`-return workaround, identical array/object branching) — genuinely the same pure,
     zero-I/O, zero-domain algorithm authored twice. Textbook kit candidate.

## Threshold exploration (informational — not part of the 40-token run above)

Re-running at `--min-tokens 25` surfaces 2 more pairs (30 tokens / 26 tokens), both also classified
`kit candidate`: a small structured-turn helper echoed in a credentials form model, and a chat macro
snippet echoed in the preset editor model. Neither was inspected past the lens's own classification for
this report (per the spec: candidates are individually-judged chips, not acted on here).

## Honest summary

- At min-tokens 40 the signal is thin but real: 1 hit, and it's not boilerplate — `stableStringify` is
  a genuine algorithm duplicated verbatim across the server/client boundary, exactly the kind of thing
  this lens exists to catch.
- Dropping to 25 triples the hit count (3 total) but the two extras are much smaller (26-30 tokens,
  8 lines) — plausibly coincidental small-fragment overlap (a shared destructure-and-map shape) rather
  than a shared algorithm; would need per-pair human judgment to confirm.
- Recommendation: keep 40 as the default noise floor for routine runs (todays's single hit is a clean,
  actionable signal); an orchestrator doing a periodic deeper sweep can drop to 25-30 and manually vet
  the extra pairs — going lower than that is likely to drown in coincidental short-fragment noise given
  how small this pair count already is at 40.
