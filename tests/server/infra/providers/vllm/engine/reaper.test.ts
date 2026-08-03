// Unit tests for the shared engine-family orphan reaper (A.4 hygiene). Pure identification: `hasOurMarker`
// (the cwd-EQUALITY /proc read) is injected, so this is deterministic. Covers the WIDENED family
// (EngineCore · Worker_TP · `vllm serve`), the api_server-substring false-positive class the design bans,
// and the stage-tree cwd-EQUALITY exclusion (a stage lives UNDER but never EQUAL to the main root).

import { findOrphanedFamily, parsePsRows } from "@orb/server/infra/providers/vllm/engine";
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
});
