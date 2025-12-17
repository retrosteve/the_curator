const carImageModules = import.meta.glob('./cars/*.{png,jpg,jpeg,webp,gif,svg}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const carImagesByTemplateId = new Map<string, string>();

const PLACEHOLDER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e5e7eb" />
      <stop offset="100%" stop-color="#d1d5db" />
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)" />
  <rect x="24" y="24" width="592" height="312" rx="18" fill="none" stroke="#9ca3af" stroke-width="4" stroke-dasharray="10 10" />
  <g fill="#6b7280">
    <path d="M220 220c10-26 30-40 60-40h80c30 0 50 14 60 40h18c10 0 18 8 18 18v18c0 10-8 18-18 18h-10c-6 14-20 24-36 24s-30-10-36-24H284c-6 14-20 24-36 24s-30-10-36-24h-10c-10 0-18-8-18-18v-18c0-10 8-18 18-18h18zm28 62a16 16 0 1 0 0-32 16 16 0 0 0 0 32zm144 0a16 16 0 1 0 0-32 16 16 0 0 0 0 32z"/>
  </g>
  <text x="320" y="150" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="28" fill="#374151">No Image</text>
  <text x="320" y="184" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="14" fill="#4b5563">(placeholder)</text>
</svg>`;

const PLACEHOLDER_CAR_IMAGE_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PLACEHOLDER_SVG)}`;

for (const [modulePath, url] of Object.entries(carImageModules)) {
  const filename = modulePath.split('/').pop();
  if (!filename) continue;

  const dotIndex = filename.lastIndexOf('.');
  const templateId = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
  if (!templateId) continue;

  carImagesByTemplateId.set(templateId, url);
}

export function getCarImageUrl(templateId: string): string | undefined {
  return carImagesByTemplateId.get(templateId);
}

export function getPlaceholderCarImageUrl(): string {
  return PLACEHOLDER_CAR_IMAGE_URL;
}

export function getCarImageUrlOrPlaceholder(templateId: string | undefined): string {
  if (!templateId) return PLACEHOLDER_CAR_IMAGE_URL;
  return carImagesByTemplateId.get(templateId) ?? PLACEHOLDER_CAR_IMAGE_URL;
}
