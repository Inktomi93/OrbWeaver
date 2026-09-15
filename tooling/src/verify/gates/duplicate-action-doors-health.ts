// Policy: duplicate-action-doors-health — the §4.6 BLINDNESS TRIPWIRES for `duplicate-action-doors`, split
// out at its conversion (#1584) because they differ on AUTHORITY: `hard`, identical `family`. Both of the
// family's derivations are NAME-KEYED (`SECTION_IDS`, the `rail`-carrying section definition) and either one
// coming back empty would silently regroup every door under its feature directory while the census still
// reported a number. A reviewed grant could license that away, which is precisely what a tripwire must not
// permit, so the arms cannot live beside the door verdict.
//
// TWO ARMS, MUTUALLY EXCLUSIVE AND ORDERED. VOCABULARY — `SECTION_IDS` resolved to zero members, so no
// definition can be recognised as a rail section at all. SECTIONS — the vocabulary resolved but ZERO
// definitions matched it, so the plane map is empty. The vocabulary arm returns first: with no vocabulary the
// plane map is empty BY CONSTRUCTION and reporting both would be one defect wearing two findings.
//
// AN ABSENCE VERDICT ANCHORS THROUGH THE SHARED RULE, never on its own subject: the thing being accused is a
// declaration that is missing, which `ctx.report.file` cannot admit. `lib/absent-subject-anchor.ts` prefers
// the vocabulary home when it is present and falls back to the lowest admitted path. The name of the missing
// subject moves into the MESSAGE, where it was always the load-bearing half.
//
// THE LEGACY REAL-TREE ANCHOR HAS NO SUCCESSOR AND THAT IS THE CONVERSION WORKING. The descriptor gated both
// arms on `fileLoaded(ctx, "packages/db/src/schema/index.ts")` — a file present on every real run and needed
// by no example — purely so its own conformance mini-projects would not trip the tripwires. Final proofs run
// on ISOLATED projects (§6.5), so each arm is driven directly by its own fixture and the cross-package anchor
// is both unnecessary and unreportable: `packages/db` is outside this family's population.
import { defineGate } from "../contract/policy.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";
import { actionDoorFact, SECTION_IDS_HOME } from "../lib/action-door-fact.ts";

const BLIND_VOCAB =
  "BLINDNESS TRIPWIRE — `SECTION_IDS` resolved to ZERO members, so no definition can be recognised as a rail " +
  "section and every duplicate-action door would regroup under its feature directory while the census still " +
  "reported a number. Re-point SECTION_IDS_HOME in tooling/src/verify/lib/action-door-fact.ts";

const BLIND_SECTIONS =
  "BLINDNESS TRIPWIRE — zero rail-section definitions were derived from the tree, so every call site would " +
  "fall back to its feature directory and the family would silently stop judging planes. Re-point " +
  "SECTION_FILE_RE in tooling/src/verify/lib/action-door-fact.ts";

const MESSAGE =
  "the duplicate-action-door family's plane derivation went blind: either the `SECTION_IDS` vocabulary or the " +
  "co-located rail-section definitions resolved to nothing, which regroups every door under its feature " +
  "directory instead of its plane. Both derivations are name-keyed, so a rename is the way this happens.";

const FIX =
  "Re-point the name-keyed derivation the message names (SECTION_IDS_HOME or SECTION_FILE_RE in " +
  "tooling/src/verify/lib/action-door-fact.ts) at its moved home. There is no waiver and no grant: a tripwire " +
  "that can be licensed away reports a plane census nobody measured.";

