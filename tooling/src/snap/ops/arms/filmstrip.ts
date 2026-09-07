// Bounded exact-page transition contact sheet over the existing Playwright page and argv action tape.
import { relative } from "node:path";
import type { Page } from "@playwright/test";
import { activeRunSlot, artifactFile } from "../../../_shared/artifact-out.ts";
import { artifactRef } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { artifactKey, print, routeSlug } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { EXIT } from "../../../_shared/exit-contract.ts";
import { processEnvValue } from "../../../_shared/process-env.ts";
import type { ArmArgs, ArmDef, ArmFailureCounts, ArmNeeds, ArmRunInstance } from "../../contract/arms.ts";
import type { FilmstripCaptureReceipt, FilmstripLimits } from "../../contract/filmstrip.ts";
import { FILMSTRIP_LIMITS } from "../../contract/filmstrip.ts";
import type { ArmFactDataByArm } from "../../contract/run-facts.ts";
import type { Args } from "../../contract/types.ts";
import { captureScope } from "../../lib/capture-scope.ts";
import { writeFilmstripContactSheet } from "../../lib/filmstrip-sheet.ts";
import type { FilmstripCaptureController } from "../filmstrip-capture.ts";
import { startFilmstripCapture } from "../filmstrip-capture.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --filmstrip");

interface FilmstripAttempt {
  readonly scope: ReturnType<typeof captureScope>;
  receipt: FilmstripCaptureReceipt | null;
  artifact: string | null;
  error: string | null;
}

type FilmstripStartOutcome =
  | { readonly status: "started"; readonly controller: FilmstripCaptureController }
  | { readonly status: "failed"; readonly error: string };

type FilmstripFinishOutcome =
  | { readonly status: "finished"; readonly receipt: FilmstripCaptureReceipt; readonly artifact: string }
  | { readonly status: "failed"; readonly receipt: FilmstripCaptureReceipt | null; readonly error: string };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const TEST_FRAME_LIMIT_ENV = "ORB_SNAP_TEST_FILMSTRIP_FRAME_LIMIT";

function captureLimits(): FilmstripLimits {
  const value = processEnvValue(TEST_FRAME_LIMIT_ENV);
  if (value === undefined) {
    return FILMSTRIP_LIMITS;
  }
  if (processEnvValue("VITEST") !== "true") {
    throw new Error(`FILMSTRIP REFUSED: ${TEST_FRAME_LIMIT_ENV} is a test-only seam`);
  }
  const frames = Number(value);
  if (!Number.isInteger(frames) || frames < 1 || frames > FILMSTRIP_LIMITS.frames) {
    throw new Error(`FILMSTRIP REFUSED: ${TEST_FRAME_LIMIT_ENV} must be an integer from 1 through ${String(FILMSTRIP_LIMITS.frames)}`);
  }
  return { ...FILMSTRIP_LIMITS, frames };
}

async function startCapture(page: Page): Promise<FilmstripStartOutcome> {
  try {
    return { status: "started", controller: await startFilmstripCapture(page, captureLimits()) };
  } catch (error) {
    return { status: "failed", error: errorText(error) };
  }
}

function suffix(opts: Args, pageIndex: number): string {
  if (opts.contexts > 1) {
    return `-u${String(pageIndex)}`;
  }
  return opts.pages > 1 ? `-p${String(pageIndex)}` : "";
}

function artifactReference(path: string): ReturnType<typeof artifactRef> {
  const slot = activeRunSlot();
  if (slot === null) {
    throw new Error("INSTRUMENT ERROR: filmstrip artifact has no active run slot");
  }
  return artifactRef(relative(slot.dir, path).replaceAll("\\", "/"));
}

