// Gate: tokens-contract (#936) — the canonical token vault, shipped value sets, Resolver manifest, vendored
// official schemas, Orb extensions, and removed-token ledger are ONE fail-closed contract.
//
// FAMILY: singleton, and honestly so. Its subject is one generated bundle reached through the
// `@orb/ui/token-contract` exports subpath; no `lib/` reader is involved at all, and the nearest sibling
// (`css-family-ownership`'s parity arm) judges the GENERATED CSS rather than the vault.
//
// POPULATION PORT: BYTE-IDENTICAL, legacy at eba8ef526. The legacy descriptor read the seven canonical
// documents off disk under `scopeSafety: "whole-project"` with `fsBacked: true`; the final declares
// `{ kind: "token-contract" }`, whose provider loads exactly `contract/resource-artifact.ts`'s
// `TOKEN_CONTRACT_PATHS` — the same seven paths in the same order, one member short being a REFUSAL in both.
// There is no compiler population: `population: { of: "none" }`, and the module reads no `ctx.files`.
//
// THE REMOVAL RATCHET SURVIVED THE CONVERSION, AND THAT IS THE WHOLE INTERESTING PART (#2183, closing the
// §5b audit's ledger row 18). The legacy `run` computed
// `historyRoot = resolve(ctx.root) === REPO_ROOT ? ctx.root : undefined` and handed it to
// `validateTokenContract`, which shelled `git merge-base` + `git show` for the merge-base vault. A final
// policy has NO root, NO filesystem and NO subprocess (§12.3), so the naive conversion would have dropped
// that arm — half the gate's stated subject — while every other check stayed green: the static contract
// still validates, and a portable token deleted with no ledger row simply stops being reported. That is the
// §4.6 catch-regression this program exists to prevent, so the capability was BUILT rather than declared
// lost (guide §3: "a shared-reader gap is BUILD work"). The merge-base document is now read by the
// PROVIDER — the same shape `tracked-files` already uses for `git ls-files` — and published as
// `TokenContractResource.removalBaseline`, which the policy hands straight to
// `validateTokenContractTexts`. The validator's worktree arm is unchanged and still serves
// `validateTokenContract`/`assertTokenContract`; the two arms meet at one `validateRemovedDiff`.
//
// AND THE ARM IS PINNED FOR THE FIRST TIME, THOUGH NOT BY A ROW. The audit measured it UNENFORCED (cut t01:
// forcing `historyRoot` to `undefined` killed no row, because a conformance fixture is not a Git worktree and
// no row could reach the branch). That much has not changed and CANNOT: `ops/policy-conformance.ts` `git
// init`s its fixture root and never commits, so a `mode: "resource"` baseline is `empty` by construction and
// dropping `contract.removalBaseline` from the call below kills no row (re-measured, cut t02). The
// discriminating construction was WRITTEN AND RUN rather than argued (§4.1's fourth-outcome bar): a
// `runPolicyPass` against the REAL repo root — so the provider's git read resolves a merge base — with the
// vault OVERLAID to drop `spacing.tight`, which reports `removed.unrecorded` through the policy and goes
// GREEN the moment the baseline stops being handed in. It lives in
// tests/tooling/verify/gates/token-contract-family.test.ts beside three companions: the live-worktree
// `ready` assertion, a planted merge-base document (both ledger sections), and the
// `unavailable` → diagnostic / `empty` → silent discriminator that keeps every consumer's fixtures clean.
//
// FIX / AUTHORITY: `hard` by construction. Every finding anchors at `line: 0, column: 0` with
// `token: item.code` (`format.schema`), a synthetic label that appears in no source, so `locateFinding`
// could never bind an ordinary position — and a schema violation in a GENERATED artifact is not a site an
// author may absolve. Marker census 0 = 0 = 0 (measured 2026-09-13, N=7730 tracked source files, positive
// control 1196 `@orb-waive` marker-forms), so no door is orphaned.
//
// THE VALIDATOR'S HOME IS STILL OWED A MOVE. It is devtime build/verify machinery (node:fs +
// node:child_process + ajv) sitting beside tokens.build.ts at the `packages/ui` ROOT, reached through the
// `@orb/ui/token-contract` exports subpath — a production-surface declaration to `knip --production`, which
// is why ajv and ajv-formats are `dependencies` of @orb/ui. The honest home is a tooling `tokens` tool
// carrying the validator AND tokens.build.ts (packages may not import tooling). Tracked on the board, and
// this conversion deliberately did not widen the debt: the git read moved INTO the resource provider, which
// is tooling, so the subpath's surface grew by one exported reader and one exported type rather than by a
// new consumer of `node:child_process` in a policy.
//
// WHERE A BROKEN RESOURCE REFUSES — not here. A missing or unreadable bundle member makes
// `resolveResourceDeclarations` THROW at the POPULATION phase and withholds this owner before `create` runs
// (guide §11 ruling 3), so this module owns no not-ready branch and reads through `readyResourceValue`.
// BOTH reachable statuses of the one declaration are `mustRefuse` rows — `missing` (a member deleted) and
// `empty` (a member present but zero-length, which `ops/resource-reader.ts` answers on its own arm) — and
// the receipt PAIR is pinned in tests/tooling/verify/gates/token-contract-family.test.ts, which a row
// cannot express.
//
// THE RECEIPT DENOMINATOR IS THE BUNDLE, NOT THE TOKEN CENSUS (#2292, and it was a live catch-regression
// against the legacy gate). `members: result.scannedTokens` reads as the honest number and is 0 for
// precisely the input this contract exists to reject: an unparseable member scans no tokens, so
// `receiptFailures`' `count === 0` withheld the whole policy and printed `policy receipt refused:
// population "tokens-contract" resolved zero members` INSTEAD of the `json.parse` finding the legacy
// descriptor reported. §12.3: a receipt states what was MEASURED — the seven documents walked — never what
// was FOUND. `mustFlag[2]` is the row that holds it (red before the change, green after); the token census
// rides the receipt SOURCE, where a zero is data rather than a refusal.
//
// DECLARED LIMITS: exactly one, and it is a substrate limit rather than a policy one — the removal ratchet
// is unreachable from a proof ROW (the paragraph above), so the row that holds it is a `runPolicyPass` pin in
// the family test. Every other arm the module owns is carried by a row whose count the §4.1 cut moves
// (t01 findingFile → 2 rows die; t03 the diagnostic-code token → 2 rows die).
import type { TokenContractTexts } from "@orb/ui/token-contract";
import { readTokenContractTexts, validateTokenContractTexts } from "@orb/ui/token-contract";
import { defineGate } from "../contract/policy.ts";
import { TOKEN_CONTRACT_PATHS } from "../contract/resource-artifact.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const CANONICAL = readTokenContractTexts();
const VAULT = TOKEN_CONTRACT_PATHS.base;
const MESSAGE =
  "the token vault violates the pinned DTCG 2025.10 Format/Resolver contract or Orb's closed semantic extensions; invalid token data must never reach Style Dictionary or generated CSS. See packages/ui/token-contract.ts";

