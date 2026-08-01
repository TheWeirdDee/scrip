import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://scrip-three.vercel.app';
  return ['', '/app', '/docs'].map((path) => ({ url: `${baseUrl}${path}`, changeFrequency: 'weekly' }));
}
