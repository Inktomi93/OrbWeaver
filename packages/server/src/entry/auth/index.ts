// entry/auth — front door for THE auth seam (the ONE Principal construction site). Re-exports the seam
// factory + its types so the composition root + the test mirror import one path. No logic here.

export type { AuthSeam, AuthSeamDeps, PerRequestSeamDeps, SeamResult } from "./seam";
export { createAuthSeam } from "./seam";
