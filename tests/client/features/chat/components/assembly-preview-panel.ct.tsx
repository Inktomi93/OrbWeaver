// CT: the Preview tab body (assembly-preview-panel.tsx, task #28) — a QueryBoundary suspending on the
// host-only `chat.previewAssembly` + `chat.getShapeTrace` reads in PARALLEL (useSuspenseQueries). Proves:
// loading fallback → success render (provenance rows from the routed fixture data: token estimate,
// override sources, the two prompt halves, the trace flags, the shape-trace summary), the error surface,
// and the retry path (QueryBoundary's reset handshake — refetch, not just a re-render).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { AssemblyPreviewPanelStory } from "../_ct-stories";

// `AssembleTrace` is carried BOTH at `AssembledPrompt.trace` (the required field on the prompt shape) AND
// at the top-level `AssemblyPreview.trace` that `PreviewBody` destructures — same value, two homes on the
// real wire shape (contracts/chat/index.ts AssembledPrompt + AssemblyPreview).
const PREVIEW_TRACE = {
  staticSections: ["persona", "scenario"],
  dynamicSections: ["authorsNote"],
  worldInfoIncluded: 2,
  worldInfoDropped: [{ id: "wi_1", reason: "budget" as const }],
  worldInfoActivated: [
    { id: "we_dragon", keys: ["dragon", "wyrm"] },
    { id: "we_intro", keys: [] },
  ],
  matchedKeys: [{ key: "cake", matchedLatestUserMessage: true }],
  compactSummaryIncluded: true,
  memoryIncluded: false,
  guidedInstructionIncluded: true,
  staticCacheBusters: [],
  chatInjectionsIncluded: 1,
  afterHistorySections: [],
  overrideSources: { mainPrompt: "room override", scenario: "from Aria" },
};

const PREVIEW_ASSEMBLY_DATA = {
  prompt: {
    static: "You are Aria, a helpful assistant.",
    dynamic: "Stay concise.",
    afterHistory: [{ position: "in_chat" as const, depth: 0, role: "system" as const, content: "Remember the cake is a lie." }],
    sendHistory: true,
    trace: PREVIEW_TRACE,
  },
  trace: PREVIEW_TRACE,
};

const SHAPE_TRACE_DATA = {
  multiCharacter: false,
  stageCounts: { withTail: 10, injected: 11, squashed: 9, named: 9 },
  squashMerges: 2,
  cacheBreakpointFromEnd: 3,
  breakpointDecision: "placed" as const,
};

test("loading fallback renders, then the provenance rows render from the routed fixture data", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  // Token estimate — the three rows + a non-zero total (advisory local estimate).
  await expect(component.getByText("System — static")).toBeVisible();
  await expect(component.getByText("In-history injections", { exact: true })).toBeVisible();

  // Override-sources provenance ("where each field's value came from").
  await expect(component.getByText("Main prompt")).toBeVisible();
  await expect(component.getByText("room override")).toBeVisible();
  await expect(component.getByText("Scenario", { exact: true })).toBeVisible();
  await expect(component.getByText("from Aria")).toBeVisible();

  // Prompt halves, verbatim.
  await expect(component.getByText("You are Aria, a helpful assistant.")).toBeVisible();
  await expect(component.getByText("Stay concise.")).toBeVisible();

  // In-history injection row (role + depth + content — the row is one contiguous text node).
  await expect(component.getByText("Remember the cake is a lie.", { exact: false })).toBeVisible();

  // BUILD-phase trace: sections, world info, injections count, matched keys, the boolean-flag badges.
  await expect(component.getByText("persona, scenario")).toBeVisible();
  await expect(component.getByText("2 included, 1 dropped")).toBeVisible();
  await expect(component.getByText("cake", { exact: true })).toBeVisible();
  await expect(component.getByText("Compact summary")).toBeVisible();
  await expect(component.getByText("Guided instruction")).toBeVisible();
  await expect(component.getByText("Memory")).toHaveCount(0); // memoryIncluded:false → not an active flag badge.

  // SHAPE-phase content-free trace.
  await expect(component.getByText("10 → 11 → 9 → 9")).toBeVisible();
  await expect(component.getByText("Placed (offset 3 from end)")).toBeVisible();

  // World-info activation: the fired entries by identity — count heading, id + its keys, and the "always"
  // label for a key-less (always-scope) entry.
  await expect(component.getByText("World info — 2 activated")).toBeVisible();
  await expect(component.getByText("we_dragon")).toBeVisible();
  await expect(component.getByText("dragon, wyrm")).toBeVisible();
  await expect(component.getByText("we_intro")).toBeVisible();
  await expect(component.getByText("always")).toBeVisible();
});

test("world-info activation shows the empty-state explanation when nothing fired", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => ({
      ...PREVIEW_ASSEMBLY_DATA,
      prompt: { ...PREVIEW_ASSEMBLY_DATA.prompt, trace: { ...PREVIEW_TRACE, worldInfoActivated: [] } },
      trace: { ...PREVIEW_TRACE, worldInfoActivated: [] },
    }),
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  await expect(component.getByText("World info — 0 activated")).toBeVisible();
  await expect(component.getByText("No world-info entries activated.")).toBeVisible();
});

test("error surface renders when either read fails", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => trpcError({ message: "assembly blew up" }),
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  await expect(component.getByText("Couldn't load the preview.")).toBeVisible();
});

test("retry refetches both reads (the reset handshake) and renders on recovery", async ({ mount, page }) => {
  let previewCalls = 0;
  const trpc = await routeTrpc(page, {
    "chat.previewAssembly": (): unknown => (previewCalls++ === 0 ? trpcError({ message: "boom" }) : PREVIEW_ASSEMBLY_DATA),
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  await expect(component.getByText("Couldn't load the preview.")).toBeVisible();

  await component.getByRole("button", { name: "Retry" }).click();

  await expect(component.getByText("You are Aria, a helpful assistant.")).toBeVisible();
  await expect.poll(() => trpc.count("chat.previewAssembly")).toBe(2);
});
