// useViewer CT — the canonical "who am I" hook (data/use-viewer.ts) against the REAL three procedures it
// composes (`sessions.me` + `settings.getUserSettings` + `persona.list`), stubbed at the wire via routeTrpc
// (never a hand-mock — the options proxy is typed by AppRouter, so the stub only replaces the network).
// Two load-bearing properties: (1) the server identity flows through AND the current-persona pointer is
// resolved to a name + avatar from the cached `persona.list` (the whole reason the compose exists); (2) a
// stale/unset pointer degrades `currentPersona` to null instead of a dangling render.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../support/ct/route-trpc";
import { ViewerStory } from "./_ct-stories";

const IDENTITY = { userId: "user_viewer", handle: "alex", globalRole: "admin" };
const PERSONAS = [
  { id: "persona_1", name: "Ronan", avatarHash: "sha-ronan", starred: false },
  { id: "persona_2", name: "Mira", avatarHash: null, starred: true },
];

test("composes identity + resolves the current-persona pointer to a name + avatar", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "sessions.me": IDENTITY,
    "settings.getUserSettings": { config: { seeds: { currentPersonaId: "persona_1" } } },
    "persona.list": PERSONAS,
  });

  await mount(<ViewerStory />);

  await expect(page.getByTestId("viewer-handle")).toHaveText("alex");
  await expect(page.getByTestId("viewer-role")).toHaveText("admin");
  await expect(page.getByTestId("viewer-persona")).toHaveText("Ronan");
  await expect(page.getByTestId("viewer-persona-avatar")).toHaveText("sha-ronan");
});

test("a null current-persona pointer degrades to no persona (never a dangling render)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "sessions.me": IDENTITY,
    "settings.getUserSettings": { config: { seeds: { currentPersonaId: null } } },
    "persona.list": PERSONAS,
  });

  await mount(<ViewerStory />);

  await expect(page.getByTestId("viewer-handle")).toHaveText("alex");
  await expect(page.getByTestId("viewer-persona")).toHaveText("none");
});

test("a stale pointer (id absent from persona.list) degrades to no persona", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "sessions.me": IDENTITY,
    "settings.getUserSettings": { config: { seeds: { currentPersonaId: "persona_deleted" } } },
    "persona.list": PERSONAS,
  });

  await mount(<ViewerStory />);

  await expect(page.getByTestId("viewer-persona")).toHaveText("none");
});
