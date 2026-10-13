import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Write already-rendered Markdown without interpreting its application data. */
export async function writeImportReportFile(markdown: string, generatedAt: number, reportsDir: string): Promise<string> {
  const dir = resolve(reportsDir);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `import-${generatedAt}.md`);
  await writeFile(path, markdown, "utf8");
  return path;
}
