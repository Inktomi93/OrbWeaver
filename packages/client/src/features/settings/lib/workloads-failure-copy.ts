// workloads-failure-copy — the Workloads pane's friendly failure mapping (a pure client-side lookup
// from a raw runner exception string to user-actionable copy). DOM-free (node-testable). Split from
// `workloads-model` (§2.1 size) as a cohesive unit: the row shows the friendly line, keeps the raw
// string one disclosure away for support. NEVER touches the server runners.

/** A failure class → user-actionable copy. The runner stamps a raw exception string on `error`
 *  (`WorkloadError.message` — internal detail, sometimes an unfriendly stack tail); each entry pairs a
 *  lowercase substring MATCHER with its copy. */
interface FailureClass {
  readonly match: readonly string[];
  readonly friendly: string;
}

const FAILURE_CLASSES: readonly FailureClass[] = [
  {
    // The DAG `dependency_failed` terminal — the row never ran because a dep didn't succeed. Keyed on the
    // distinctive fragment of the server message ({@link DEPENDENCY_FAILURE_MARKER}); listed FIRST so it
    // wins over any coincidental substring in a normal runtime error.
    match: ["a dependency did not succeed", "dependency_failed"],
    friendly:
      "This job never ran — one of the jobs it depends on didn't succeed. Retry after its dependencies finish.",
  },
  {
    match: [
      "model file",
      "model buffer",
      "onnx",
      "no model",
      "model not found",
      "model unavailable",
    ],
    friendly: "A required local model wasn't available. Check the model is installed, then retry.",
  },
  {
    match: ["econnrefused", "etimedout", "enotfound", "fetch failed", "network", "socket hang up"],
    friendly: "A network or provider call failed. Check the connection, then retry.",
  },
  {
    match: ["timed out", "timeout", "deadline"],
    friendly: "The job took too long and timed out. Retry — it resumes where it left off.",
  },
  {
    match: ["out of memory", "oom", "enospc", "no space"],
    friendly: "The job ran out of memory or disk. Free some space, then retry.",
  },
  {
    match: ["rate limit", "429", "too many requests", "quota"],
    friendly: "The provider rate-limited this run. Wait a moment, then retry.",
  },
  {
    match: ["worker heartbeat", "worker_died", "reaped"],
    friendly: "The worker running this job stopped unexpectedly. Retry to run it again.",
  },
];

/** The user-actionable line for a raw failure string, or `null` when nothing maps (the row falls back
 *  to the raw string). The raw string ALWAYS stays available to the caller for the support disclosure. */
export function friendlyWorkloadError(raw: string): string | null {
  const haystack = raw.toLowerCase();
  for (const cls of FAILURE_CLASSES) {
    if (cls.match.some((needle) => haystack.includes(needle))) {
      return cls.friendly;
    }
  }
  return null;
}
