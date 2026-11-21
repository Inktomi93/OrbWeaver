// A zip the profile door refuses cannot be imported, so its preflight says why in plain words and offers only a way to pick another
// file: no Import, no retry of the same bytes, no raw server sentence, and no toast or alert beside it. Each refusal reason has its case.
// The door answers from a real server where the file's own bytes provoke the reason; a reason that needs a hostile archive the browser
// cannot build is scripted at the route with the wire shape the door answers in, and tests/server/domain/import/persistence/import-profile-zip.int.test.ts
// proves the server gives that reason.
// @subject packages/client/src/features/workloads/hooks/use-library-import.ts

import { gzipSync } from "node:zlib";
import { RETRY_NAME } from "@orb/client/lib";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import type { ProfileZipRefusal } from "@orb/contracts/import";
import { profileZipRefusalSchema } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeAuthConfig, routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, servePhysicalPeer } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { zipSync } from "fflate";
import {
  IMPORT_PICK_ANOTHER_NAME,
  IMPORT_ZIP_REFUSAL,
  importFilePreflightTitle,
  importFileRefusedTitle,
} from "#client/features/workloads/lib/import-library-names.ts";
import { IMPORT_CONFIRM_NAMES } from "#client/features/workloads/lib/portability-model.ts";
import type { ImportPreviewStory } from "./_import-preview-stories.tsx";

const STORY = "tests/client/features/workloads/components/_import-preview-stories/ImportPreviewStory";
const ROOT_OPTIONS = {
  env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
  physicalPeer: () => "127.0.0.1",
  startJobs: false,
} as const;
const ZIP_NAME = "refused.zip";
const ZIP_MIME = "application/zip";
const SCRIPTED_SERVER_SENTENCE = "scripted door sentence the reader must never see";
const REFUSED = 400;
const TOO_LARGE = 413;
const SERVER_FAILED = 500;

interface ZipCase {
  readonly bytes: Uint8Array | string;
  /** Set when the reason needs an archive a browser spec cannot build: the route answers with this status and the reason's wire shape. */
  readonly scriptedStatus?: number;
}

// A total `Record` over the wire's reason tuple, so a new reason fails `tsc` until it has a case here.
const ZIP_CASES: Record<ProfileZipRefusal, ZipCase> = {
  empty: { bytes: "" },
  truncated: { bytes: "PK\x03\x04 cut short before its central directory" },
  "other-archive": { bytes: gzipSync("a gzip stream under a zip name") },
  json: { bytes: '{"not":"a zip"}' },
  html: { bytes: "<!doctype html><title>Sign in</title>" },
  "not-zip": { bytes: "plain words, no archive in them" },
  layout: { bytes: zipSync({ "readme.txt": new TextEncoder().encode("no profile in here") }) },
  damaged: { bytes: "bytes the scripted door calls damaged", scriptedStatus: REFUSED },
  unsupported: { bytes: "bytes the scripted door calls unsupported", scriptedStatus: REFUSED },
  unsafe: { bytes: "bytes the scripted door calls unsafe", scriptedStatus: REFUSED },
  "too-large": { bytes: "bytes the scripted door calls too large", scriptedStatus: TOO_LARGE },
  "case-twins": { bytes: "bytes the scripted door calls case twins", scriptedStatus: REFUSED },
};

interface DoorCounts {
  /** Uploads that reached the profile zip door. */
  zip: number;
  /** Uploads that reached the backup bundle door. */
  bundle: number;
  /** The sentence the door gave for each refusal, which the preflight must not repeat. */
  sentences: string[];
}

/** The profile zip door: the real server's answer, or a scripted one for a reason a browser cannot provoke. The upload reaches
 *  it through a loopback peer, because WebKit hands a route no body for a file upload. */
async function routeZipDoor({
  page,
  ownership,
  root,
  baseURL,
  scripted,
}: {
  readonly page: Page;
  readonly ownership: AsyncDisposableStack;
  readonly root: ServerTestHarness;
  readonly baseURL: string | undefined;
  readonly scripted: Response | null;
}): Promise<DoorCounts> {
  if (baseURL === undefined) {
    throw new Error("The zip door needs the configured gallery origin");
  }
  const counts: DoorCounts = { zip: 0, bundle: 0, sentences: [] };
  const cors = {
    "access-control-allow-origin": new URL(baseURL).origin,
    "access-control-allow-methods": "POST",
    "access-control-allow-headers": `${CSRF_HEADER}, content-type`,
  };
  const peer = ownership.use(
    await servePhysicalPeer(async (request) => {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }
      counts.zip += 1;
      const served = scripted?.clone() ?? (await root.http.request(request));
      const body = Buffer.from(await served.arrayBuffer());
      const refusal = profileZipRefusalSchema.safeParse(JSON.parse(body.toString("utf8") || "null"));
      if (refusal.success) {
        counts.sentences.push(refusal.data.error);
      }
      const headers = new Headers(served.headers);
      for (const [name, value] of Object.entries(cors)) {
        headers.set(name, value);
      }
      return new Response(body, { status: served.status, headers });
    }),
  ).origin;
  await page.route(`**${PORTABILITY_ROUTES.importBundle}`, async (route) => {
    counts.bundle += 1;
    await route.fulfill({ status: SERVER_FAILED, json: { error: "the bundle door is never reached from a refused zip" } });
  });
  await page.route(`**${PORTABILITY_ROUTES.importTreeZip}**`, async (route) => {
    const url = new URL(route.request().url());
    await route.continue({ url: `${peer}${url.pathname}${url.search}` });
  });
  return counts;
}

