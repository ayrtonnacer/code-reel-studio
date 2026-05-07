interface UnsplashPhoto {
  links: { download_location: string };
  urls: { regular: string };
  user: { name: string; links: { html: string } };
}

export async function fetchRandomLiquidMetalPhoto(): Promise<{
  dataUrl: string;
  credit: string;
  creditUrl: string;
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

  const imgRes = await fetch(photo.urls.regular);
  if (!imgRes.ok) throw new Error("Error al descargar la imagen");

  const blob = await imgRes.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        dataUrl: reader.result as string,
        credit: photo.user.name,
        creditUrl: photo.user.links.html,
      });
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
