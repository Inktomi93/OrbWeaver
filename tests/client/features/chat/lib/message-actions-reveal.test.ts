// Unit: the ONE messageActions reveal-class resolver (features/chat/lib/message-actions-reveal) — the
// single home MessageActionsRow + GreetingActionsRow share (D66 A3). Pins both pref modes so the
// hidden-at-rest posture and the always-visible `expanded` posture can't silently drift apart.

import { messageActionsRevealClass } from "../../../../../packages/client/src/features/chat/lib/message-actions-reveal";
import { expect, test } from "../../../../support/fixtures";

test("hover (default): hidden + inert at rest, revealed on hover / focus-within / coarse pointer (A3)", () => {
  const cls = messageActionsRevealClass("hover");
  // Rest is HIDDEN and non-interactive (A3 amends the old opacity-40 dim-at-rest).
  expect(cls).toContain("opacity-0");
  expect(cls).toContain("pointer-events-none");
  // Revealed AND re-enabled by hover, keyboard focus-within, and a coarse pointer (always-on).
  expect(cls).toContain("group-hover:opacity-100");
  expect(cls).toContain("group-hover:pointer-events-auto");
  expect(cls).toContain("group-focus-within:opacity-100");
  expect(cls).toContain("group-focus-within:pointer-events-auto");
  expect(cls).toContain("pointer-coarse:opacity-100");
  expect(cls).toContain("pointer-coarse:pointer-events-auto");
});

test("the default arg is hover", () => {
  expect(messageActionsRevealClass()).toBe(messageActionsRevealClass("hover"));
});

test("expanded: the cluster is always visible — never hidden, never inert", () => {
  const cls = messageActionsRevealClass("expanded");
  expect(cls).toContain("opacity-100");
  // No hide/inert posture and no hover gating — the 3-item cluster shows at rest.
  expect(cls).not.toContain("opacity-0");
  expect(cls).not.toContain("pointer-events-none");
  expect(cls).not.toContain("group-hover:");
});