function fixtureFiles(texts: TokenContractTexts): Readonly<Record<string, string>> {
  return Object.fromEntries((Object.keys(TOKEN_CONTRACT_PATHS) as (keyof TokenContractTexts)[]).map((field) => [TOKEN_CONTRACT_PATHS[field], texts[field]]));
}

/** A vault whose `spacing.tight` unit is not a DTCG dimension unit. The rem anchor is asserted rather than
 *  assumed: a plant that stopped planting is a proof row that passes for the wrong reason. */
function invalidDimensionFixture(): TokenContractTexts {
  const base = JSON.parse(CANONICAL.base) as Record<string, unknown>;
  const spacing = base["spacing"] as Record<string, unknown>;
  const tight = spacing["tight"] as Record<string, unknown>;
  const value = tight["$value"] as Record<string, unknown>;
  if (value["unit"] !== "rem") {
    throw new Error("tokens-contract conformance plant lost its spacing.tight rem anchor");
  }
  value["unit"] = "ch";
  return { ...CANONICAL, base: `${JSON.stringify(base, null, 2)}\n` };
}

/** The finding's anchor. Every path the validator reports is either already a repo-relative bundle member or
 *  a synthetic pointer (`/removed`, `schemas`) that names no file — and a finding must anchor INSIDE this
 *  policy's own resource population, so the synthetic ones report at the vault, which is the document those
 *  diagnostics are about. */
function findingFile(path: string): string {
  return (Object.values(TOKEN_CONTRACT_PATHS) as string[]).includes(path) ? path : VAULT;
}

