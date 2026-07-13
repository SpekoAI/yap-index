import { getSql } from "@/lib/db";

/**
 * Slugs hidden via the self-serve delist flow. Fails open (empty set) so a
 * database hiccup never takes the leaderboard down; the delist promise is
 * "hidden immediately" under normal operation.
 */
export async function getDelistedSlugs(): Promise<Set<string>> {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT show_slug FROM yap_index.delists WHERE restored = false
    `;
    return new Set(rows.map((row) => row.show_slug as string));
  } catch {
    return new Set();
  }
}
