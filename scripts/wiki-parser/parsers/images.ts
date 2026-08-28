import * as cheerio from "cheerio";
import type { ItemImages } from "../types/normalized.ts";
import type { Logger } from "../utils/logger.ts";
import { originalImageUrl } from "../utils/images.ts";
import { materializeItemImages } from "../utils/images.ts";
import type { WikiFetcher } from "../fetcher.ts";

export interface ImagesParseResult {
  images: ItemImages;
  sourceUrls: string[];
}

/**
 * Locate the infobox portrait, download the original file, convert to WebP.
 *
 * The Wiki typically has a single item PNG (`File:{Name}.png`) shown in
 * `.druid-main-image`. That original is saved as both `full.webp` (native
 * resolution) and `icon.webp` (resized). Frontend paths are local
 * `/assets/items/{id}/...` — never Wiki URLs. The original URL is returned
 * for `source.imageUrls`.
 */
export async function parseAndDownloadImages(options: {
  html: string;
  itemId: string;
  itemName: string;
  wikiImages: string[];
  outputDir: string;
  skipDownload: boolean;
  fetcher: WikiFetcher | null;
  logger: Logger;
}): Promise<ImagesParseResult> {
  const src = findInfoboxImageSrc(options.html, options.itemName, options.wikiImages);
  if (!src) {
    options.logger.warn("image_missing", "No item portrait found on Wiki page", options.itemName);
    return { images: { icon: null, full: null }, sourceUrls: [] };
  }

  const sourceUrl = originalImageUrl(src) ?? src;
  if (options.skipDownload || !options.fetcher) {
    return {
      images: { icon: null, full: null },
      sourceUrls: [sourceUrl],
    };
  }

  try {
    const fileName = fileNameFromUrl(sourceUrl) ?? `${options.itemName}.png`;
    const info = await options.fetcher.fetchFileInfo(fileName);
    const downloadUrl = info?.url ?? sourceUrl;
    const saved = await materializeItemImages({
      itemId: options.itemId,
      sourceUrl: downloadUrl,
      sha1: info?.sha1,
      outputDir: options.outputDir,
      fetchBuffer: (url) => options.fetcher!.fetchBuffer(url),
    });
    options.logger.info(
      saved.downloaded ? "Image: downloaded" : "Image: cached",
      options.itemName,
    );
    return {
      images: { icon: saved.icon, full: saved.full },
      sourceUrls: [downloadUrl],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    options.logger.warn("image_download_failed", `Image download failed: ${message}`, options.itemName);
    return { images: { icon: null, full: null }, sourceUrls: [sourceUrl] };
  }
}

export function findInfoboxImageSrc(
  html: string,
  itemName: string,
  wikiImages: string[],
): string | null {
  const $ = cheerio.load(html);
  const infobox = $(".druid-main-image img").first();
  if (infobox.length > 0) {
    return infobox.attr("src") ?? null;
  }

  const portrait = wikiImages.find((name) =>
    name.replace(/_/g, " ").toLowerCase().startsWith(itemName.toLowerCase()),
  );
  if (portrait) {
    return `/images/${portrait}`;
  }

  return null;
}

function fileNameFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url, "https://backpackbrawl.wiki.gg").pathname;
    const last = pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}
