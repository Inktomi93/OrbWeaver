import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, plantDir, plantFile, test } from "@orb/testkit/tooling";
import { runGroup, withRestore } from "../../../tooling/src/migrate-owner/index.ts";

test("a failed apply puts every planned file back byte for byte, and a clean one keeps the rewrite", async ({ scratch }) => {
  const root = plantDir(scratch, "apply");
  plantFile(root, "a.tsx", "<Row className='justify-end' />\n");
  plantFile(root, "b.tsx", "<Row className='justify-start' />\n");
  const files = [join(root, "a.tsx"), join(root, "b.tsx")];
  const rewrite = (code: number) => (): Promise<number> => {
    writeFileSync(files[0] ?? "", '<Row justify="end" />\n');
    return Promise.resolve(code);
  };
  await expect(withRestore(files, rewrite(123))).resolves.toBe(123);
  expect(readFileSync(files[0] ?? "", "utf8")).toBe("<Row className='justify-end' />\n");
  await expect(withRestore(files, rewrite(0))).resolves.toBe(0);
  expect(readFileSync(files[0] ?? "", "utf8")).toBe('<Row justify="end" />\n');
});

test("a step that throws is a failed apply", async ({ scratch }) => {
  const root = plantDir(scratch, "throws");
  plantFile(root, "a.tsx", "before\n");
  const file = join(root, "a.tsx");
  await expect(
    withRestore([file], () => {
      writeFileSync(file, "after\n");
      return Promise.reject(new Error("the run died"));
    }),
  ).rejects.toThrow("the run died");
  expect(readFileSync(file, "utf8")).toBe("before\n");
});

test.for(["SIGINT", "SIGTERM"] as const)("%s stops the running group and restores after it exits", async (signal, { scratch }) => {
  const root = plantDir(scratch, signal);
  plantFile(root, "a.tsx", "before\n");
  const file = join(root, "a.tsx");
  const applied = withRestore([file], () => {
    writeFileSync(file, "after\n");
    const step = runGroup("sleep", ["30"]);
    setImmediate(() => process.emit(signal, signal));
    return step;
  });
  await expect(applied).resolves.toBe(signal === "SIGINT" ? 130 : 143);
  expect(readFileSync(file, "utf8")).toBe("before\n");
});
