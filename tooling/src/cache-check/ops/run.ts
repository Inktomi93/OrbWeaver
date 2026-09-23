// The run: boot the stage, then for each route bind one probe connection as the chat connection, run every
// selected case on it, print one line per case, and restore the binding and remove every probe row.
import { cacheMinTokensOf } from "@orb/contracts/inference";
import { print } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { warn } from "../../_shared/log.ts";
import type { RoomRun } from "../contract/plan.ts";
import type { CacheCase, CacheRoute, CaseOutcome, EnvFile, OrbApi, RouteRefusal, RouteSpec } from "../contract/types.ts";
import { parseCacheCheckArgs } from "../lib/argv.ts";
import { roomRuns } from "../lib/fixture.ts";
import { missingCredential, ROUTE_SPECS } from "../lib/routes.ts";
import { CACHE_READ_FLOOR, formatOutcome, formatSpend, judgeCase, runVerdict } from "../lib/verdict.ts";
import { connectOrb, PROBE_PREFIX, ProbeRows, runRoom } from "./drive.ts";
import { bootStage, probeKey, readMainEnv } from "./stage.ts";

refuseDirectInvocation(import.meta.url, "pnpm cache:check");

const TOOL = "cache-check";
const CHAT_TASK = "chat";
const RUN_ID_RADIX = 36;

type CredentialId = Awaited<ReturnType<OrbApi["credentials"]["add"]["mutate"]>>["id"];

/** A route ready to run, or the refusal every case on it prints. */
type RoutePrep = { readonly kind: "ready"; readonly cacheMinTokens: number } | ({ readonly kind: "refused" } & RouteRefusal);

/** The credential a route runs on: a probe key (added now, removed after), or for an optional route a
 *  credential of its provider already in the stage DB (used, never removed). */
async function routeCredential(api: OrbApi, spec: RouteSpec, key: string | null, rows: ProbeRows): Promise<CredentialId | null> {
  if (key !== null) {
    const added = await api.credentials.add.mutate({ provider: spec.providerId, label: `${PROBE_PREFIX} probe`, key });
    rows.add(() => api.credentials.remove.mutate({ credentialId: added.id }));
    return added.id;
  }
  if (spec.required) {
    return null;
  }
  const stored = (await api.credentials.list.query()).find((c) => c.provider === spec.providerId && c.revokedAt === null);
  return stored?.id ?? null;
}

async function prepareRoute(api: OrbApi, spec: RouteSpec, key: string | null, rows: ProbeRows): Promise<RoutePrep> {
  if (!(await api.credentials.storageStatus.query()).enabled) {
    return {
      kind: "refused",
      verdict: "ERROR",
      reason: "credential storage is off on the stage (booted without CREDENTIALS_KEY); run `pnpm snap --stage-down` and retry",
    };
  }
  const credentialId = await routeCredential(api, spec, key, rows);
  if (credentialId === null) {
    return { kind: "refused", ...missingCredential(spec) };
  }
  const connection = await api.connection.create.mutate({
    label: `${PROBE_PREFIX} ${spec.providerId}`,
    providerId: spec.providerId,
    credentialId,
    baseUrl: null,
    model: spec.model,
  });
  rows.add(() => api.connection.remove.mutate({ connectionId: connection.id }));
  const { capability } = await api.connection.capabilities.query({ connectionId: connection.id });
  if (capability.kind !== "generation" || capability.generation.turns?.explicitPromptCache !== true) {
    return { kind: "refused", verdict: "ERROR", reason: `${spec.model} on ${spec.providerId} states no explicit prompt cache; nothing to measure` };
  }
  // The probe connection becomes the chat connection for the run; the previous binding comes back after.
  const previous = (await api.connection.listBindings.query()).find((b) => b.task === CHAT_TASK)?.binding?.connectionId ?? null;
  await api.connection.setBinding.mutate({ task: CHAT_TASK, connectionId: connection.id });
  rows.add(() => api.connection.setBinding.mutate({ task: CHAT_TASK, connectionId: previous }));
  return { kind: "ready", cacheMinTokens: cacheMinTokensOf(capability.generation) };
}

async function judgeRoom(
  api: OrbApi,
  prep: Extract<RoutePrep, { kind: "ready" }>,
  key: { readonly route: CacheRoute; readonly roomRun: RoomRun },
  probe: { readonly tag: string; readonly rows: ProbeRows; readonly replyCosts: (number | null)[] },
): Promise<CaseOutcome[]> {
  const { route, roomRun } = key;
  const result = await runRoom(api, roomRun, { tag: probe.tag, rows: probe.rows });
  probe.replyCosts.push(...result.prefixCosts);
  return result.cases.map((r): CaseOutcome => {
    if ("error" in r) {
      return { route, case: r.case, verdict: "ERROR", reason: r.error };
    }
    probe.replyCosts.push(...r.run.replyCosts);
    const judged = judgeCase({ calls: r.run.calls, floor: CACHE_READ_FLOOR, cacheMinTokens: prep.cacheMinTokens });
    return "worst" in judged ? { route, case: r.case, ...judged, knownCause: ROUTE_SPECS[route].knownFailures[r.case] } : { route, case: r.case, ...judged };
  });
}

async function runRoute(
  api: OrbApi,
  route: CacheRoute,
  cases: readonly CacheCase[],
  ctx: { runId: string; mainEnv: EnvFile; leftovers: string[] },
): Promise<CaseOutcome[]> {
  const spec = ROUTE_SPECS[route];
  const rows = new ProbeRows();
  const outcomes: CaseOutcome[] = [];
  const replyCosts: (number | null)[] = [];
  try {
    const prep = await prepareRoute(api, spec, probeKey(spec.credentialEnv, ctx.mainEnv), rows);
    for (const roomRun of roomRuns(cases)) {
      const judged =
        prep.kind === "ready"
          ? await judgeRoom(api, prep, { route, roomRun }, { tag: `${ctx.runId}-${route}-${roomRun.room}`, rows, replyCosts })
          : roomRun.cases.map((c): CaseOutcome => ({ route, case: c, verdict: prep.verdict, reason: prep.reason }));
      for (const outcome of judged) {
        for (const line of formatOutcome(outcome)) {
          print(line);
        }
        outcomes.push(outcome);
      }
    }
    if (replyCosts.length > 0) {
      print(formatSpend(route, replyCosts));
    }
  } finally {
    ctx.leftovers.push(...(await rows.release()));
  }
  return outcomes;
}

/** The whole check. Returns the house exit: 0 every judged case passed, 1 a case failed, 2 a case or the stage
 *  could not measure (or probe rows were left behind), 3 misuse. */
export async function runCacheCheck(argv: readonly string[]): Promise<number> {
  const options = parseCacheCheckArgs(argv);
  const mainEnv = readMainEnv();
  const api = connectOrb(await bootStage(options, mainEnv));
  const runId = Date.now().toString(RUN_ID_RADIX);
  const leftovers: string[] = [];
  const outcomes: CaseOutcome[] = [];
  for (const route of options.routes) {
    outcomes.push(...(await runRoute(api, route, options.cases, { runId, mainEnv, leftovers })));
  }
  for (const leftover of leftovers) {
    warn(`[${TOOL}] probe row not removed: ${leftover}`);
  }
  return printVerdict(TOOL, runVerdict(outcomes, leftovers.length));
}
