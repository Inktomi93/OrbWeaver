// Policy: duplicate-action-doors (issue #252) — the more-than-one-door IA class, made structural: one
// tRPC MUTATION reachable from N distinct components inside ONE rail section is the same verb wearing N
// doors on one plane ("new chat lives in three places"). NOTHING hardcodes a procedure or a section name:
// the procedure key IS the `trpc.<…>` property path, and the plane is derived from the co-located section
// definitions against `SECTION_IDS`' one home. Some duals are ruled UX (a hero CTA beside a rail button);
// the policy makes a NEW door a decision instead of an accident.
//
// FAMILY `action-doors` — the shared reader is `lib/action-door-fact.ts` (`actionDoorFact`), the ONE walk
// that derives the section vocabulary, the plane map and the door census. The sibling is
// `duplicate-action-doors-health`, which owns the two §4.6 BLINDNESS TRIPWIRES over that same walk. The
// split axis is AUTHORITY, which is the only axis a split may take: this policy's exceptions are reviewed
// grants, and a tripwire that could be granted away is not a tripwire.
//
// THE RULING IS A NAMED DOOR SET, NOT A CARDINALITY (#2101, 2026-09-12), AND THAT SURVIVES THE CONVERSION
// INTACT. A per-pair COUNT budget could not say WHICH doors it ruled, so a THIRD door was absolved by
// arithmetic whenever an old one left, and a ruled door that MOVED kept the count at 2 and reported nothing.
// The grant identity therefore CARRIES THE SET: `subject` is the pair key `<plane>::<procedure>` and
// `operation` is `duplicate-action-door-set:<every live door of that pair, sorted>`. A third door, a moved
// door and a swapped door all change the operation string, so the ruling stops matching and the finding is
// effective; the orphaned grant is consumed zero times and central authority alarms it `stale-reviewed-grant`
// (#568's two-sided promise, now owned by the engine instead of by a hand-rolled sweep).
//
// WHY THE IDENTITY IS A SET AND NOT A DOOR — do not "simplify" the operation back to a single path. Two
// finer granularities were tried and BOTH fail:
//   · PER-DOOR (one grant per cited door) cannot satisfy the MANDATORY §6.2 grant witness.
//     `ops/policy-conformance.ts#grantIdentityFailure` requires the witnessed fixture to leave EXACTLY ONE
//     granted finding and ZERO effective ones; a two-door pair emits two findings, so one always survives the
//     single synthetic grant — and no fixture can emit exactly one door finding, because a pair below two
//     doors is below the duplication floor by definition.
//   · PER-EXCESS-DOOR (skip a lexicographic "incumbent") passes the witness and re-opens the swap hole:
//     sorted doors `[components/message-actions-row.tsx, hooks/use-guided-actions.ts]` pick a DIFFERENT
//     incumbent than `[hooks/use-continue-turn.ts, hooks/use-guided-actions.ts]`, so replacing
//     `use-continue-turn.ts` with `message-actions-row.tsx` leaves the same grant consumed and the swap goes
//     silent — exactly the #2101 defect.
// The SET is the only identity that is both witnessable and two-sided.
//
// ONE FINDING PER PAIR, WHICH IS §5's AGGREGATION RULE, NOT A CONVENIENCE. A reviewed grant is strictly 1:1:
// a row matching N > 1 candidates suppresses NOTHING and alarms `over-broad`. The ruled unit here is the
// pair's whole door SET, so the policy reports ONE finding per `(subject, operation)` through
// `lib/reviewed-grant-findings.ts`, anchored at the first door in path order with EVERY door named
// `file:line` in the message.
//
// THE ONE GUARANTEE THAT DID NOT SURVIVE, stated rather than absorbed: #2101's `new-doors` arm anchored each
// unruled door AT ITS OWN FILE, and the aggregated finding anchors at the first door in path order instead. A
// policy may not read the grant table, so it cannot know which door is the new one. THE COUNTER-EVIDENCE IS
// WHY THIS IS A REPAIR RATHER THAN A LOSS: the retired arm was measurably wrong about that anyway — the
// planted third `chat.forkChat` door made the old count arm accuse `message-actions-row.tsx`, the door that
// was there first. Loudness is untouched: the finding is still effective and still names every door with its
// line, and the reader diffs the named set against their change.
//
// EXEMPT_PROCEDURES IS RETIRED INTO THE SAME DOOR (2026-09-13). Its single row —
// `settings.updateUserSettingsSection`, the settings-SECTION contributor seam — used to leave the census
// entirely, which meant the policy could not see a third door land on it either. Its ruling is now four
// exact grants (one per qualifying plane) carrying the row's `why` VERBATIM and its stated END condition as
// `endsWhen`. THE COST IS REAL AND IS NAMED: a NEW settings-section door changes its plane's door set, so the
// grant stops matching and `pnpm check` reds until the row is re-pointed — where the retired table absorbed
// it silently. That is the honest price of §7.7 (no gate-local exemption table survives) and the rationale
// the row itself states ("N call sites BY CONSTRUCTION") argues for a PREDICATE that derives the verb
// identity from each site's `section` discriminant instead. That predicate is real work with its own proof
// corpus and was deliberately NOT invented inside a conversion; it is the follow-up this row is waiting for.
//
// AND THE SAME MECHANISM REACHES A PURE RENAME. Moving or renaming a SANCTIONED door file with no semantic
// change at all rewrites the operation string, so the pair reports and its row alarms stale until the ruling
// is re-pointed. That is correct — a ruling names files, and a ruling that survived its files stopped being
// about anything — but it is not obvious, so it is named here rather than discovered.
//
// WHERE THE ROWS ARE AUTHORED. In `tooling/src/_shared/action-door-rulings.ts`, which
// `verify/lib/reviewed-grants.ts` maps into the central table. That placement is FORCED by an import cycle,
// not a preference: the `ast subset-callers` lens must render the same rulings, a cross-tool import may only
// enter through `verify/index.ts`, and that barrel reaches `ops/debt.ts` → `ast/index.ts` → the lens itself
// (measured 2026-09-13: five `lint/suspicious/noImportCycles` errors). `_shared` is the floor both tools read
// down into, and the retired `DOORS_BASELINE_REL` sat there for exactly this reason. Consumption, staleness
// and over-broad judgment are unchanged and entirely central; THIS POLICY READS NEITHER FILE.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED. See the header of `lib/action-door-fact.ts` for the shared
// expression and `tests/tooling/verify/gates/action-doors-family.suite.test.ts` for the measured differences and
// the inside/outside controls. Legacy `scanRoot` admitted `packages/client/src/features/**` plus the single
// path `packages/client/src/state/section-ids.ts`; the final admits `features/**` + `state/**`.
// legacy − final = ∅. final − legacy = the rest of `packages/client/src/state/**`, which is an INTENTIONAL
// CORRECTION and is FORCED: the legacy readers walked `project.getSourceFiles()` directly, so `scanRoot`
// never controlled what they READ, and `SECTION_IDS`' sanctioned spread source
// (`state/core-section-ids.ts`, the #947 shape) sits outside the one admitted path. Under this contract a
// fact reads only its admitted files, so an unadmitted spread source would silently shrink the vocabulary —
// the exact blindness #947 was minted against.
//
// MARKER CENSUS 0 = 0 = 0. This gate's exception mechanism was always the baseline JSON plus
// `EXEMPT_PROCEDURES`, never a comment grammar: it never declared a private marker and the tree carries zero
// `@orb-gate-ignore duplicate-action-doors` occurrences, so the conversion translates nothing and orphans
// nothing. Measured 2026-09-13; the receipt is in the lane report.
//
// DECLARED BLIND SPOTS, both stated in #252 and both owned by the RUNTIME half (design-audit's
// same-role-and-name lens): a registry-rendered action is ONE call site behind N rendered slots (this is
// exactly how the founding "new chat" complaint escapes tier 1 — its three doors all call one shared state
// action), and a responsive pair is N call sites behind ONE rendered door.
import { doorSetOperation } from "../../_shared/trpc-doors.ts";
import { defineGate } from "../contract/policy.ts";
import { actionDoorFact, MIN_DOORS, SECTION_IDS_HOME } from "../lib/action-door-fact.ts";
import type { ReviewedGrantFileCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantFileCandidates } from "../lib/reviewed-grant-findings.ts";