export const gate = defineGate({
  id: "tokens-contract",
  family: "tokens-contract",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the token bundle is a closed generated-artifact ResourceHost fact, never a compiler population" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "token-contract" }],
  message: MESSAGE,
  fix: "repair the reported token/schema/Resolver/extension/ledger violation, then run `pnpm --filter @orb/ui tokens:build`; contract: packages/ui/token-contract.ts",
  create: (ctx) => ({
    evaluate: () => {
      const contract = readyResourceValue(ctx.resources.tokenContract());
      const result = validateTokenContractTexts(contract.texts, contract.removalBaseline);
      // THE RECEIPT STATES WHAT WAS MEASURED — the SEVEN bundle documents this policy walked — never what
      // the validator FOUND in them (#2292). `receiptFailures` reds on `count === 0`, and the token census
      // is 0 for exactly the input this gate exists to catch: an unparseable member scans no tokens, so
      // receipting `scannedTokens` withheld the policy and replaced its `json.parse` finding with
      // `policy receipt refused: population "tokens-contract" resolved zero members`. `contract.paths.length`
      // cannot be zero past the provider's own guard (one member short is a population REFUSAL), which is
      // §12.3's rule and the same denominator `loadTokenContract` receipts on its side. The token census is
      // still published — it rides the receipt SOURCE, where a zero is data rather than a refusal.
      ctx.receipt({
        kind: "population",
        source: `tokens-contract [tokens scanned=${String(result.scannedTokens)}]`,
        members: contract.paths.length,
        unresolved: 0,
      });
      for (const item of result.diagnostics) {
        ctx.report.file(findingFile(item.path), {
          line: 1,
          column: 1,
          token: item.code,
          message: `[${item.code}] ${item.path}: ${item.message} — packages/ui/token-contract.ts`,
        });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: fixtureFiles(invalidDimensionFixture()),
      // 41, not 1, and the count is the CLAIM: one non-DTCG unit fails the official Format schema at every
      // `anyOf`/`oneOf` branch the dimension type participates in, and ajv reports each. The legacy row
      // carried no `count` at all, which is the §4.1 gap this closes — a row asserting only `{token}` passes
      // when the gate flags the WRONG node or forty extra ones. The measurement is exact and it MOVES: an
      // ajv upgrade that changes the cascade shape reds this row, which is the point.
      expect: { count: 41, token: "format.schema", messageIncludes: "spacing/tight" },
      why: "a planted non-DTCG dimension unit is rejected by the official Format schema, once per schema branch that admits a dimension",
    },
    {
      mode: "resource",
      files: fixtureFiles({ ...CANONICAL, removed: '{"$schema":"./schemas/removed.schema.json","removed":[],"removedTargets":[]}\n' }),
      // The removed-token LEDGER's own shape arm, which no legacy row reached: the ledger is a closed
      // document and an unrecognised key is a finding, not a tolerated extension. The RATCHET that consumes
      // this ledger cannot be reached from a proof row at all — a `mode: "resource"` root is `git init`ed
      // with no commit, so its baseline is `empty` by construction — and is pinned in
      // tests/tooling/verify/gates/token-contract-family.test.ts instead.
      expect: { count: 1, token: "removed.schema", messageIncludes: 'Unrecognized key: "$schema"' },
      why: "the removed-token ledger is a closed document; an unrecognised key in it is a finding rather than a tolerated extension",
    },
    {
      mode: "resource",
      files: fixtureFiles({ ...CANONICAL, base: "{not json" }),
      // THE GATE'S LOUDEST FINDING, and the row that pins the receipt denominator above (#2292). An
      // unparseable bundle member is the failure mode this contract exists to catch, and the validator
      // answers it with `scannedTokens: 0` — so a receipt of the TOKEN census turned this very finding into
      // `policy receipt refused: population "tokens-contract" resolved zero members`, a withheld policy whose
      // message named the receipt rather than the vault. The legacy descriptor reported it. Measured red on
      // this row before the denominator changed, green after.
      expect: { count: 1, token: "json.parse", messageIncludes: "[json.parse] src/tokens/tokens.json" },
      why: "an unparseable vault is REPORTED as a json.parse finding at the vault, never withheld as a receipt refusal — the §12.3 rule that a receipt states what was MEASURED (the seven documents), never what was FOUND (the token census, which is 0 for exactly this input)",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: fixtureFiles(CANONICAL),
      // AND THIS ROW IS WHY THE BASELINE HAS AN `empty` ARM AT ALL. A fixture root has no commit, so the
      // ratchet has nothing to compare against — VACUOUS, not blind. Had the reader answered `unavailable`
      // there, every proof row of every consumer would carry a `removed.baseline` finding and a clean
      // corpus would be unprovable; had it answered silently on a REAL worktree whose history read failed,
      // that is the silent skip the conversion exists to end. The two conditions are distinguished by
      // `git rev-parse --verify HEAD`, and this row is the `empty` side of that discriminator.
      why: "the complete canonical corpus is clean, and a fixture with no git history reaches no removal verdict rather than an unavailable-baseline finding",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: Object.fromEntries(Object.entries(fixtureFiles(CANONICAL)).filter(([path]) => path !== TOKEN_CONTRACT_PATHS.resolverSchema)),
      // ONE member short is a refusal, never a partial contract: validating six sevenths of the bundle would
      // report a clean vault over a missing schema.
      expect: { messageIncludes: "token-contract is missing" },
      why: "a bundle missing one of its seven documents refuses at the population phase instead of validating the other six",
    },
    {
      mode: "resource",
      files: { ...fixtureFiles(CANONICAL), [TOKEN_CONTRACT_PATHS.resolverSchema]: "" },
      // THE SECOND REACHABLE STATUS of the one declaration (§4.5 / `resource-policy-contract.md` §3.6 asks
      // one pin per declared resource per reachable status). `ops/resource-reader.ts` answers a
      // zero-length member `empty`, not `missing`, and the two travel different arms of the same union — a
      // pin on one says nothing about the other. The needle carries the door's OWN sentence (the member it
      // could not read) beside the status, so it sits inside no generic refusal envelope member.
      expect: { messageIncludes: "token-contract is empty: the token contract member resolverSchema" },
      why: "a bundle whose Resolver schema is present but EMPTY refuses at the population phase naming that member, rather than validating six sevenths of the contract against a zero-byte schema",
    },
  ],
});
