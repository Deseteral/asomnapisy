export function generateSessionId(mediaTitle: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `asomnapisy-${timestamp}-${slugify(mediaTitle)}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
