import { readFileSync } from "node:fs";
import path from "node:path";

import { ImageResponse } from "next/og";

/**
 * The branded share card (Open Graph and Twitter), drawn with next/og.
 *
 * Colours are NOT written here: they are read from the design tokens in globals.css when the image
 * is built, so the one file that owns colour literals still owns them. next/og cannot read CSS
 * variables or oklch, which is why the tokens are parsed rather than referenced. These routes are
 * static (no cookies, no data), so they run once at build and are served from the CDN.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_ALT = "Minced: what to cook, whether or not you already know";

let tokens: Record<string, string> | null = null;

function token(name: string, fallback: string): string {
  if (!tokens) {
    tokens = {};
    try {
      const css = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
      for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\b/g)) tokens[m[1]] = m[2];
    } catch {
      // Not fatal: the card still renders with the fallbacks below.
    }
  }
  return tokens[name] ?? fallback;
}

/** Young Serif (the site's display face) from Google Fonts, limited to the glyphs on the card. Null on any failure. */
async function displayFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=Young+Serif&text=${encodeURIComponent(text)}`, {
        // An old UA makes Google answer with woff/ttf, which next/og accepts (woff2 it does not).
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; rv:2.0) Gecko/20100101 Firefox/4.0" },
      })
    ).text();
    const url = css.match(/src:\s*url\((.+?)\)\s*format\('(?:woff|opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function renderOgCard(opts: { title?: string; subtitle?: string } = {}): Promise<ImageResponse> {
  const title = opts.title ?? "What to cook, whether or not you already know.";
  const subtitle = opts.subtitle ?? "Search by name, or choose what you have.";
  const bg = token("herb", "darkgreen");
  const ink = token("on-night", "white");
  const accent = token("saffron", "gold");

  const font = await displayFont(`${title}${subtitle}Minced`);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: bg,
          color: ink,
          padding: "72px 84px",
          fontFamily: font ? "Young Serif" : "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 22, height: 22, borderRadius: 22, background: accent }} />
          <div style={{ fontSize: 40, letterSpacing: -0.5 }}>Minced</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: title.length > 40 ? 72 : 92, lineHeight: 1.05, letterSpacing: -2 }}>{title}</div>
          <div style={{ fontSize: 34, lineHeight: 1.3, opacity: 0.86, fontFamily: "sans-serif" }}>{subtitle}</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: font ? [{ name: "Young Serif", data: font, style: "normal", weight: 400 }] : undefined,
    },
  );
}
