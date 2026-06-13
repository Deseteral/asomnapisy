import { slugify } from "../utils";

export function generateSessionId(mediaTitle: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `asomnapisy-${timestamp}-${slugify(mediaTitle)}`;
}
