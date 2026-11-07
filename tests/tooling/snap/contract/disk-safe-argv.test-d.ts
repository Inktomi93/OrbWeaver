// Raw process arguments cannot reach a run index or a session row: both writers name the branded projection.
import { expectTypeOf } from "vitest";
import type { DiskSafeArgv, DiskSafeOp } from "../../../../tooling/src/snap/contract/disk-safe-argv.ts";
import type { SnapRunIndex } from "../../../../tooling/src/snap/contract/run-index.ts";
import type { SessionRow } from "../../../../tooling/src/snap/contract/session.ts";
import type { completeSnapRun } from "../../../../tooling/src/snap/ops/run-bundle.ts";

expectTypeOf<SnapRunIndex["process"]["argv"]>().toEqualTypeOf<DiskSafeArgv>();
expectTypeOf<SessionRow["bootArgv"]>().toEqualTypeOf<DiskSafeArgv>();
expectTypeOf<SessionRow["lastOp"]>().toEqualTypeOf<DiskSafeOp | null>();
expectTypeOf<SessionRow["inflightOp"]>().toEqualTypeOf<DiskSafeOp | null>();
expectTypeOf<Parameters<typeof completeSnapRun>[2]>().toEqualTypeOf<DiskSafeArgv>();
expectTypeOf<readonly string[]>().not.toExtend<DiskSafeArgv>();
expectTypeOf<string>().not.toExtend<DiskSafeOp>();
