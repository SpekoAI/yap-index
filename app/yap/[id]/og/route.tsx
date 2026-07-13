import { ImageResponse } from "next/og";

import { getSql } from "@/lib/db";
import { OG_COLORS, ogFonts } from "@/lib/og-fonts";
import { readStats, showsOutYapped } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new Response("Not found", { status: 404 });
  }
  const sql = getSql();
  const rows = await sql`
    SELECT metrics FROM yap_index.yap_cards WHERE id = ${id}
  `;
  const row = rows[0] as
    | { metrics: { wpm: number; words: number; seconds: number } }
    | undefined;
  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const stats = await readStats();
  const beaten = showsOutYapped(stats, row.metrics.wpm);
  const fonts = await ogFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: OG_COLORS.paper,
          color: OG_COLORS.ink,
          padding: "56px 64px",
          fontFamily: "Archivo, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            textTransform: "uppercase",
            letterSpacing: 4,
            fontSize: 24,
            color: OG_COLORS.soft,
          }}
        >
          The Yap Index - field report
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 24,
            }}
          >
            <span
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 210,
                fontWeight: 900,
                lineHeight: 0.9,
                color: OG_COLORS.press,
              }}
            >
              {row.metrics.wpm.toFixed(0)}
            </span>
            <span style={{ fontSize: 40, color: OG_COLORS.soft }}>
              words per minute
            </span>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              fontFamily: "Fraunces, serif",
              fontSize: 44,
              fontWeight: 900,
            }}
          >
            Out-yaps {beaten} of {stats.shows.length} tech podcasts
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            borderTop: `4px solid ${OG_COLORS.ink}`,
            paddingTop: 20,
            fontSize: 24,
            color: OG_COLORS.soft,
          }}
        >
          <span>yap-index.speko.dev/yap</span>
          <span>measured live by Speko</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fonts.length > 0 ? fonts : undefined,
    },
  );
}
