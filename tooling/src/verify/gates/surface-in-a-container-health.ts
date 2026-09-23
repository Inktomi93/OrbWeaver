// Policy: surface-in-a-container-health — the two-sided RATCHET on `surface-in-a-container`'s shell
// exemption. The excluded feature directory must still EXIST; an exemption naming a feature that is gone has
// stopped exempting anything and would silently un-scan the name the day someone reuses it.
//
// A SEPARATE POLICY from `surface-in-a-container`, not an arm of it. That policy is `ordinary` — its finding
// anchors on a surface's exported component and an author can waive one. This verdict is an ABSENCE claim
// about an exact PATH: it has no node, therefore no position, therefore no ordinary door by construction
// (guide §2.1's authored-coordinate rule: *"re-anchor on authored text, or split to `hard`"*), and there is
// nothing a site-local waiver could correctly say about a directory that is not there.
//
// FAMILY: a declared SINGLETON since #0038 (it was filed under `surface-composition`). That family's shared
// reader is `lib/surface-composition.ts` — what a surface FILE does (arrival focus, structural root, layout
// container, exported component). This policy reads no surface file at all: its subject is whether one feature
// DIRECTORY exists in the authored client-feature tree, so no reader of the family's could serve it, and a
// constant shared only to satisfy `policy-family-readers` would prove a spelling rather than a family.
//
// SUCCESSOR PROOF for the retired legacy arm (§4.6). LEGACY at 854c81c80, `surface-in-a-container.ts:131-143`:
// a `STALE_PREFIX` finding reported at the GATE'S OWN SOURCE FILE when a `SHELL_EXEMPT` name had no feature
// dir, guarded by `ANCHOR_FEATURE = "chat"` so a synthetic conformance tree could not "prove" the shell tier
// had vanished. Three things change and each is deliberate:
//   1. THE SUBJECT IS DECLARED DATA, NOT A GATE-OWNED TABLE. §12.5 forbids a gate-local exemption table in a
//      final policy, so the excluded feature is the `notUnder` root on the sibling's population and this
//      policy holds the one name it ratchets. Both spellings name `app-shell`, which is the whole content of
//      the retired `SHELL_EXEMPT` Set.
//   2. THE ANCHOR MOVES from the gate's own source file to `packages/client/package.json`. A finding must sit
//      inside the policy's own resource population, and a gate module is not in one — the client manifest is,
//      and it is the `server-layout` precedent for an absence verdict (a declared resource read for its PATH,
//      `resource-policy-contract.md` §3.1). The manifest's `name` is read so the declaration is CONSUMED; an
//      unconsumed declaration is a receipt-phase refusal.
//   3. THE `ANCHOR_FEATURE` GUARD RETIRES INTO THE RUNTIME. It existed because the legacy gate ran over a
//      synthetic mini-project that had no real features. This policy's subject is a DECLARED `authored-tree`
//      resource: a fixture that supplies no client feature tree at all is refused at the population phase
//      rather than judged, which is the same protection stated as a refusal instead of a hand-rolled guard.
//      `mustPass[1]` is the positive control that a tree WITH other features still reds when app-shell is the
//      one missing — i.e. the arm is not passing merely because the fixture is thin.
//
// CATCH DELTA: none. The condition, the exempted name and the two-sidedness are identical; only the anchor
// and the guard mechanism moved, and both are stated above.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `surface-in-a-container` descriptor at fc5cad14c0f060ce35d257d96955d778e756d605, the parent of the conversion
// `ff07e1302`; this module did not exist there, so it is measured against the module it was carved from,
// `surface-in-a-container` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The
// `854c81c80` cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both
// citations resolve to this source. Over the SAME 7,458 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), the legacy harness — no `scanRoot` — dispatched 7,458, and the final
// `population` admits 0; the subject is the declared `client-feature` tree + `package-metadata:client`.
// legacy − final = all 7,458 harness candidates — dispatched to the legacy `run`, which read none of them (its
// subject came off disk through the parent's `SHELL_EXEMPT` directory check guarded by `ANCHOR_FEATURE`); retired
// with that read. final − legacy = ∅. Controls: the legacy side is non-empty and the final side is empty by
// declaration, so equality cannot pass vacuously; outside `docs/__cbbhr_out_control.ts` rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
import { defineGate } from "../contract/policy.ts";
import { AUTHORED_TREE_PATHS } from "../contract/resource-tree.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const FEATURES = AUTHORED_TREE_PATHS["client-feature"];
/** The one feature `surface-in-a-container` excludes from its population. Kept in ONE place per side: the
 *  sibling spells it as a `notUnder` root, this policy spells it as the name it ratchets. */
const EXEMPT_FEATURE = "app-shell";
const EXEMPT_DIR = `${FEATURES}/${EXEMPT_FEATURE}`;
const CLIENT_MANIFEST = "packages/client/package.json";

