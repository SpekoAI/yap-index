/**
 * Fetch Google Fonts as TTF for use in ImageResponse (which cannot consume
 * woff2). Best effort: on any failure the caller falls back to the default
 * font rather than failing the card.
 */

type FontSpec = {
  family: string;
  weight: number;
  css: string;
};

const SPECS: FontSpec[] = [
  {
    family: "Fraunces",
    weight: 900,
    css: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,900",
  },
  {
    family: "Archivo",
    weight: 500,
    css: "https://fonts.googleapis.com/css2?family=Archivo:wght@500",
  },
];

const cache = new Map<string, ArrayBuffer>();

async function fetchTtf(spec: FontSpec): Promise<ArrayBuffer | null> {
  const cached = cache.get(spec.family);
  if (cached) {
    return cached;
  }
  try {
    const cssResponse = await fetch(spec.css, {
      // An older UA makes Google Fonts serve TTF instead of woff2.
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; rv:20.0)" },
    });
    if (!cssResponse.ok) {
      return null;
    }
    const css = await cssResponse.text();
    const match = css.match(/src: url\((https:[^)]+\.ttf)\)/);
    if (!match) {
      return null;
    }
    const fontResponse = await fetch(match[1]);
    if (!fontResponse.ok) {
      return null;
    }
    const buffer = await fontResponse.arrayBuffer();
    cache.set(spec.family, buffer);
    return buffer;
  } catch {
    return null;
  }
}

export type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 500 | 900;
  style: "normal";
};

export async function ogFonts(): Promise<OgFont[]> {
  const fonts: OgFont[] = [];
  for (const spec of SPECS) {
    const data = await fetchTtf(spec);
    if (data) {
      fonts.push({
        name: spec.family,
        data,
        weight: spec.weight as 500 | 900,
        style: "normal",
      });
    }
  }
  return fonts;
}

export const OG_COLORS = {
  paper: "#f6f1e4",
  ink: "#3a3128",
  press: "#b23a26",
  soft: "#6f6455",
} as const;
