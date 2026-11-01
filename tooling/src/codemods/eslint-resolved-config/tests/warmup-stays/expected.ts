import { ESLint } from "eslint";

const eslint = new ESLint({ cwd: "/repo" });

export async function warm(path: string): Promise<void> {
  await eslint.calculateConfigForFile(path);
}