async function openImportPane(page: Page, root: ServerTestHarness, signedInConfig: Parameters<typeof routeAuthConfig>[1]): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeAuthConfig(page, signedInConfig);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "workloads.list"]),
    "stream.attach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" || ref.channel === "workloads" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await routeOrbSocket(page);
}

function scriptedRefusal(reason: ProfileZipRefusal, status: number): Response {
  return Response.json(profileZipRefusalSchema.parse({ error: SCRIPTED_SERVER_SENTENCE, reason }), { status });
}

function zipFile(bytes: Uint8Array | string): { readonly name: string; readonly mimeType: string; readonly buffer: Buffer } {
  return { name: ZIP_NAME, mimeType: ZIP_MIME, buffer: Buffer.from(bytes) };
}

for (const reason of profileZipRefusalSchema.shape.reason.options) {
  const { bytes, scriptedStatus } = ZIP_CASES[reason];
  test(`a zip the door refuses as ${reason} says why and offers only another pick`, async ({ corpus, mount, page, baseURL }) => {
    await using root = await createServerHarness(ROOT_OPTIONS);
    await using ownership = new AsyncDisposableStack();
    await openImportPane(page, root, corpus.auth.signedInConfig);
    const counts = await routeZipDoor({
      page,
      ownership,
      root,
      baseURL,
      scripted: scriptedStatus === undefined ? null : scriptedRefusal(reason, scriptedStatus),
    });
    await mount<typeof ImportPreviewStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

    await page.locator('input[type="file"]').first().setInputFiles(zipFile(bytes));

    const preflight = page.getByRole("group", { name: importFileRefusedTitle(ZIP_NAME), exact: true });
    await expect(preflight.getByText(IMPORT_ZIP_REFUSAL[reason], { exact: true })).toBeVisible();
    await expect(preflight.getByRole("button", { name: IMPORT_PICK_ANOTHER_NAME, exact: true })).toBeVisible();
    await expect(preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.file, exact: true })).toHaveCount(0);
    await expect(preflight.getByRole("button", { name: RETRY_NAME, exact: true })).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    // The positive control: the door did refuse the zip, in its own sentence, which the reader never sees.
    expect(counts).toMatchObject({ zip: 1, bundle: 0 });
    expect(counts.sentences).toHaveLength(1);
    for (const sentence of counts.sentences) {
      await expect(page.locator("body")).not.toContainText(sentence);
    }

    // By key: WebKit's iPhone profile reports a commit-row button as never stable, so a click times out; the key reaches the same handler.
    await preflight.getByRole("button", { name: IMPORT_PICK_ANOTHER_NAME, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(preflight).toHaveCount(0);
    expect(counts).toMatchObject({ zip: 1, bundle: 0 });
  });
}

test("a zip whose preview fails for a reason other than a refusal still offers Import and a retry", async ({ corpus, mount, page, baseURL }) => {
  await using root = await createServerHarness(ROOT_OPTIONS);
  await using ownership = new AsyncDisposableStack();
  await openImportPane(page, root, corpus.auth.signedInConfig);
  const counts = await routeZipDoor({
    page,
    ownership,
    root,
    baseURL,
    scripted: Response.json({ error: SCRIPTED_SERVER_SENTENCE }, { status: SERVER_FAILED }),
  });
  await mount<typeof ImportPreviewStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

  await page.locator('input[type="file"]').first().setInputFiles(zipFile(ZIP_CASES["not-zip"].bytes));

  // This is the control for the absences above: the same buttons are on screen here, so a refusal case that finds none is not a mis-named locator.
  const preflight = page.getByRole("group", { name: importFilePreflightTitle(ZIP_NAME), exact: true });
  await expect(preflight.getByRole("button", { name: RETRY_NAME, exact: true })).toBeVisible();
  await expect(preflight.getByRole("button", { name: IMPORT_CONFIRM_NAMES.file, exact: true })).toBeEnabled();
  expect(counts.zip).toBe(1);
});
