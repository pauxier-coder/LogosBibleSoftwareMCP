import { gunzipSync } from "zlib";
import { stripXml } from "./strip-markup.js";

/**
 * Decode Logos blob fields used in Clippings.db.
 * Prefix 0x01 = gzip payload after 5-byte header.
 * Prefix 0x02 = raw UTF-8 payload after 4-byte header.
 */
export function decodeClippingBlob(blob: Buffer | null): string | null {
  if (!blob || blob.length === 0) return null;

  const prefix = blob[0];
  try {
    if (prefix === 0x01) {
      return gunzipSync(blob.subarray(5)).toString("utf-8");
    }
    if (prefix === 0x02) {
      return blob.subarray(4).toString("utf-8");
    }
  } catch {
    return null;
  }

  // Unknown format: best-effort UTF-8 decode.
  return blob.toString("utf-8");
}

/**
 * Extract readable text from Logos XAML-style rich text.
 * Preserves spacing by concatenating all Run Text attributes in order.
 */
export function extractClippingText(xml: string | null): string | null {
  if (!xml) return null;

  if (!xml.includes("<Run ")) {
    return stripXml(xml);
  }

  const paragraphs = xml.split(/<\/Paragraph>\s*<Paragraph[^>]*>/i);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const pieces: string[] = [];
    const regex = /Text=["']([^"']*)["']/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(para)) !== null) {
      pieces.push(match[1]);
    }

    const line = pieces.join("").trim();
    if (line.length > 0) {
      lines.push(line);
    }
  }

  if (lines.length > 0) {
    return lines.join("\n");
  }

  return stripXml(xml);
}