const MESSAGE =
  "one tRPC mutation is invoked from more than one component inside a single rail section, and no reviewed " +
  "grant names that exact door set — the same verb has grown a door on a plane that already has one (the " +
  'rule-10 "same action, same home" IA class). See docs/law/UI-Architecture-and-Layout.md §4.3.';

/** Required by the shared reporter and UNREACHABLE here, stated plainly rather than implied: this policy
 *  never marks a candidate unreadable. A vocabulary shape the tuple reader cannot establish THROWS out of
 *  `lib/tuple-read.ts` and withholds the owner, and a call site whose procedure cannot be read is not a door
 *  at all. Nothing enforces that this text is never printed; the two refusals above are what make it so. */
const UNREADABLE =
  "a duplicate-door pair was censused without a readable door — the plane census is unreadable, which is itself the violation. (tooling/src/verify/gates/GATE-AUTHORING.md)";

const FIX =
  "Give the section ONE component that owns the verb and let the other affordances reach it (a shared hook, " +
  "a state action, or the existing door). If the exact door SET is ruled UX, add an exact " +
  "ruling to tooling/src/_shared/action-door-rulings.ts naming the `<plane>::<procedure>` subject and the " +
  "COMPLETE door set, with its `why` and `endsWhen`; verify/lib/reviewed-grants.ts maps it into the central " +
  "reviewed-grant table. The ruled unit is the SET: a door that moves, leaves, joins or is merely RENAMED " +
  "changes the operation, which is what makes the row stop matching instead of silently absorbing the change.";

