import { normalizeCharacterKey } from '@/utils/character-key';

const portraitModules = import.meta.glob('./characters/*.{png,jpg,jpeg,webp,avif,gif,svg}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const portraitsByKey = new Map<string, string>();

const PLACEHOLDER_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#1f2937"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect x="28" y="28" width="456" height="456" rx="18" fill="none" stroke="#374151" stroke-width="4" stroke-dasharray="10 10"/>
  <g fill="#9ca3af">
    <circle cx="256" cy="214" r="64"/>
    <path d="M128 416c18-72 76-112 128-112s110 40 128 112"/>
  </g>
  <text x="256" y="470" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="18" fill="#e5e7eb">No Portrait</text>
</svg>`;

const PLACEHOLDER_CHARACTER_PORTRAIT_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PLACEHOLDER_SVG)}`;

for (const [modulePath, url] of Object.entries(portraitModules)) {
  const filename = modulePath.split('/').pop();
  if (!filename) continue;

  const dotIndex = filename.lastIndexOf('.');
  const baseName = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
  if (!baseName) continue;

  portraitsByKey.set(normalizeCharacterKey(baseName), url);
}

export function getCharacterPortraitUrl(name: string): string | undefined {
  return portraitsByKey.get(normalizeCharacterKey(name));
}

export function getPlaceholderCharacterPortraitUrl(): string {
  return PLACEHOLDER_CHARACTER_PORTRAIT_URL;
}

export function getCharacterPortraitUrlOrPlaceholder(name: string | undefined): string {
  if (!name) return PLACEHOLDER_CHARACTER_PORTRAIT_URL;
  return portraitsByKey.get(normalizeCharacterKey(name)) ?? PLACEHOLDER_CHARACTER_PORTRAIT_URL;
}
