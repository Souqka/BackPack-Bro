import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  FULL_WEBP_QUALITY,
  ICON_WEBP_QUALITY,
  ICON_WEBP_WIDTH,
  WIKI_ORIGIN,
} from "../constants.ts";

export interface ImageCacheMeta {
  sourceUrl: string;
  sha1?: string;
}

/**
 * Turn a Wiki `<img src>` (often a thumbnail) into an absolute original URL.
 *
 * Examples:
 * - `/images/thumb/Adamantite_Bar.png/200px-Adamantite_Bar.png?d5d48a`
 *   → `https://backpackbrawl.wiki.gg/images/Adamantite_Bar.png`
 * - `/images/Adamantite_Bar.png?d5d48a`
 *   → `https://backpackbrawl.wiki.gg/images/Adamantite_Bar.png`
 */
export function originalImageUrl(src: string): string | null {
  if (!src) return null;
  const withoutQuery = src.split("?")[0] ?? src;
  let pathname = withoutQuery;

  if (pathname.startsWith("//")) {
    pathname = `https:${pathname}`;
  }

  try {
    const url = pathname.startsWith("http")
      ? new URL(pathname)
      : new URL(pathname, WIKI_ORIGIN);

    const parts = url.pathname.split("/").filter(Boolean);
    const thumbIndex = parts.indexOf("thumb");
    if (thumbIndex >= 0 && parts.length >= thumbIndex + 2) {
      const fileName = parts[thumbIndex + 1];
      const prefix = parts.slice(0, thumbIndex);
      url.pathname = "/" + [...prefix, fileName].join("/");
    }

    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function publicAssetPath(itemId: string, filename: string): string {
  return `/assets/items/${itemId}/${filename}`;
}

export function localAssetDir(outputDir: string, itemId: string): string {
  return path.join(outputDir, "assets", "items", itemId);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download an original Wiki image and write `full.webp` + `icon.webp`.
 * Skips the network download when local files exist and the recorded source
 * URL (and sha1, if known) have not changed.
 */
export async function materializeItemImages(options: {
  itemId: string;
  sourceUrl: string;
  sha1?: string;
  outputDir: string;
  fetchBuffer: (url: string) => Promise<Buffer>;
}): Promise<{ icon: string; full: string; downloaded: boolean }> {
  const dir = localAssetDir(options.outputDir, options.itemId);
  await mkdir(dir, { recursive: true });

  const metaPath = path.join(dir, "source.json");
  const fullPath = path.join(dir, "full.webp");
  const iconPath = path.join(dir, "icon.webp");

  const cached = await readCacheMeta(metaPath);
  const unchanged =
    cached !== null &&
    cached.sourceUrl === options.sourceUrl &&
    (!options.sha1 || !cached.sha1 || cached.sha1 === options.sha1) &&
    (await fileExists(fullPath)) &&
    (await fileExists(iconPath));

  if (unchanged) {
    return {
      icon: publicAssetPath(options.itemId, "icon.webp"),
      full: publicAssetPath(options.itemId, "full.webp"),
      downloaded: false,
    };
  }

  const buffer = await options.fetchBuffer(options.sourceUrl);
  const image = sharp(buffer, { failOn: "none" });

  await image
    .clone()
    .webp({ quality: FULL_WEBP_QUALITY })
    .toFile(fullPath);

  await image
    .clone()
    .resize({ width: ICON_WEBP_WIDTH, withoutEnlargement: true })
    .webp({ quality: ICON_WEBP_QUALITY })
    .toFile(iconPath);

  const meta: ImageCacheMeta = {
    sourceUrl: options.sourceUrl,
    sha1: options.sha1,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");

  return {
    icon: publicAssetPath(options.itemId, "icon.webp"),
    full: publicAssetPath(options.itemId, "full.webp"),
    downloaded: true,
  };
}

async function readCacheMeta(metaPath: string): Promise<ImageCacheMeta | null> {
  try {
    const raw = await readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw) as ImageCacheMeta;
    if (typeof parsed.sourceUrl === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}
