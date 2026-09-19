// THE DENSITY PREVIEW'S PERSISTENCE GUARD — the half of the appearance matrix that answers "did the
// preview WRITE THROUGH?", split out of `appearance-invariant-runtime.ts` at the tooling 450-line cap.
// The runtime op owns reaching a surface and taking its DOM/pixel/cascade evidence; this module owns one
// question with its own vocabulary: intercept the settings mutation, read the tRPC body the client
// actually posted, and report what was attempted, what matched exactly, and what shape the body had —
// while never letting the rated audit rewrite even the isolated stage database.
//
// IT IS THE FILE WHOSE READER LIED (#2448), which is why its body reader is EXPORTED and pinned rather
// than buried in the route handler: the old `Array.isArray(body)` premise published a pair of nulls that
// read exactly like "the client posted no section", and a false accusation from the instrument is the
// failure this seam exists to make impossible.

import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { instrumentRefusal } from "@orb/tooling/_shared/page-validate";
import type { Page, Route } from "@playwright/test";
import { settle } from "../../_shared/browser.ts";
import { MOUNT_SETTLE_MS, STEP_TIMEOUT_MS } from "../lib/budgets.ts";
import type { AppearanceMutationIsolationEvidence } from "./appearance-invariant-check-context.ts";
import type { AppearanceDomSnapshot } from "./appearance-invariant-dom.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix");

const SETTINGS_SECTION_MUTATION = "**/api/trpc/settings.updateUserSettingsSection*";

