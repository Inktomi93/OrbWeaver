import { readFile } from "node:fs/promises";

/** Load the vendor's self-contained attribution build for a test-only document initialization script. */
export async function webVitalsSource(): Promise<string> {
  return await readFile(new URL("web-vitals.attribution.iife.js", import.meta.resolve("web-vitals/attribution")), "utf8");
}
