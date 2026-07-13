import { readFile } from "node:fs/promises";
import path from "node:path";

type PageStats = {
  title?: string;
  generatedAt?: string;
};

async function readStats(): Promise<PageStats | null> {
  try {
    const contents = await readFile(
      path.join(process.cwd(), "data", "stats.json"),
      "utf8",
    );
    return JSON.parse(contents) as PageStats;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

export default async function Home() {
  const stats = await readStats();

  return (
    <main data-generated-at={stats?.generatedAt}>
      <h1>{stats?.title ?? "Yap Index - coming soon"}</h1>
    </main>
  );
}