async function finishCapture(
  controller: FilmstripCaptureController,
  opts: Args,
  pageIndex: number,
  attempt: FilmstripAttempt,
): Promise<FilmstripFinishOutcome> {
  let receipt: FilmstripCaptureReceipt | null = null;
  try {
    receipt = await controller.stop();
    if (receipt.frames.length === 0) {
      throw new Error("FILMSTRIP REFUSED: Page.startScreencast produced no frames");
    }
    const missingActionFrame = receipt.limits.flatMap((limit) => limit.events).find((event) => event.kind === "action-frame-missing");
    if (missingActionFrame !== undefined) {
      throw new Error(`FILMSTRIP REFUSED: action-relative frame was not retained (${missingActionFrame.path})`);
    }
    const base = artifactKey(opts.out ?? routeSlug(opts.route));
    const path = await artifactFile("filmstrip", `${base}${suffix(opts, pageIndex)}-filmstrip`, ".png", {
      producer: "filmstrip",
      producerArm: "filmstrip",
      channel: "filmstrip",
      mediaType: "image/png",
      schema: "snap-filmstrip-contact-sheet-v1",
      role: "primary",
      completeness: receipt.limits.every((limit) => limit.complete) ? "complete" : "bounded",
      completenessDetail: `ordered labelled contact sheet; source JPEG max ${String(FILMSTRIP_LIMITS.maxWidth)}x${String(FILMSTRIP_LIMITS.maxHeight)} quality ${String(FILMSTRIP_LIMITS.quality)}`,
      scope: attempt.scope,
      records: receipt.frames.length,
      limits: receipt.limits,
    });
    await writeFilmstripContactSheet(receipt.frames, path);
    return { status: "finished", receipt, artifact: path };
  } catch (error) {
    return { status: "failed", receipt, error: errorText(error) };
  }
}

const SESSION_CLEANUP_HEADROOM_MS = 10_000;

function factData(attempt: FilmstripAttempt): ArmFactDataByArm["filmstrip"] {
  const receipt = attempt.receipt;
  const omittedFrames = receipt === null ? 0 : receipt.observedFrames - receipt.frames.length;
  const omittedBytes = receipt === null ? 0 : receipt.observedBytes - receipt.retainedBytes;
  return {
    state: attempt.error === null && receipt !== null ? "passed" : "refused",
    detail: attempt.error,
    observedFrames: receipt?.observedFrames ?? 0,
    retainedFrames: receipt?.frames.length ?? 0,
    omittedFrames,
    observedBytes: receipt?.observedBytes ?? 0,
    retainedBytes: receipt?.retainedBytes ?? 0,
    omittedBytes,
    durationMs: Math.round(receipt?.durationMs ?? 0),
    actions: receipt?.actions.length ?? 0,
    limitEvents: receipt?.limits.reduce((sum, limit) => sum + limit.events.length, 0) ?? 0,
    artifact: attempt.artifact === null ? null : artifactReference(attempt.artifact),
  } as const;
}

