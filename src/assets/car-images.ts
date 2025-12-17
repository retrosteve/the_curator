const carImageModules = import.meta.glob('./cars/*.{png,jpg,jpeg,webp,gif,svg}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const carImagesByTemplateId = new Map<string, string>();

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
