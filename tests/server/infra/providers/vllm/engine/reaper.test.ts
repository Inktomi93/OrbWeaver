// Unit tests for the shared engine-family orphan reaper (A.4 hygiene). Pure identification: `hasOurMarker`
// (the cwd-EQUALITY /proc read) is injected, so this is deterministic. Covers the WIDENED family
// (EngineCore · Worker_TP · `vllm serve`), the api_server-substring false-positive class the design bans,
// and the stage-tree cwd-EQUALITY exclusion (a stage lives UNDER but never EQUAL to the main root).

import { findOrphanedFamily, liveListenerPids, parsePsRows, reapTargets } from "@orb/server/infra/providers/vllm/engine";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures.ts";

describe("parsePsRows", () => {
  test("parses `pid ppid args` rows, keeping the full args string", () => {
    expect(parsePsRows("  111   1 vllm serve Qwen/x --port 8703\ngarbage")).toEqual([{ pid: 111, ppid: 1, args: "vllm serve Qwen/x --port 8703" }]);
  });
});

describe("findOrphanedFamily — widened family, cwd-equality match", () => {
  // An orphan: a family process whose cwd is ours but whose PARENT's cwd is not (the APIServer died and it
  // re-parented to init/the subreaper). A supervised member's parent (the APIServer) is also ours.
  const ps = [
    "  111   1 VLLM::EngineCore", // orphan EngineCore: parent (1) is init — not ours
    "  222 333 VLLM::EngineCore", // supervised: parent 333 (APIServer) is ours
    "  444   1 VLLM::Worker_TP0", // orphan worker: WIDENED family member
    "  555 333 pt_main_thread Worker_TP1", // supervised worker (parent ours)
    "  666   1 vllm serve Qwen/Qwen3-VL-8B-Instruct --port 8703", // orphan APIServer itself (partial-dead tree)
    "  777   1 some-unrelated-process", // not a family member
    "  888   1 VLLM::EngineCore", // a bystander's core — cwd not ours
  ].join("\n");

  test("reaps every orphaned family member (EngineCore, Worker_TP, vllm serve) whose cwd is ours", () => {
    const ours = new Set([111, 222, 333, 444, 555, 666]); // 888 is a bystander (marker false)
    expect(findOrphanedFamily(ps, (pid) => ours.has(pid))).toEqual([111, 444, 666]);
  });

  test("a fully-supervised member (parent also ours) is never reaped", () => {
    expect(findOrphanedFamily("  222 333 VLLM::EngineCore", (pid) => new Set([222, 333]).has(pid))).toEqual([]);
  });

  test("ignores non-family rows entirely (never a standalone substring grep)", () => {
    expect(findOrphanedFamily("  444   1 python train.py", () => true)).toEqual([]);
  });

  test("the api_server false-positive class: a bare `api_server` match is NOT a family marker (an IDE LSP matched it)", () => {
    // No family marker in the cmdline → never a candidate, even though cwd is ours.
    expect(findOrphanedFamily("  999   1 node language-server api_server.js", () => true)).toEqual([]);
  });

  test("stage-tree exclusion: cwd EQUALITY, never prefix — a stage family (cwd UNDER but ≠ root) misses the marker", () => {
    const mainRoot = "/repo";
    const stageDir = "/repo/.cache/snap-stage/abc123";
    // marker keyed to the MAIN root: a stage process whose cwd is the stage dir is not EQUAL → not ours.
    const cwdOf = new Map<number, string>([
      [111, mainRoot], // a real orphan dev engine
      [1, "/"],
      [222, stageDir], // stage engine — cwd is UNDER but ≠ mainRoot
    ]);
    const marker = (pid: number): boolean => cwdOf.get(pid) === mainRoot;
    const psMixed = "  111   1 VLLM::EngineCore\n  222   1 VLLM::EngineCore";
    // Only 111 (main root, exact match) is reaped — the stage's 222 is excluded by equality-not-prefix.
    expect(findOrphanedFamily(psMixed, marker)).toEqual([111]);
  });

  // THE DEFECT, characterized on real-fleet-shaped input (captured live 2026-08-19: three HEALTHY detached
  // APIServers, each parent = `systemd --user` (pid 2043507, cwd `/`), each own cwd = the repo root). The raw
  // orphan predicate cannot tell these live engines from corpses — it flags ALL THREE. This is exactly why an
  // ungated reap SIGKILLs the healthy siblings on a partial-down reconcile ("restart ONE → boots the WHOLE
  // fleet"). `findOrphanedFamily` is intentionally unchanged; the liveness gate lives in `reapTargets` below.
  test("the whole-fleet-reboot defect: a HEALTHY detached fleet's live APIServers all match the orphan predicate", () => {
    const psLiveFleet = [
      "3161014       1 /root/.cache/vllm/venv/bin/python /root/.cache/vllm/venv/bin/vllm serve Qwen/Qwen3-VL-Embedding-2B --port 8701",
      "3165263       1 /root/.cache/vllm/venv/bin/python /root/.cache/vllm/venv/bin/vllm serve Qwen/Qwen3-VL-Reranker-2B --port 8702",
      "3167606       1 /root/.cache/vllm/venv/bin/python /root/.cache/vllm/venv/bin/vllm serve Qwen3.8-27B --port 8703",
    ].join("\n");
    // Each APIServer's cwd is ours; its parent (systemd, pid 1 here) is not. All three are flagged.
    const ours = new Set([3_161_014, 3_165_263, 3_167_606]);
    expect(findOrphanedFamily(psLiveFleet, (pid) => ours.has(pid))).toEqual([3_161_014, 3_165_263, 3_167_606]);
  });
});

