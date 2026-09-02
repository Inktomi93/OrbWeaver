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
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../support/ct/ct-data-providers.tsx";

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
