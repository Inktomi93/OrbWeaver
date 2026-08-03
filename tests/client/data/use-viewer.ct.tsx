// useViewer CT — the canonical "who am I" hook (data/use-viewer.ts) against the REAL three procedures it
// composes (`sessions.me` + `settings.getUserSettings` + `persona.list`), stubbed at the wire via routeTrpc
// (never a hand-mock — the options proxy is typed by AppRouter, so the stub only replaces the network).
// Two load-bearing properties: (1) the server identity flows through AND the current-persona pointer is
// resolved to a name + avatar from the cached `persona.list` (the whole reason the compose exists); (2) the
// EFFECTIVE-current resolution (owner ruling "never no persona when you have one") — a stale/unset pointer
// WITH personas present still resolves the fallback (default -> first owned), and `currentPersona` is null
// ONLY pre-first-run (the user owns zero personas).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { ViewerStory } from "./_ct-stories.tsx";

const IDENTITY = { userId: "user_viewer", handle: "nate", globalRole: "admin" };
const PERSONAS = [
  { id: "persona_1", name: "Ronan", avatarHash: "sha-ronan", starred: false },
  { id: "persona_2", name: "Mira", avatarHash: null, starred: true },
];

test("composes identity + resolves the current-persona pointer to a name + avatar", async ({ mount, page }) => {
  await routeTrpc(page, {
    "sessions.me": IDENTITY,
    "settings.getUserSettings": { config: { seeds: { currentPersonaId: "persona_1" } } },
    "persona.list": PERSONAS,
  });

  await mount(<ViewerStory />);

  await expect(page.getByTestId("viewer-handle")).toHaveText("nate");
  await expect(page.getByTestId("viewer-role")).toHaveText("admin");
  await expect(page.getByTestId("viewer-persona")).toHaveText("Ronan");
  await expect(page.getByTestId("viewer-persona-avatar")).toHaveText("sha-ronan");
});

test("a null pointer with personas present resolves the default fallback (never no persona)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "sessions.me": IDENTITY,
    "settings.getUserSettings": {
      config: { seeds: { currentPersonaId: null, defaultPersonaId: "persona_2" } },
    },
    "persona.list": PERSONAS,
  });

  await mount(<ViewerStory />);

  await expect(page.getByTestId("viewer-handle")).toHaveText("nate");
  await expect(page.getByTestId("viewer-persona")).toHaveText("Mira");
});

test("a null pointer with no default falls back to the first owned persona", async ({ mount, page }) => {
  await routeTrpc(page, {
    "sessions.me": IDENTITY,
    "settings.getUserSettings": { config: { seeds: { currentPersonaId: null } } },
    "persona.list": PERSONAS,
  });

  await mount(<ViewerStory />);

  await expect(page.getByTestId("viewer-persona")).toHaveText("Ronan");
});

test("a stale pointer (id absent from persona.list) resolves the fallback persona", async ({ mount, page }) => {
  await routeTrpc(page, {
    "sessions.me": IDENTITY,
    "settings.getUserSettings": { config: { seeds: { currentPersonaId: "persona_deleted" } } },
    "persona.list": PERSONAS,
  });

  await mount(<ViewerStory />);

  await expect(page.getByTestId("viewer-persona")).toHaveText("Ronan");
});

test("no persona (null) happens ONLY when the user owns zero personas", async ({ mount, page }) => {
  await routeTrpc(page, {
    "sessions.me": IDENTITY,
    "settings.getUserSettings": { config: { seeds: { currentPersonaId: null } } },
    "persona.list": [],
  });

  await mount(<ViewerStory />);

  await expect(page.getByTestId("viewer-handle")).toHaveText("nate");
  await expect(page.getByTestId("viewer-persona")).toHaveText("none");
});