export const FILMSTRIP_ARM = {
  flags: [
    {
      flag: "--filmstrip",
      kind: "boolean",
      pageTargetable: false,
      group: "Measure",
      summary: "labelled PNG contact sheet from before the tape through settle, one per page/context",
      handler: (args): void => {
        args.filmstrip = true;
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (opts): number | null => (opts.filmstrip ? FILMSTRIP_LIMITS.durationMs + SESSION_CLEANUP_HEADROOM_MS : null),
  defaults: (): Pick<ArmArgs, "filmstrip"> => ({ filmstrip: false }),
  help: `  --filmstrip             exact-page transition contact sheet over the existing argv action tape.
                          Starts before actions, stops after settle, embeds frame time/action labels,
                          and writes one bounded PNG per page/context. Refuses performance/profiling arms.`,
  result: {
    schema: "snap-arm-filmstrip-v1",
    source: "CDP Page.startScreencast + Sharp contact sheet",
    lifetime: "post-navigation argv action tape through bounded settle",
    enabled: (opts): boolean => opts.filmstrip,
  },
  lifecycle: {
    at: "run",
    begin: (_session, opts): ArmRunInstance<"filmstrip"> => {
      const controllers = new Map<Page, FilmstripCaptureController>();
      const attempts = new Map<Page, FilmstripAttempt>();
      return {
        prepare: (): Promise<void> => Promise.resolve(),
        afterNavigation: async (ctx): Promise<void> => {
          if (!opts.filmstrip) {
            return;
          }
          const attempt: FilmstripAttempt = {
            scope: captureScope(opts, ctx.pageIndex, ctx.evidenceWindow),
            receipt: null,
            artifact: null,
            error: null,
          };
          attempts.set(ctx.page, attempt);
          if (ctx.navError !== null) {
            attempt.error = `FILMSTRIP REFUSED: navigation failed before the action tape (${ctx.navError})`;
            return;
          }
          const started = await startCapture(ctx.page);
          if (started.status === "failed") {
            attempt.error = started.error;
            print(started.error);
          } else {
            controllers.set(ctx.page, started.controller);
          }
        },
        beforeAction: (ctx): Promise<null> => {
          controllers.get(ctx.page)?.mark(ctx.actionIndex, ctx.action);
          return Promise.resolve(null);
        },
        afterAction: (): Promise<void> => Promise.resolve(),
        afterActions: (): Promise<void> => Promise.resolve(),
        afterSettle: async (ctx): Promise<void> => {
          const controller = controllers.get(ctx.page);
          const attempt = attempts.get(ctx.page);
          if (controller === undefined || attempt === undefined) {
            return;
          }
          const finished = await finishCapture(controller, opts, ctx.pageIndex, attempt);
          controllers.delete(ctx.page);
          attempt.receipt = finished.receipt;
          if (finished.status === "failed") {
            attempt.error = finished.error;
            print(finished.error);
          } else {
            attempt.artifact = finished.artifact;
          }
        },
        measure: (): Promise<void> => Promise.resolve(),
        report: (): Promise<void> => {
          for (const attempt of attempts.values()) {
            if (attempt.error === null && attempt.receipt !== null && attempt.artifact !== null) {
              print(
                `FILMSTRIP   frames=${String(attempt.receipt.frames.length)}/${String(attempt.receipt.observedFrames)} actions=${String(attempt.receipt.actions.length)} duration=${String(Math.round(attempt.receipt.durationMs))}ms → ${attempt.artifact}`,
              );
            }
          }
          return Promise.resolve();
        },
        failures: (): ArmFailureCounts => ({}),
        denominators: () =>
          opts.filmstrip
            ? {
                "filmstrip-frames": {
                  value: [...attempts.values()].reduce((sum, attempt) => sum + (attempt.receipt?.frames.length ?? 0), 0),
                  refuseWhen: "zero" as const,
                },
              }
            : {},
        pairs: (): readonly ResultPair[] => {
          if (!opts.filmstrip) {
            return [["filmstrip", "off"]];
          }
          const rows = [...attempts.values()];
          const artifacts = rows
            .map((attempt) => attempt.artifact)
            .filter((path): path is string => path !== null)
            .join(",");
          return [
            ["filmstrip", rows.some((attempt) => attempt.error !== null) ? "REFUSED" : artifacts || "REFUSED"],
            ["filmstrip-frames", rows.reduce((sum, attempt) => sum + (attempt.receipt?.frames.length ?? 0), 0)],
            ["filmstrip-omitted", rows.reduce((sum, attempt) => sum + ((attempt.receipt?.observedFrames ?? 0) - (attempt.receipt?.frames.length ?? 0)), 0)],
            ["filmstrip-actions", rows.reduce((sum, attempt) => sum + (attempt.receipt?.actions.length ?? 0), 0)],
          ];
        },
        facts: () => [...attempts.values()].map((attempt) => ({ scope: attempt.scope, data: factData(attempt) })),
        exit: (code): number =>
          !opts.filmstrip || [...attempts.values()].every((attempt) => attempt.error === null && attempt.receipt !== null) ? code : EXIT.toolError,
      };
    },
  },
} satisfies ArmDef<"filmstrip">;
