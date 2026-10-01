#!/usr/bin/env node
// Preserve ESLint's native CLI while keeping partition filenames out of OS command lines.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { readConcurrencyProfile } from "@orb/tooling/_shared/concurrency-profile";
import { z } from "zod";

const require = createRequire(import.meta.url);

try {
  const args = process.argv.slice(2);
  const forwarded =
    args[0] === "--args-file"
      ? z
          .array(z.string().min(1))
          .min(1)
          .parse(JSON.parse(readFileSync(z.tuple([z.literal("--args-file"), z.string().min(1)]).parse(args)[1], "utf8")))
      : args;
  const profile = readConcurrencyProfile();
  const concurrency = forwarded.includes("--concurrency") ? [] : ["--concurrency", String(profile.eslintConcurrency)];
  const bin = join(dirname(require.resolve("eslint/package.json")), "bin", "eslint.js");
  process.argv = [process.execPath, bin, ...concurrency, ...forwarded];
  await import(pathToFileURL(bin).href);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[eslint-launcher] launcher configuration refused the run: ${message}`);
  process.exitCode = 2;
}
