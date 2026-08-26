// The metering orchestration: launch (full motion) -> init the in-page meter -> steps (optionally
// under the V8 sampling profiler) -> bucket + table + RESULT. A CPU profile's top self-time frame
// can be the INSTRUMENT — attribute before optimizing.
import { writeFile } from "node:fs/promises";
import type { ResultPair } from "@orb/tooling/_shared/artifacts";
import { artifactFile, print, printResult } from "@orb/tooling/_shared/artifacts";
import { buildUrl, launchProbeSession, settle, withProbeSession } from "@orb/tooling/_shared/browser";
import { instrumentError } from "@orb/tooling/_shared/evidence";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Args, MeterData, MeterWindow } from "../contract/types.ts";
import { NAV_TIMEOUT_MS, TRAILING_SETTLE_MS } from "../lib/budgets.ts";
import { meterApparatusGap, meterEvidenceGaps } from "../lib/evidence.ts";
import { runSteps } from "./drive.ts";
import { METER_INIT_JS } from "./meter.ts";
import { buildReports, printTable } from "./report.ts";

refuseDirectInvocation(import.meta.url, "pnpm perf-meter");

const CPU_SAMPLING_INTERVAL_US = 100; // 10kHz
const CLICK_DUR_BREACH_MS = 100;

export async function runCpuProfile(opts: Args): Promise<number> {
  const url = buildUrl(opts.base, opts.route);

  const session = await launchProbeSession({
    headless: true,
    viewport: opts.viewport,
    colorScheme: null,
    reducedMotion: false, // the OS media query — a motion probe wants the real animations
    appearance: opts.appearance, // …and the APP setting, which the media query does not reach (--full-motion)
    theme: opts.theme,
    localStorage: [],
  });
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one linear ownership closure keeps every profiling arm inside the same guaranteed cleanup boundary.
  return await withProbeSession(session, async () => {
    await session.context.addInitScript({ content: METER_INIT_JS });
    const { page } = session;

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await settle(page, opts.settleMs);

    // V8 sampling profiler over the whole step sequence (CDP). Post-settle start so app boot
    // doesn't drown the interactions in the flame graph.
    const cdp = opts.cpuProfile ? await session.context.newCDPSession(page) : null;
    if (cdp !== null) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: CPU_SAMPLING_INTERVAL_US });
      await cdp.send("Profiler.start");
    }

    const failures = await runSteps(page, opts.steps);
    await settle(page, TRAILING_SETTLE_MS);

    let profilePath: string | null = null;
    if (cdp !== null) {
      const { profile } = (await cdp.send("Profiler.stop")) as { profile: unknown };
      profilePath = await artifactFile("perf-meter", opts.out, ".cpuprofile");
      await writeFile(profilePath, JSON.stringify(profile));
    }

    const data: MeterData | undefined = await page.evaluate(() => (globalThis as unknown as MeterWindow).__perfMeter);
    const pageErrors = session.pageErrors;

    // ZERO HYGIENE (#409) — the apparatus arm, BEFORE any bucketing: the meter rides an init script and a
    // page can outlive or replace it. Reading `undefined` here used to reach the bucketer and die as a
    // bare TypeError stack: an exit code with no diagnosis, which is the same failure as a silent zero.
    if (data === undefined) {
      print(`URL      ${url}`);
      return instrumentError(meterApparatusGap(url));
    }
    const gaps = meterEvidenceGaps(data);
    if (gaps.length > 0) {
      print(`URL      ${url}`);
      return instrumentError(...gaps);
    }

    const reports = buildReports(data);
    // `--out` names a base under reports/perf-meter/ — or, path-shaped, the exact file (_shared/artifacts.ts).
    const outPath = await artifactFile("perf-meter", opts.out, ".json");
    await writeFile(outPath, JSON.stringify({ args: opts, reports, raw: data, pageErrors }, null, 2));

    print(`URL      ${url}`);
    print(`json     ${outPath}`);
    if (profilePath !== null) {
      print(`profile  ${profilePath}  (Chrome DevTools Performance panel / speedscope.app)`);
    }
    print(`steps    ${reports.length} · page errors ${pageErrors.length} · step failures ${failures}`);
    print("");
    printTable(reports);
    if (pageErrors.length > 0) {
      print("");
      print("--- page errors ---");
      for (const e of pageErrors) {
        print(e);
      }
    }

    const breachSteps = reports.filter((r) => r.longTaskCount > 0 || (r.clickDurMs ?? 0) > CLICK_DUR_BREACH_MS);
    const worstLt = reports.reduce((a, r) => Math.max(a, r.longTaskWorstMs), 0);
    const worstClick = reports.reduce((a, r) => Math.max(a, r.clickDurMs ?? 0), 0);
    const pairs: ResultPair[] = [
      ["steps", reports.length],
      ["breach-steps", breachSteps.length],
      ["worst-longtask", `${worstLt}ms`],
      ["worst-click", `${worstClick}ms`],
      ["step-failures", failures],
      ["page-errors", pageErrors.length],
      ["json", outPath],
    ];
    if (profilePath !== null) {
      pairs.push(["profile", profilePath]);
    }
    printResult("perf-meter", pairs);
    return failures > 0 || pageErrors.length > 0 ? 1 : 0;
  });
}
