import { join } from "node:path";
import { ESLint, Linter } from "eslint";

const ROOT = "/repo";
const eslint = new ESLint({ cwd: ROOT });

async function findings(rule: string, source: string, path: string): Promise<number> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(source, { plugins: config?.plugins ?? {}, rules: { [rule]: config?.rules?.[rule] ?? "off" } });
  return found.length;
}

async function level(path: string): Promise<unknown> {
  const config = await eslint.calculateConfigForFile(path);
  return config.rules?.["no-var"]?.[0];
}

export { findings, level };