const MESSAGE =
  `stale shell exemption — \`surface-in-a-container\` excludes \`${EXEMPT_DIR}\` from its population because ` +
  "the shell tier is the top-level container PROVIDER (UI-Architecture-and-Layout.md §4's role table), and " +
  "that directory no longer exists. An exemption that outlives its feature exempts nothing today and " +
  "silently un-scans the name the day a future feature reuses it, so it ratchets down with the feature " +
  "rather than sitting there looking like a decision.";

const FIX =
  `delete the \`notUnder: ["${EXEMPT_DIR}/**"]\` root from \`surface-in-a-container\`'s population and the ` +
  "`EXEMPT_FEATURE` constant here, in the same commit. If the shell tier MOVED rather than went away, " +
  "re-point both at its new directory — the exclusion follows the ROLE, not the path.";

const CLIENT_TREE = { "packages/client/src/features/chat/surfaces/chat.tsx": "export const Chat = () => <div>x</div>;\n" } as const;
const CLIENT_PKG = { [CLIENT_MANIFEST]: '{"name":"@orb/client","private":true}' } as const;
const SHELL = { "packages/client/src/features/app-shell/surfaces/app-shell.tsx": "export const AppShell = () => <div>x</div>;\n" } as const;

export const gate = defineGate({
  id: "surface-in-a-container-health",
  family: "surface-in-a-container-health",
  authority: "hard",
  severity: "error",
  population: {
    of: "none",
    why: "the client feature tree and the client manifest are closed ResourceHost facts; this policy judges a DIRECTORY's existence, which no compiler population can answer",
  },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "authored-tree", id: "client-feature" },
    { kind: "package-metadata", id: "client" },
  ],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: (): void => {
      const features = readyResourceValue(ctx.resources.authoredTree("client-feature"));
      // The manifest is declared for its PATH — it is this verdict's only in-population anchor — so its
      // value is read here to CONSUME the declaration (an unconsumed one is a receipt-phase refusal).
      const manifest = readyResourceValue(ctx.resources.packageMetadata("client"));
      if (manifest.name === "" || features.some((entry) => entry.path === EXEMPT_DIR || entry.path.startsWith(`${EXEMPT_DIR}/`))) {
        return;
      }
      ctx.report.file(CLIENT_MANIFEST, { message: MESSAGE, fix: FIX });
    },
  }),

  mustFlag: [
    {
      mode: "resource",
      files: { ...CLIENT_TREE, ...CLIENT_PKG },
      expect: { count: 1, line: 1 },
      why: "THE RATCHET, and the successor to the legacy `STALE_PREFIX` arm: the client feature tree is populated and real, and the exempted `app-shell` feature is not in it. The exemption has outlived its feature and must red rather than quietly un-scan the name",
    },
    {
      mode: "resource",
      files: {
        ...CLIENT_PKG,
        "packages/client/src/features/app-shell-lookalike/surfaces/pane.tsx": "export const Pane = () => <div>x</div>;\n",
      },
      expect: { count: 1, line: 1 },
      why: "THE PREFIX FENCE — and it must be a `mustFlag`, which is the correction: the shell feature is GONE and the only thing near its name is `app-shell-lookalike`, so the ratchet must still fire. Membership is tested as the exact directory OR a `/`-terminated prefix; drop the `/` and `app-shell-lookalike/...` satisfies `startsWith(EXEMPT_DIR)`, the arm returns early, and this row goes 1 → 0. DIRECTION: that cut makes the policy flag LESS — it widens the ACQUITTING set — so no `mustPass` can hold this fence. The `mustPass` below deliberately no longer claims to",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { ...CLIENT_TREE, ...CLIENT_PKG, ...SHELL },
      why: "the row STILL EARNED: the exempted feature exists, so the exclusion on the sibling's population is doing real work and this policy is silent. THE POSITIVE CONTROL for mustFlag[0] — the two fixtures differ by exactly the app-shell directory, so the red above cannot be coming from a thin tree",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/features/app-shell-lookalike/surfaces/pane.tsx": "export const Pane = () => <div>x</div>;\n",
        ...CLIENT_PKG,
        ...SHELL,
      },
      why: "a lookalike feature ALONGSIDE the real shell changes nothing: the shell itself satisfies the membership test, so the arm acquits on the shell and the lookalike is irrelevant. THIS ROW HOLDS NO FENCE and its `why` used to claim one — it said the `/`-terminated prefix was pinned here, which is false in the plainest way: the row passes with the `/` and passes without it, because `.some()` is already satisfied by the shell. The fence lives in the `mustFlag` above, where the shell is ABSENT and the lookalike is the only near-miss. Kept because it is a real (if weak) statement about coexistence, not because it discriminates",
    },
  ],
});
