import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const projectRoot = process.cwd();

export function fromRoot(...parts: string[]): string {
  return path.join(projectRoot, ...parts);
}

export async function writeJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}
