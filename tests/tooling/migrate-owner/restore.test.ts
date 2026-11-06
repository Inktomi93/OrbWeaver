import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, plantDir, plantFile, test } from "@orb/testkit/tooling";
import { withRestore } from "../../../tooling/src/migrate-owner/index.ts";

test("a failed apply puts every planned file back byte for byte, and a clean one keeps the rewrite", ({ scratch }) => {
  const root = plantDir(scratch, "apply");
  plantFile(root, "a.tsx", "<Row className='justify-end' />\n");
  plantFile(root, "b.tsx", "<Row className='justify-start' />\n");
  const files = [join(root, "a.tsx"), join(root, "b.tsx")];
  const rewrite = (code: number) => (): number => {
    writeFileSync(files[0] ?? "", '<Row justify="end" />\n');
    return code;
  };
  expect(withRestore(files, rewrite(123))).toBe(123);
  expect(readFileSync(files[0] ?? "", "utf8")).toBe("<Row className='justify-end' />\n");
  expect(withRestore(files, rewrite(0))).toBe(0);
  expect(readFileSync(files[0] ?? "", "utf8")).toBe('<Row justify="end" />\n');
});

test("a step that throws is a failed apply", ({ scratch }) => {
  const root = plantDir(scratch, "throws");
  plantFile(root, "a.tsx", "before\n");
  const file = join(root, "a.tsx");
  expect(() =>
    withRestore([file], () => {
      writeFileSync(file, "after\n");
      throw new Error("the run died");
    }),
  ).toThrow("the run died");
  expect(readFileSync(file, "utf8")).toBe("before\n");
});
