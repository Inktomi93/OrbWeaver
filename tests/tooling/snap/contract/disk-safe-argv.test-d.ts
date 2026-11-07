// Raw arguments and raw page text cannot reach a writer: each names the branded projection. A private value is not a
// string, so it cannot leave for a label or a template either. Each `@ts-expect-error` is a plant that must not compile.
import { expectTypeOf } from "vitest";
import type { DiskSafeArgv, DiskSafeOp, DiskSafeText, PrivateText } from "../../../../tooling/src/snap/contract/disk-safe-argv.ts";
import type { SnapRunIndex } from "../../../../tooling/src/snap/contract/run-index.ts";
import type { SessionEvent, SessionRow } from "../../../../tooling/src/snap/contract/session.ts";
import type { Args, AssertionOutcome, CaptureOutcome, DriveFailure, EvalOutcome, Step } from "../../../../tooling/src/snap/contract/types.ts";
import type { sessionBusyRefusal } from "../../../../tooling/src/snap/lib/session-refusals.ts";
import type { navDriveFailure, stepDriveFailure, waitDriveFailure } from "../../../../tooling/src/snap/ops/drive-failure-naming.ts";
import type { completeSnapRun } from "../../../../tooling/src/snap/ops/run-bundle.ts";
import type { runSessionCallWithinBudget } from "../../../../tooling/src/snap/ops/session-call-watchdog.ts";
import type { SessionDaemonState } from "../../../../tooling/src/snap/ops/session-daemon-request.ts";
import type { markStageDead } from "../../../../tooling/src/snap/ops/stage-marker.ts";

expectTypeOf<SnapRunIndex["process"]["argv"]>().toEqualTypeOf<DiskSafeArgv>();
expectTypeOf<SessionRow["bootArgv"]>().toEqualTypeOf<DiskSafeArgv>();
expectTypeOf<SessionRow["lastOp"]>().toEqualTypeOf<DiskSafeOp | null>();
expectTypeOf<SessionRow["inflightOp"]>().toEqualTypeOf<DiskSafeOp | null>();
expectTypeOf<Parameters<typeof completeSnapRun>[2]>().toEqualTypeOf<DiskSafeArgv>();
expectTypeOf<readonly string[]>().not.toExtend<DiskSafeArgv>();
expectTypeOf<string>().not.toExtend<DiskSafeOp>();

type Inflight = NonNullable<SessionDaemonState["inflight"]>;
type FillStep = Extract<Step, { readonly kind: "fill" }>;
declare const requestArgv: readonly string[];
declare const done: Inflight["done"];

expectTypeOf<Inflight["op"]>().toEqualTypeOf<DiskSafeOp>();
expectTypeOf<Extract<SessionEvent, { readonly kind: "status" }>["busy"]>().toEqualTypeOf<DiskSafeOp | null>();
expectTypeOf<Parameters<typeof sessionBusyRefusal>[1]>().toEqualTypeOf<DiskSafeOp>();
expectTypeOf<Parameters<typeof runSessionCallWithinBudget>[1]>().toEqualTypeOf<DiskSafeOp>();
expectTypeOf<Parameters<typeof markStageDead>[3]>().toEqualTypeOf<DiskSafeOp>();

// The plant from the review: a raw `request.argv.join(" ")` written to the in-flight op.
// @ts-expect-error raw argv is not a disk-safe op
export const rawOp: Inflight = { op: requestArgv.join(" "), startedAt: 0, done };

expectTypeOf<FillStep["value"]>().toEqualTypeOf<PrivateText>();
expectTypeOf<Args["debugToken"]>().toEqualTypeOf<PrivateText>();
expectTypeOf<Args["localStorage"][number]["value"]>().toEqualTypeOf<PrivateText>();
expectTypeOf<PrivateText>().not.toExtend<string>();

declare const fill: FillStep;
// @ts-expect-error a private value is not a string, so no label, writer or row takes it
export const labelled: string = fill.value;
// @ts-expect-error a fill cannot be built from a raw string, which would skip the mint
export const rawFill: FillStep = { kind: "fill", selector: "input", value: "typed", page: 0 };

expectTypeOf<string>().not.toExtend<DiskSafeText>();
expectTypeOf<DriveFailure["reason"]>().toEqualTypeOf<DiskSafeText>();
expectTypeOf<EvalOutcome["text"]>().toEqualTypeOf<DiskSafeText>();
expectTypeOf<AssertionOutcome["line"]>().toEqualTypeOf<DiskSafeText>();
expectTypeOf<CaptureOutcome["ariaText"]>().toEqualTypeOf<DiskSafeText | null>();
expectTypeOf<Parameters<typeof stepDriveFailure>[2]>().toEqualTypeOf<DiskSafeText>();
expectTypeOf<Parameters<typeof navDriveFailure>[2]>().toEqualTypeOf<DiskSafeText>();
expectTypeOf<Parameters<typeof waitDriveFailure>[1]>().toEqualTypeOf<DiskSafeText>();

declare const browserError: string;
// @ts-expect-error a Playwright message quotes a fill's text, so a failure row takes only scrubbed text
export const rawReason: DriveFailure = { index: 0, kind: "step", flag: "--fill", subject: null, reason: browserError };
// @ts-expect-error an assertion line can quote the page
export const rawLine: AssertionOutcome = { line: browserError, failed: true, refused: false };
