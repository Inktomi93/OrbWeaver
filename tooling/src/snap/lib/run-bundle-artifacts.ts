// Browser-free completeness classification for immutable-v1 artifacts that predate allocation
// declarations. Current producers carry exact metadata; this is the explicit legacy compatibility door.
import type { SnapRunArtifact } from "../contract/run-index.ts";

const DIAGNOSTIC_COMPLETENESS = "evidence/orb-console-completeness.json";
const CORE_CAPTURE_EVIDENCE = "evidence/core-capture.json";

type CompletenessPatch = Pick<SnapRunArtifact, "completeness" | "completenessDetail">;

const LEGACY_PRODUCER_COMPLETENESS: Readonly<Record<string, CompletenessPatch>> = {
  "browser-diagnostics": {
    completeness: "bounded",
    completenessDetail: "bounded diagnostic batch with an explicit limit-event receipt",
  },
  motion: {
    completeness: "bounded",
    completenessDetail: "finite app-side LoAF and layout-shift rings; verdict totals and measured populations remain explicit",
  },
  perf: { completeness: "complete", completenessDetail: "complete observer records for the finite action tape" },
  snaps: { completeness: "complete", completenessDetail: "complete capture manifest or image bytes; nested channels declare their own limits" },
  lighthouse: { completeness: "complete", completenessDetail: "complete Lighthouse report after category/runtime/truncation validation" },
};

const LEGACY_PATH_COMPLETENESS: Readonly<Record<string, CompletenessPatch>> = {
  [DIAGNOSTIC_COMPLETENESS]: { completeness: "complete", completenessDetail: "complete typed diagnostic completeness summary" },
  [CORE_CAPTURE_EVIDENCE]: {
    completeness: "bounded",
    completenessDetail: "page/capture populations are complete; failed requests are a declared latest-per-URL projection",
  },
};

const COMPLETE_ANALYZERS = new Set(["boot-trace", "cpu-profile", "requests"]);

export function classifySnapArtifactCompleteness(artifact: SnapRunArtifact): SnapRunArtifact {
  if (artifact.declaration === "declared" || artifact.role === "raw-fallback") {
    return artifact;
  }
  const relativePath = String(artifact.relativePath);
  const staticPatch = LEGACY_PRODUCER_COMPLETENESS[artifact.producer] ?? LEGACY_PATH_COMPLETENESS[relativePath];
  if (staticPatch !== undefined) {
    return { ...artifact, ...staticPatch };
  }
  if (artifact.producer === "react-profile") {
    const trace = relativePath.endsWith(".trace.json");
    return {
      ...artifact,
      completeness: trace ? "complete" : "bounded",
      completenessDetail: trace ? "complete captured React/Chromium timing trace" : "bounded previews and event populations carry explicit truncation markers",
    };
  }
  if (relativePath.endsWith(".har")) {
    return { ...artifact, completeness: "bounded", completenessDetail: "bounded redacted HAR; entry/body limit receipts remain inside the artifact" };
  }
  if (COMPLETE_ANALYZERS.has(artifact.producer)) {
    return { ...artifact, completeness: "complete", completenessDetail: "complete analyzer output for its declared run window" };
  }
  return artifact;
}
