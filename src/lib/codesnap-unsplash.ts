interface UnsplashPhoto {
  id: string;
  color: string | null;
  description: string | null;
  alt_description: string | null;
  tags?: Array<{ title: string }>;
  links: { download_location: string };
  urls: { regular: string };
  user: { name: string; username: string; links: { html: string } };
}

interface UnsplashSearchResponse {
  results: UnsplashPhoto[];
}

// Tightly focused on chrome/metal/abstract-sculpture aesthetic.
// Avoids generic "dark abstract" that bleeds into nature/people results.
const AESTHETIC_QUERIES = [
  "chrome sphere abstract",
  "liquid chrome sculpture",
  "metallic orb render",
  "polished chrome abstract",
  "silver liquid metal abstract",
  "chrome ball 3d render",
  "reflective metal sphere",
  "brushed chrome abstract",
  "dark chrome orb",
  "liquid silver sculpture",
  "chrome surface abstract",
  "metallic reflection abstract",
  "chrome fluid simulation",
  "abstract metal sculpture dark",
  "glossy chrome sphere",
  "dark metallic abstract render",
  "chrome generative art",
  "silver chrome texture abstract",
];

const POSITIVE_KW = [
  "chrome", "metal", "liquid", "abstract", "fluid", "render",
  "3d", "reflective", "glossy", "silver", "metallic",
  "sculpture", "generative", "cgi", "blender", "octane",
  "sphere", "orb", "polished", "brushed", "reflection", "ball",
];

const NEGATIVE_KW = [
  "car", "vehicle", "automobile", "truck", "motorcycle", "robot",
  "machinery", "factory", "industrial", "landscape", "nature", "forest",
  "beach", "ocean", "sky", "person", "face", "portrait", "logo",
  "gamer", "wallpaper", "text", "infographic", "building", "architecture",
  "food", "flower", "animal", "water", "space", "galaxy", "nebula",
];

function hexLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function scorePhoto(photo: UnsplashPhoto): number {
  let score = 0;

  if (photo.color) {
    const lum = hexLuminance(photo.color);
    if (lum < 0.04) score += 6;
    else if (lum < 0.12) score += 4;
    else if (lum < 0.25) score += 2;
    else if (lum > 0.5) score -= 5;
  }

  const text = [
    photo.description ?? "",
    photo.alt_description ?? "",
    ...(photo.tags?.map(t => t.title) ?? []),
  ].join(" ").toLowerCase();

  for (const kw of POSITIVE_KW) if (text.includes(kw)) score += 1;
  for (const kw of NEGATIVE_KW) if (text.includes(kw)) score -= 3;

  return score;
}

function pickQueries(n: number): string[] {
  const shuffled = [...AESTHETIC_QUERIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

async function searchPhotos(query: string, key: string): Promise<UnsplashPhoto[]> {
  // Randomize page (1–3) so repeated calls surface different results
  const page = Math.floor(Math.random() * 3) + 1;
  const params = new URLSearchParams({
    query,
    color: "black",
    orientation: "portrait",
    content_filter: "high",
    order_by: "relevant",
    per_page: "30",
    page: String(page),
    client_id: key,
  });
  const res = await fetch(`https://api.unsplash.com/search/photos?${params}`);
  if (!res.ok) return [];
  const data: UnsplashSearchResponse = await res.json();
  return data.results ?? [];
}

export async function fetchRandomLiquidMetalPhoto(): Promise<{
  imageUrl: string;
  credit: string;
  creditUrl: string;
  unsplashUrl: string;
}> {
  const key = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined;
  if (!key) throw new Error("VITE_UNSPLASH_ACCESS_KEY not set");

  // 5 parallel queries → larger pool → more variety per click
  const queries = pickQueries(5);
  const results = await Promise.allSettled(queries.map(q => searchPhotos(q, key)));

  // Merge and dedupe by id
  const seen = new Set<string>();
  const pool: UnsplashPhoto[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const photo of r.value) {
      if (!seen.has(photo.id)) {
        seen.add(photo.id);
        pool.push(photo);
      }
    }
  }

  if (pool.length === 0) throw new Error("No se encontraron resultados en Unsplash.");

  // Score, sort, pick randomly from top 15 to keep variety
  const ranked = pool
    .map(p => ({ photo: p, score: scorePhoto(p) }))
    .sort((a, b) => b.score - a.score);

  const topN = ranked.slice(0, Math.min(15, ranked.length));
  const chosen = topN[Math.floor(Math.random() * topN.length)].photo;

  // Required by Unsplash API guidelines: trigger download event
  fetch(`${chosen.links.download_location}&client_id=${key}`).catch(() => {});

  // Hotlink directly — required by Unsplash guidelines. Add UTM attribution.
  const utmParams = "utm_source=codereel&utm_medium=referral";
  const creditUrl = `https://unsplash.com/@${chosen.user.username}?${utmParams}`;
  const unsplashUrl = `https://unsplash.com/?${utmParams}`;

  return {
    imageUrl: `${chosen.urls.regular}&${utmParams}`,
    credit: chosen.user.name,
    creditUrl,
    unsplashUrl,
  };
}
