import postgres from "postgres";

type GlobalWithSql = typeof globalThis & {
  yapIndexSql?: ReturnType<typeof postgres>;
};

/**
 * Lazy singleton so importing this module never requires DATABASE_URL at
 * build time. Only request handlers that actually touch the database call
 * getSql().
 */
export function getSql(): ReturnType<typeof postgres> {
  const g = globalThis as GlobalWithSql;
  if (!g.yapIndexSql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not configured");
    }
    g.yapIndexSql = postgres(url, { max: 2, idle_timeout: 20 });
  }
  return g.yapIndexSql;
}