describe("liveListenerPids — the healthy-port bind winners (spared by the liveness gate)", () => {
  // `ss -tlnp` rows: only the ports we pass (the ones that answered /health) contribute a listener pid.
  const ss = [
    'LISTEN 0 128 127.0.0.1:8701 0.0.0.0:* users:(("python",pid=3161014,fd=7))',
    'LISTEN 0 128 127.0.0.1:8702 0.0.0.0:* users:(("python",pid=3165263,fd=7))',
    'LISTEN 0 128 127.0.0.1:8703 0.0.0.0:* users:(("python",pid=3167606,fd=7))',
    'LISTEN 0 128 127.0.0.1:5432 0.0.0.0:* users:(("postgres",pid=999,fd=7))',
  ].join("\n");

  test("returns the listener pid for each healthy port, ignoring unlisted ports", () => {
    expect(liveListenerPids(ss, new Set(["8701", "8702", "8703"]))).toEqual([3_161_014, 3_165_263, 3_167_606]);
  });

  test("a port that did not answer /health (absent from the set) contributes no protected pid", () => {
    // Only gen (8703) is healthy — embed/rerank are down, so their (stale) rows must NOT protect anything.
    expect(liveListenerPids(ss, new Set(["8703"]))).toEqual([3_167_606]);
  });

  test("no healthy ports → no protected pids", () => {
    expect(liveListenerPids(ss, new Set())).toEqual([]);
  });
});

describe("reapTargets — the liveness gate (the fix)", () => {
  // The admin-restart scenario: gen (8703) was just killed (down, no listener); embed (3_161_014) + rerank
  // (3_165_263) are HEALTHY detached engines that the orphan predicate flags. The gate spares the live
  // listeners so only genuine corpses die — the launcher then adopts embed/rerank in place and boots only gen.
  const psPartialDown = [
    "3161014       1 /venv/bin/python /venv/bin/vllm serve embed --port 8701", // healthy embed — live listener
    "3165263       1 /venv/bin/python /venv/bin/vllm serve rerank --port 8702", // healthy rerank — live listener
    "3200000       1 VLLM::EngineCore", // gen's orphaned corpse (its APIServer was killed) — reap it
  ].join("\n");
  const ours = new Set([3_161_014, 3_165_263, 3_200_000]);
  const marker = (pid: number): boolean => ours.has(pid);

  test("spares the LIVE engine listeners and reaps only the corpse (the whole-fleet-reboot fix)", () => {
    const live = new Set([3_161_014, 3_165_263]); // the healthy embed+rerank listeners
    expect(reapTargets(psPartialDown, marker, live)).toEqual([3_200_000]);
  });

  test("empty protected set (cold boot: no healthy ports) → identical to the ungated reap", () => {
    expect(reapTargets(psPartialDown, marker, new Set())).toEqual(findOrphanedFamily(psPartialDown, marker));
  });

  test("a duplicate-fleet loser (an orphan that never won a port bind) is NOT a listener → still reaped", () => {
    // 3161014 won 8701 (protected); 3300000 is a duplicate that loaded the model but lost the bind — it is a
    // family orphan, never appears among the listeners, and must still be reaped to free its VRAM.
    const psWithDupe = `${psPartialDown}\n  3300000   1 /venv/bin/python /venv/bin/vllm serve embed --port 8701`;
    const live = new Set([3_161_014, 3_165_263]);
    const oursWithDupe = new Set([...ours, 3_300_000]);
    expect(reapTargets(psWithDupe, (pid) => oursWithDupe.has(pid), live)).toEqual([3_200_000, 3_300_000]);
  });
});