export const gate = defineGate({
  id: "duplicate-action-doors-health",
  family: "action-doors",
  authority: "hard",
  severity: "error",
  population: { in: ["@client"], under: ["packages/client/src/features/**", "packages/client/src/state/**"] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [actionDoorFact],
  resources: [],
  message: MESSAGE,
  create: (ctx) => ({
    evaluate: () => {
      const census = ctx.fact(actionDoorFact);
      // A health consumer receipts a CONSTANT 1 to attest that it consumed the ready fact — never the census
      // it is judging, because a zero census is exactly the condition this policy exists to accuse and a
      // receipt of it would refuse the run before the accusation could be made.
      ctx.receipt({ kind: "population", source: "duplicate-action-doors-health", members: 1, unresolved: 0 });
      const anchor = subjectAnchor(new Set(ctx.files.map((file) => ctx.relativePath(file))), [SECTION_IDS_HOME]);
      if (census.vocabulary.members.size === 0) {
        ctx.report.file(anchor(SECTION_IDS_HOME), { line: 1, column: 1, message: `${BLIND_VOCAB} (vocabulary home: ${SECTION_IDS_HOME})`, fix: FIX });
        return;
      }
      if (census.planes.size === 0) {
        ctx.report.file(anchor(SECTION_IDS_HOME), {
          line: 1,
          column: 1,
          message: `${BLIND_SECTIONS} (vocabulary resolved ${census.vocabulary.members.size} id(s) from ${census.vocabulary.sources.join("+")})`,
          fix: FIX,
        });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        [SECTION_IDS_HOME]: "export const OTHER = 1;\n",
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      expect: { count: 1, messageIncludes: "`SECTION_IDS` resolved to ZERO members" },
      why: "THE VOCABULARY ARM: the home loaded but names no `SECTION_IDS`, so the plane derivation came back empty — a rename must RED, never silently regroup every door under its feature dir. The fixture carries a real section definition AND a door so the arm cannot be satisfied by an empty project",
    },
    {
      mode: "source",
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/chats-panel.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      expect: { count: 1, messageIncludes: "zero rail-section definitions" },
      why: "THE SECTIONS ARM, and the ONLY way to reach it: a real definition carrying a real vocabulary id sits in a file whose NAME no longer matches `SECTION_FILE_RE` (`-panel.tsx`, not `-section.tsx`). The vocabulary is non-empty, so this is not the first arm — it is the half that reds when the co-location convention moves",
    },
  ],
  mustRefuse: [
    {
      mode: "source",
      files: {
        "packages/client/src/state/section-ids.ts": "declare function ids(): readonly string[];\nexport const SECTION_IDS = [...ids()] as const;\n",
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats" };\n',
      },
      expect: { messageIncludes: 'unsupported spread in "SECTION_IDS"' },
      why: "THE SUPPLY REFUSAL (law §6.3): a `SECTION_IDS` tuple built from a call the shared tuple reader cannot resolve makes the `action-door-census` fact FAIL at finish, and the dispatcher withholds this consumer before `evaluate` — the tripwires never run over a vocabulary they could not read. An EMPTY census is deliberately NOT a refusal here (the fact receipts the walk, not the doors, so the zero-definitions tripwire can fire as a finding). Successor to the frozen-replay arm retired at b1e5e3e30 (#2176); measured 2026-09-15 through the production runner.",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      why: "the healthy shape: a resolved vocabulary and a recognised definition — the tripwires are not a standing false positive on a working client",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/state/core-section-ids.ts": 'export const CORE_SECTION_IDS = ["chats"] as const;\n',
        [SECTION_IDS_HOME]: 'import { CORE_SECTION_IDS } from "./core-section-ids.ts";\nexport const SECTION_IDS = [...CORE_SECTION_IDS, "home"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      why: "THE #947 SHAPE STAYS GREEN: a vocabulary composed through a sanctioned spread of an imported sibling tuple resolves to both ids, so the tripwire does not fire on the composition it was built to see through — the row that reds if the spread source leaves the population",
    },
    {
      mode: "source",
      files: {
        [SECTION_IDS_HOME]: 'export const SECTION_IDS = ["chats"] as const;\n',
        "packages/client/src/features/chat/lib/chats-section.tsx": 'export const s = { id: "chats", rail: { label: "Chats" } };\n',
        "packages/client/src/features/chat/lib/memory-settings-section.tsx": 'export const m = { id: "chat-memory", anchor: "chat-behavior" };\n',
        "packages/client/src/features/chat/components/a.tsx": "export const A = () => trpc.chat.forkChat.mutationOptions();\n",
      },
      why: "a settings-section CONTRIBUTION sharing the filename shape mints no plane and must not be mistaken for one — but one real rail definition still resolves, so the sections arm stays quiet. Without this row the two arms could not be told apart on a tree that has both",
    },
  ],
});
