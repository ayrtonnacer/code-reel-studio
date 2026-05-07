interface UnsplashPhoto {
  links: { download_location: string };
  urls: { regular: string };
  user: { name: string; username: string; links: { html: string } };
}

export async function fetchRandomLiquidMetalPhoto(): Promise<{
  imageUrl: string;
  credit: string;
  creditUrl: string;
  unsplashUrl: string;
}> {
  const key = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined;
  if (!key) throw new Error("VITE_UNSPLASH_ACCESS_KEY not set");

  const res = await fetch(
    `https://api.unsplash.com/photos/random?query=liquid+metal&orientation=portrait&client_id=${key}`
  );
  if (!res.ok) throw new Error(`Unsplash API ${res.status}`);

  const photo: UnsplashPhoto = await res.json();

  // Required by Unsplash API guidelines: trigger download event
  fetch(`${photo.links.download_location}&client_id=${key}`).catch(() => {});

  // Return the direct Unsplash URL (hotlinking — required by guidelines)
  // Add UTM params to attribution links as required
  const utmParams = "utm_source=codereel&utm_medium=referral";
  const creditUrl = `https://unsplash.com/@${photo.user.username}?${utmParams}`;
  const unsplashUrl = `https://unsplash.com/?${utmParams}`;

  return {
    imageUrl: `${photo.urls.regular}&${utmParams}`,
    credit: photo.user.name,
    creditUrl,
    unsplashUrl,
  };
}