interface DensityPersistenceGuard {
  readonly evidence: () => AppearanceMutationIsolationEvidence;
  readonly close: () => Promise<void>;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const SETTINGS_SECTION_PROCEDURE = "settings.updateUserSettingsSection";
/** How many of an unreadable body's own keys the shape word quotes — enough to recognise the envelope that
 *  arrived, short enough to stay one whitespace-free token on the check's `actual` line. */
const UNREADABLE_KEY_QUOTES = 4;

/** The two members `readMutationInput` reads off an intercepted request. Playwright's own `Request`
 *  satisfies it structurally, so the production call site passes one unchanged — and the pin supplies the
 *  pair directly instead of fabricating a vendor class it does not own (`no-test-fabrication`). */
export interface MutationRequestRead {
  readonly url: () => string;
  readonly postDataJSON: () => unknown;
}

export interface ReadMutationInput {
  readonly input: Readonly<Record<string, unknown>> | null;
  readonly shape: string;
}

/** THE tRPC POST BODY IS A DICT, NOT AN ARRAY (#2448, source-pinned). `httpBatchLink` builds its body with
 *  `arrayToDict` (the trpc client 11.18.0, dist/httpUtils-BNq9QC3d.mjs:24-38): `{"0": input, "1": input}`,
 *  keyed by the procedure's POSITION in the comma-joined path segment — and this stack runs no transformer
 *  (there is no `{json:…}` envelope to unwrap). The old reader asked `Array.isArray(body)`, which is false
 *  for every real request, so it published `section=null density=null` on a body that carried both, and the
 *  `persistence-isolation` check read that as "the client sent no section".
 *
 *  The index is RESOLVED, never assumed to be 0: a batch window can fold a second procedure into the same
 *  request, and the path then names both in order. A body the reader cannot shape returns its reason rather
 *  than nulls, so the failure names the reader instead of blaming the app. */
export function readMutationInput(request: MutationRequestRead): ReadMutationInput {
  const body: unknown = request.postDataJSON();
  if (Array.isArray(body)) {
    return { input: null, shape: "unreadable:array" };
  }
  if (!isRecord(body)) {
    return { input: null, shape: `unreadable:${typeof body}` };
  }
  const procedures = decodeURIComponent(new URL(request.url()).pathname.split("/api/trpc/")[1] ?? "").split(",");
  const index = procedures.indexOf(SETTINGS_SECTION_PROCEDURE);
  const batched = body[String(index)];
  if (index >= 0 && isRecord(batched)) {
    return { input: batched, shape: `batch[${String(index)}]` };
  }
  // The non-batched spelling (a bare `httpLink`, or a batch of one that some future link posts unwrapped):
  // the body IS the input, recognised by the field this procedure is defined by.
  if (typeof body["section"] === "string") {
    return { input: body, shape: "bare" };
  }
  return { input: null, shape: `unreadable:keys=${Object.keys(body).slice(0, UNREADABLE_KEY_QUOTES).join("|")}` };
}

async function installDensityPersistenceGuard(page: Page, expectedDensity: string): Promise<DensityPersistenceGuard> {
  let attempted = 0;
  let exact = 0;
  let fulfilled = 0;
  let continued = 0;
  let section: string | null = null;
  let density: string | null = null;
  let bodyShape: string | null = null;
  const handler = async (route: Route): Promise<void> => {
    const request = route.request();
    if (request.method() !== "POST") {
      continued += 1;
      await route.continue();
      return;
    }
    attempted += 1;
    const read = readMutationInput(request);
    const input = read.input;
    bodyShape = read.shape;
    const patch = input === null || !isRecord(input["patch"]) ? null : input["patch"];
    section = typeof input?.["section"] === "string" ? input["section"] : null;
    density = typeof patch?.["density"] === "string" ? patch["density"] : null;
    if (section === "appearance" && density === expectedDensity) {
      exact += 1;
    }
    // The R6 subject is a draft preview. Fulfil the real client mutation wire locally so the form's
    // lifecycle completes, but never let the rated audit rewrite even its isolated stage database.
    await route.fulfill({ status: 200, contentType: "application/json", body: '[{"result":{"data":{}}}]' });
    fulfilled += 1;
  };
  await page.route(SETTINGS_SECTION_MUTATION, handler);
  return {
    evidence: () => ({ attempted, exact, fulfilled, continued, section, density, bodyShape }),
    close: async () => await page.unroute(SETTINGS_SECTION_MUTATION, handler),
  };
}

export async function driveOppositeDensity(page: Page, before: AppearanceDomSnapshot): Promise<AppearanceMutationIsolationEvidence> {
  const outer = before.subjects.find((subject) => subject.id === "outer-scope")?.facts?.attributes["data-density"];
  if (outer !== "compact" && outer !== "comfortable") {
    instrumentRefusal(`density-preview outer carrier is ${String(outer)}`);
  }
  const label = outer === "compact" ? "Comfortable" : "Compact";
  const guard = await installDensityPersistenceGuard(page, label.toLowerCase());
  try {
    const mutation = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.url().includes("/api/trpc/settings.updateUserSettingsSection"),
      { timeout: STEP_TIMEOUT_MS },
    );
    // THE DENSITY OPTION IS A RADIO, NOT A BUTTON (#2437, measured 2026-09-19). The sizing surface renders
    // each choice as a Base UI `Radio.Root` wearing `PickerCell` through its `render` prop
    // (packages/ui/src/primitives/picker-cell/picker-cell.tsx states the contract), so the accessible role
    // is `radio` on a `<span>`. `getByRole("button")` matched NOTHING: the click sat in Playwright's
    // actionability wait while the 5s response wait below rejected — UNHANDLED, because nothing was
    // awaiting it yet — and killed the whole matrix at the density cell with a message about a response
    // timeout, which names neither the missing control nor the cell. Two matrix passes died there.
    //
    // OWNING THE WAIT IS THE OTHER HALF: if the click itself fails, the response promise must be defused or
    // it becomes that same unhandled rejection. The click's error is what propagates — it is the real one.
    try {
      await page.getByRole("radio", { name: label, exact: true }).click();
    } catch (error) {
      // @orb-waive caught-failure-ownership(mutation): the DEFUSED rejection is the response wait, whose failure is meaningless once the click that should have caused it failed — the click's error is re-thrown on the next line and owns the outcome. Ends if the wait stops being started before the click.
      void mutation.catch(() => undefined);
      throw error;
    }
    await mutation;
    await settle(page, MOUNT_SETTLE_MS);
    return guard.evidence();
  } finally {
    await guard.close();
  }
}
