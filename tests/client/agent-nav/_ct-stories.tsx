// CT story module for `agent-nav/panel-request.ts` (Spine-Testing §7 — a CT mounts ONLY from a non-test
// module). It exists because the panel arm's REFUSAL is a DOM fact and the agent-nav unit suite has no DOM:
// `tests/client/agent-nav/index.test.ts` runs in the node "unit" project, which is why its own header says
// it proves routing and validation only. What it structurally cannot reach is the arm that reads the shell's
// published pane declaration (`data-panel-available`, #1122) and names it in the refusal (#1149).
//
// RAW `.shell-grid` / `.shell-panel` MARKUP, NOT A REAL SHELL — the same deliberate choice `tests/client/lib/
// _ct-stories.tsx`'s bridge story makes and states: the unit here is the bridge's READER, and a real shell
// would resolve its own panel mode and never leave the request un-landed. `app-shell.ct.tsx` is what pins
// that the real shell publishes the attribute at all; this pins what the bridge SAYS about it. The store
// actions the arm dispatches are the production ones, so the write really happens — nothing in this story
// reads the store back, which is exactly the "wrote it, nothing landed" state the refusal describes.

import { buildAgentNav } from "@orb/client/agent-nav";
import { useTRPC } from "@orb/client/data";
import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigGroupId, ConfigSectionContribution } from "@orb/client/state";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../support/browser/ct-data-providers.tsx";

/** The three declarations one `.shell-panel` can publish — the tri-state `panelAvailability` parses. */
const DECLARATIONS = ["declared", "unavailable", "unpublished"] as const;
type Declaration = (typeof DECLARATIONS)[number];

const AVAILABLE_ATTRIBUTE: Readonly<Record<Declaration, Record<string, string>>> = {
  declared: { "data-panel-available": "true" },
  unavailable: { "data-panel-available": "false" },
  // NOT `"absent"` spelled as a value — the arm under test distinguishes a MISSING attribute, so the
  // story must actually omit it. A `data-panel-available=""` would parse as `false` and prove nothing.
  unpublished: {},
};

/**
 * Drive the REAL `__orb.nav.panel("list", "docked")` against a shell that publishes each of the three
 * declarations in turn, and render the refusal verbatim.
 *
 * The panel is always rendered `collapsed`: every arm under test is a docked request that did NOT land,
 * which is the only state in which the refusal is written at all.
 */
function PanelRequestRefusalStory(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [declaration, setDeclaration] = useState<Declaration>("unavailable");
  const [reason, setReason] = useState("");
  return (
    <div>
      {/* THE SHELL MARKUP STANDS APART FROM THE CONTROLS. `.shell-grid` is a REAL production class with a
          real named-area grid (shell.css), and a stray button parked in it lays out to zero — every click
          in this story timed out on "element is not visible" before the split. The arm only asks whether a
          `.shell-grid` exists at all and then queries `.shell-panel` off `document`, so nesting buys
          nothing and costs the story its own controls. */}
      <div className="shell-grid">
        <aside className="shell-panel" data-panel-mode="collapsed" data-panel-side="list" {...AVAILABLE_ATTRIBUTE[declaration]} />
      </div>
      {DECLARATIONS.map((value) => (
        <button key={value} onClick={(): void => setDeclaration(value)} type="button">
          {`publish ${value}`}
        </button>
      ))}
      <button
        onClick={(): void => {
          setReason("");
          void buildAgentNav(trpc, queryClient)
            .panel("list", "docked")
            .then((result) => setReason(result.ok ? "ok" : result.reason));
        }}
        type="button"
      >
        dock the list panel
      </button>
      <output data-testid="panel-request-reason">{reason}</output>
    </div>
  );
}

/** The story wrapper — the providers `useTRPC`/`useQueryClient` need, nothing else. */
export function PanelRequestStory(): ReactElement {
  return (
    <CtDataProviders>
      <PanelRequestRefusalStory />
    </CtDataProviders>
  );
}

// ── #1638: openConfig()'s registry-backed validation, driven in a REAL browser ──────────────────────────
// The node unit suite (`agent-nav/index.test.ts`) proves the resolver's DISPATCH against a fake registry;
// this proves the SAME arm survives real module evaluation (createContributorRegistry, the real
// openConfigTo store action) in the browser tier, exactly the split `PanelRequestStory` above states for
// its own arm. A single fixture section — a sub with one leaf — is enough: the vocabulary itself is
// `resolve-config-target.test.ts`'s job.
const STORY_GROUP = "appearance" as ConfigGroupId;
const storySection: ConfigSectionContribution = {
  id: "story-sizing",
  anchor: STORY_GROUP,
  nav: { id: "sizing", label: "Sizing", settings: [{ id: "chat-width", label: "Chat width", teach: { none: "test fixture" } }] },
  body: () => null,
};

/** Fires `__orb.nav.openConfig("appearance", sub, setting)` against an INJECTED registry carrying exactly
 *  one real sub ("sizing") and one real leaf ("chat-width"), and renders the verdict. */
function ConfigTargetRefusalStory(): ReactElement {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [verdict, setVerdict] = useState("");
  const registry = createContributorRegistry<ConfigSectionContribution>("story-config-sections", [storySection]);
  const nav = buildAgentNav(trpc, queryClient, () => registry);
  const fire = (sub: string, setting?: string): void => {
    const result = nav.openConfig(STORY_GROUP, sub, setting);
    setVerdict(result.ok ? "ok" : result.reason);
  };
  return (
    <div>
      <button onClick={(): void => fire("sizing", "chat-width")} type="button">
        open the real leaf
      </button>
      <button onClick={(): void => fire("bogus-sub")} type="button">
        open an unknown sub
      </button>
      <button onClick={(): void => fire("sizing", "bogus-setting")} type="button">
        open an unknown setting
      </button>
      <output data-testid="config-target-verdict">{verdict}</output>
    </div>
  );
}

export function ConfigTargetStory(): ReactElement {
  return (
    <CtDataProviders>
      <ConfigTargetRefusalStory />
    </CtDataProviders>
  );
}