export const gate = defineGate({
  id: "duplicate-action-doors",
  family: "action-doors",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@client"], under: ["packages/client/src/features/**", "packages/client/src/state/**"] },
  analysis: "syntax",
  // The verdict quantifies over every feature at once: a plane is derived from a definition in one file and
  // its doors live in others, so no subset of files carries a whole pair.
  execution: "entire-population",
  facts: [actionDoorFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const census = ctx.fact(actionDoorFact);
      // The DOOR SITES the shared walk established — this policy's own denominator, so a census that shrank
      // while the client did not is visible on the run line instead of inferred from silence.
      ctx.receipt({ kind: "population", source: "duplicate-action-doors", members: census.doorCount, unresolved: 0 });
      const candidates: ReviewedGrantFileCandidate[] = census.pairs
        .filter((pair) => pair.doors.length >= MIN_DOORS)
        .flatMap((pair) => {
          const operation = doorSetOperation(pair.doors.map((door) => door.file));
          return pair.doors.map((door) => ({
            subject: pair.key,
            operation,
            file: door.file,
            line: door.node.getStartLineNumber(),
          }));
        });
      reportReviewedGrantFileCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
    },
  }),
  mustFlag: [
    {
      // THE #947 SPLIT: the section id reaches the vocabulary only through the imported CORE_SECTION_IDS
      // spread. Unresolved, `chats` is not a known id, the definition is not recognised as a rail section,
      // and both doors regroup under the FEATURE DIRECTORY — the finding still fires but under the wrong
      // plane key (`feature:chat::…`), which is the grant SUBJECT. So a reviewed row written for the real
      // plane silently stops matching, and two sections sharing a feature dir collapse into one bucket.
      mode: "source",
      files: {
        "packages/client/src/state/core-section-ids.ts": 'export const CORE_SECTION_IDS = ["chats"] as const;\n',
        [SECTION_IDS_HOME]: 'import { CORE_SECTION_IDS } from "./core-section-ids.ts";\nexport const SECTION_IDS = [...CORE_SECTION_IDS, "home"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
        "packages/client/src/features/chat/components/b.tsx": "export const B = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      expect: { count: 1, messageIncludes: "Subject: chats::chat.forkChat" },
      // THE REVIEWED-GRANT IDENTITY WITNESS (§6.2). This policy's whole exception door is the pair key as
      // `subject` plus the exact door SET as `operation`, so the row proves that pair is bindable: the same
      // fixture re-runs with one generated grant naming exactly these authored strings and holds only at
      // `grantedFindings` 1 / `effectiveFindings` 0 / `authorityAlarms` 0. BOTH STRINGS ARE AUTHORED
      // LITERALS and `doorSetOperation` is deliberately NOT reused here: deriving either from the module
      // would move the emitted and the authored value together under a rename, and the row would stay green
      // while every real grant in the central table broke.
      grant: {
        subject: "chats::chat.forkChat",
        operation: "duplicate-action-door-set:packages/client/src/features/chat/components/a.tsx, packages/client/src/features/chat/components/b.tsx",
      },
      why: "THE #947 SPLIT RED, and the grant-identity witness. Measured at HEAD, the unresolved reader reported the SAME pair under `feature:chat::chat.forkChat` — a mis-keyed plane, so a reviewed row written for `chats` quietly stopped matching. The expectation pins the DERIVED plane in the subject, not merely the presence of a finding, and the annotation proves that subject plus the exact door set reaches the central door",
    },
    {
      mode: "source",
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
        "packages/client/src/features/chat/components/b.tsx": "export const B = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      expect: { count: 1, messageIncludes: "components/a.tsx:1, packages/client/src/features/chat/components/b.tsx:1" },
      why: "THE FOUNDING SHAPE — one verb, two components, one rail section, no reviewed grant: the pair is a decision that has not been made. The expectation pins the SITE LIST rather than the count alone, because the aggregation to one finding is exactly what makes a single exact grant able to consume it (§5) and a reader still needs both doors named",
    },
    {
      // THE SET IS THE RULING, IN THE HALF A CARDINALITY COULD NEVER EXPRESS: three doors on a pair whose
      // two-door ruling is granted. The operation string changes, the grant stops matching, the finding is
      // effective, and the orphaned row alarms. Under a count budget of 2 this shape was admitted whenever
      // an old door had left, which is the #2101 defect this row keeps dead.
      mode: "source",
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
        "packages/client/src/features/chat/components/b.tsx": "export const B = () => trpc.chat.forkChat.mutationOptions();\n",
        "packages/client/src/features/chat/components/c.tsx": "export const C = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      expect: { count: 1, messageIncludes: "components/c.tsx:1" },
      why: "A THIRD DOOR CHANGES THE RULED SET (#2101): the operation carries every live door, so a pair granted at two doors reports again at three and the two-door row consumes nothing. A count budget of 2 admitted exactly this shape the moment an old door left — the arithmetic could not say WHICH two doors it meant",
    },
    {
      mode: "source",
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.useMutation();\n",
        "packages/client/src/features/chat/components/b.tsx": "export const B = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      expect: { count: 1, messageIncludes: "Subject: chats::chat.forkChat" },
      why: "BOTH TanStack Query CREATION SPELLINGS are one door grammar (`_shared/trpc-doors.ts`): a pair split across `useMutation` and `mutationOptions` is still one verb wearing two doors, and a reader that knew only one spelling would report a clean half of the census",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/state/core-section-ids.ts": 'export const CORE_SECTION_IDS = ["chats"] as const;\n',
        [SECTION_IDS_HOME]: 'import { CORE_SECTION_IDS } from "./core-section-ids.ts";\nexport const SECTION_IDS = [...CORE_SECTION_IDS, "home"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      why: "the SPLIT's green half: the same imported-spread vocabulary with ONE door on the plane — resolving the spread restores the plane without inventing a duplicate",
    },
    {
      mode: "source",
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats", "characters"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/character/lib/characters-section.tsx": 'export const c = { id: "characters", rail: { label: "Characters" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
        "packages/client/src/features/character/components/b.tsx": "export const B = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      why: "DECLARED LIMIT — two doors on two DIFFERENT planes is not the defect: the class is one verb duplicated where a user can see both at once",
    },
    {
      mode: "source",
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx":
          "export const A = () => { trpc.chat.forkChat.mutationOptions(); return trpc.chat.forkChat.mutationOptions(); };\n",
      },
      why: "THE UNIT IS THE COMPONENT, not the call: one file wiring the same verb twice is one door — a user sees one affordance",
    },
    {
      mode: "source",
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/memory-settings-section.tsx": 'export const m = { id: "chat-memory", anchor: "chat-behavior" };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      why: "DECLARED LIMIT — a settings-section CONTRIBUTION lives in the same `lib/` and matches the filename shape, but carries no `rail` field and no vocabulary id, so it never mints a plane",
    },
    {
      mode: "source",
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => api.chat.forkChat.mutationOptions();\n",
        "packages/client/src/features/chat/components/b.tsx": "export const B = () => other.chat.forkChat.mutationOptions();\n",
        "packages/client/src/features/chat/components/c.tsx": "export const C = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      why: "THE RECEIVER IS PART OF THE DOOR GRAMMAR: only the `trpc.` proxy names a procedure, so two same-named members on some other object are not doors and cannot join the ONE real door into a pair. The real door is load-bearing twice over — it keeps the census non-empty (a zero census is this policy's refusal, not a pass) and it makes the fence falsifiable: drop the `trpc.` prefix check and this becomes three doors on one plane",
    },
  ],
  mustRefuse: [
    {
      mode: "source",
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
      },
      expect: { messageIncludes: 'population "duplicate-action-doors" resolved zero members' },
      why: "a client with a rail section and NO tRPC mutation door anywhere is not a clean IA verdict — it is a census that measured nothing. The policy must withhold its empty denominator; a silent pass here would report `duplicate-action-doors ✓` for a corpus in which the door grammar had stopped resolving entirely",
    },
  ],
});
