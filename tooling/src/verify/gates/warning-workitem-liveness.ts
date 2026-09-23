// Gate: warning-workitem-liveness — a warning policy's `workItem` must name a live `docs/work` item, because
// the item is the only thing that says who owns the parked debt and when it ends. A warning whose owner is
// done or absent is permanent debt that reads as tracked debt.
// ARMS: the id names no item under `docs/work/` (never filed, filed by mistake, or archived with a finished
// plan) · the item it names is `done` · the value is not a numeric literal this reader can resolve.
// LIVE MEANS NOT DONE: `open`, `doing` and `blocked` all still own the debt (a blocked item still waits for
// its owner); only `done` has let go of it. The item's state is read through the doc tool's own item reader
// (`parseItem` from `#doc`), so this gate and `pnpm doc` cannot disagree about what a state is.
// DECLARED LIMITS: the value is read off the descriptor LITERAL; a `workItem` bound to a const is reported
// as unreadable rather than resolved, which is the loud direction. `lib/policy-validation.ts` already
// forbids `workItem` on an error policy, so the presence of the key is the warning population.
// WHY A GATE AND NOT A BARRIER VERB: the earlier home was an operator-run verb because the owner lived on the
// GitHub board and a policy may not do I/O (standardization §3). The ruling survives, its input changed: the
// owner is now a file under `docs/work/`, which the closed `ledger("work-items")` resource serves, so the
// check runs offline on every structure run instead of at a barrier someone has to remember.
// FAMILY: policy-soundness, tooling/src/verify/lib/policy-descriptor-read.ts#finalDescriptorOf — every member
// judges the final descriptors of the gate corpus through that reader.
// POPULATION: the top-level gate modules; `_proof/` holds shared fixture sources, not policies.
// RETIRED MARKERS: none (new policy).
import type { ObjectLiteralExpression } from "ts-morph";
import { Node } from "ts-morph";
import { parseItem } from "#doc";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { descriptorProperty, descriptorValue, finalDescriptorOf } from "../lib/policy-descriptor-read.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { familyFixture, finalProbeModule, HARD_TRUNK } from "./_proof/policy-soundness.ts";

const WORK_ITEM_KEY = "workItem";
const DONE_STATE = "done";
const WORK_TREE = "docs/work";

const MESSAGE =
  "a warning policy's workItem must name a docs/work item that is not done — the item owns the warning debt, and a done or missing item leaves the debt with no owner (docs/law/gate-runtime-standardization.md §5).";
const FIX =
  "file the owning item with `pnpm doc item` and put its id in workItem, or point workItem at the live item that now owns the debt; if the debt is paid, flip the policy to severity error and delete workItem.";

interface Citation {
  readonly anchor: Node;
  readonly id: number | undefined;
}

function citationOf(descriptor: ObjectLiteralExpression): Citation | undefined {
  const property = descriptorProperty(descriptor, WORK_ITEM_KEY);
  const value = descriptorValue(descriptor, WORK_ITEM_KEY);
  return property === undefined
    ? property
    : { anchor: property, id: value !== undefined && Node.isNumericLiteral(value) ? value.getLiteralValue() : undefined };
}

/** Item id to state, for every file the ledger served that the doc tool reads as an item. */
function itemStates(ctx: GatePolicyContext): ReadonlyMap<number, string> {
  const ledger = readyResourceValue(ctx.resources.ledger("work-items"));
  const states = new Map<number, string>();
  for (const document of ledger.documents) {
    const item = parseItem(document.path, document.text);
    if (item !== null) {
      states.set(item.id, item.state);
    }
  }
  ctx.receipt({ kind: "population", source: "work-items", members: states.size });
  return states;
}

function verdict(citation: Citation, states: ReadonlyMap<number, string>): string | undefined {
  if (citation.id === undefined) {
    return `${MESSAGE} This workItem is not a numeric literal, so its owner cannot be read.`;
  }
  const state = states.get(citation.id);
  if (state === undefined) {
    return `${MESSAGE} No item ${String(citation.id)} exists under ${WORK_TREE}/.`;
  }
  return state === DONE_STATE ? `${MESSAGE} Item ${String(citation.id)} is done.` : undefined;
}

const ITEM = (state: string): string => `---\nkind: work\nstatus: ${state}\nupdated: 2026-09-23\n---\n\n# Owns the debt\n`;
const WARNING_PROBE = (workItem: string): string =>
  finalProbeModule(HARD_TRUNK.replace('severity: "error",', `severity: "warning",\n  workItem: ${workItem},`));
const OPEN_ITEM = { "docs/work/0007-owns-the-debt.md": ITEM("open") };

export const gate = defineGate({
  id: "warning-workitem-liveness",
  family: "policy-soundness",
  authority: "hard",
  severity: "error",
  population: {
    in: ["@tooling"],
    under: ["tooling/src/verify/gates/*.ts"],
    notNamed: ["*.d.ts", "__g_*", "__dc_*"],
  },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "ledger", id: "work-items" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const citations: Citation[] = [];
    return {
      visitFile: (sourceFile) => {
        const descriptor = finalDescriptorOf(sourceFile);
        const citation = descriptor === undefined ? undefined : citationOf(descriptor);
        if (citation !== undefined) {
          citations.push(citation);
        }
      },
      evaluate: () => {
        const states = itemStates(ctx);
        for (const citation of citations) {
          const message = verdict(citation, states);
          if (message !== undefined) {
            ctx.report.node(citation.anchor, { message });
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "resource",
      files: familyFixture(WARNING_PROBE("7"), { "docs/work/0007-owns-the-debt.md": ITEM("done") }),
      expect: { count: 1, messageIncludes: "Item 7 is done" },
      why: "the founding defect: the warning's owner closed while the debt stayed, so the warning reads as tracked forever",
    },
    {
      mode: "resource",
      files: familyFixture(WARNING_PROBE("1965"), OPEN_ITEM),
      expect: { count: 1, messageIncludes: "No item 1965 exists" },
      why: "a workItem naming no docs/work item, the shape every value had while it still held a GitHub issue number",
    },
    {
      mode: "resource",
      files: familyFixture(WARNING_PROBE("OWNER"), OPEN_ITEM),
      expect: { count: 1, messageIncludes: "not a numeric literal" },
      why: "the declared limit, reported loud: a workItem bound to a name is unreadable here, never assumed live",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: familyFixture(WARNING_PROBE("7"), OPEN_ITEM),
      why: "the live owner: an open item. Mark it done and mustFlag[0] is the red",
    },
    {
      mode: "resource",
      files: familyFixture(WARNING_PROBE("7"), { "docs/work/0007-owns-the-debt.md": ITEM("blocked") }),
      why: "a blocked item still owns its debt; only done lets go of it",
    },
    {
      mode: "resource",
      files: familyFixture(finalProbeModule(HARD_TRUNK), { "docs/work/0007-owns-the-debt.md": ITEM("done") }),
      why: "an error policy carries no workItem, so a done item beside it is no finding",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: familyFixture(WARNING_PROBE("7")),
      expect: { messageIncludes: "ledger:work-items is" },
      why: "the supply refusal: with no docs/work tree the owner refuses instead of calling every workItem missing, or worse, reporting zero over items it never read",
    },
  ],
});
