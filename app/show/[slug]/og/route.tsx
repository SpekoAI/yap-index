import { ImageResponse } from "next/og";

import { getDelistedSlugs } from "@/lib/delists";
import { OG_COLORS, ogFonts } from "@/lib/og-fonts";
import { findShow, rankOf, readStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const rawStats = await readStats();
  const delisted = await getDelistedSlugs();
  const stats = {
    ...rawStats,
    shows: rawStats.shows.filter((s) => !delisted.has(s.show_id)),
  };
  const show = findShow(stats, slug);
  if (!show) {
    return new Response("Not found", { status: 404 });
  }
  const rank = rankOf(stats, slug, "wpm");
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
            justifyContent: "space-between",
            alignItems: "center",
            textTransform: "uppercase",
            letterSpacing: 4,
            fontSize: 24,
            color: OG_COLORS.soft,
          }}
        >
          <span>The Yap Index</span>
          <span>No. {rank} by WPM</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 280,
              fontWeight: 900,
              lineHeight: 0.9,
              color: OG_COLORS.press,
            }}
          >
            {rank}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 64,
                fontWeight: 900,
                lineHeight: 1.05,
              }}
            >
              {show.show_name}
            </div>
            <div style={{ marginTop: 18, fontSize: 36, color: OG_COLORS.soft }}>
              {show.wpm.toFixed(0)} words per minute
            </div>
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
          <span>yap-index.speko.dev</span>
          <span>measured by Speko</span>
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
