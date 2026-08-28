import { WIKI_API, USER_AGENT } from "./constants.ts";
import type { RawWikiPage } from "./types/raw.ts";
import { wikiItemUrl } from "./utils/ids.ts";

export interface ItemListEntry {
  title: string;
  name: string;
}

export interface FileInfo {
  url: string;
  sha1?: string;
  mime?: string;
  width?: number;
  height?: number;
}

const DEFAULT_DELAY_MS = 80;

/**
 * MediaWiki client for backpackbrawl.wiki.gg.
 *
 * HTML page fetches go through Cloudflare; the `api.php` parse/query/cargo
 * endpoints return structured JSON without a JS challenge, so they are the
 * source used here. Parsed HTML still comes from `action=parse&prop=text`,
 * which is the same HTML the Wiki article renders.
 */
export class WikiFetcher {
  private readonly delayMs: number;

  constructor(delayMs = DEFAULT_DELAY_MS) {
    this.delayMs = delayMs;
  }

  /**
   * List item pages from the Cargo `Item` table (one row per Wiki item page).
   */
  async listItems(): Promise<ItemListEntry[]> {
    const items: ItemListEntry[] = [];
    const pageSize = 500;
    let offset = 0;

    for (;;) {
      const data = await this.api({
        action: "cargoquery",
        tables: "Item",
        fields: "_pageName=title,name",
        limit: String(pageSize),
        offset: String(offset),
      });
      const rows = (data as { cargoquery?: Array<{ title: Record<string, string> }> })
        .cargoquery ?? [];
      if (rows.length === 0) break;
      for (const row of rows) {
        const title = row.title.title ?? row.title._pageName ?? "";
        const name = row.title.name || title;
        if (title) items.push({ title, name });
      }
      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    return items;
  }

  /**
   * Fetch wikitext + rendered HTML for one item page.
   */
  async fetchPage(title: string): Promise<RawWikiPage> {
    const data = await this.api({
      action: "parse",
      page: title,
      prop: "wikitext|text|images|displaytitle",
      disablelimitreport: "1",
    });

    const parse = (data as {
      parse?: {
        title?: string;
        pageid?: number;
        wikitext?: { "*": string };
        text?: { "*": string };
        images?: string[];
      };
      error?: { code: string; info: string };
    }).parse;

    if (!parse) {
      const err = (data as { error?: { info: string } }).error?.info ?? "unknown parse error";
      throw new Error(`Wiki parse failed for "${title}": ${err}`);
    }

    const resolvedTitle = parse.title ?? title;
    return {
      title: resolvedTitle,
      pageId: parse.pageid,
      wikiUrl: wikiItemUrl(resolvedTitle),
      wikitext: parse.wikitext?.["*"] ?? "",
      html: parse.text?.["*"] ?? "",
      images: parse.images ?? [],
      fetchedAt: new Date().toISOString(),
    };
  }

  async fetchFileInfo(fileTitle: string): Promise<FileInfo | null> {
    const title = fileTitle.startsWith("File:") ? fileTitle : `File:${fileTitle}`;
    const data = await this.api({
      action: "query",
      titles: title,
      prop: "imageinfo",
      iiprop: "url|sha1|mime|size",
    });
    const pages = (data as {
      query?: { pages?: Record<string, { imageinfo?: Array<Record<string, string | number>> }> };
    }).query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    const info = page?.imageinfo?.[0];
    if (!info || typeof info.url !== "string") return null;
    return {
      url: info.url.split("?")[0] ?? info.url,
      sha1: typeof info.sha1 === "string" ? info.sha1 : undefined,
      mime: typeof info.mime === "string" ? info.mime : undefined,
      width: typeof info.width === "number" ? info.width : undefined,
      height: typeof info.height === "number" ? info.height : undefined,
    };
  }

  async fetchBuffer(url: string): Promise<Buffer> {
    await this.wait();
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "image/*,*/*" },
    });
    if (!response.ok) {
      throw new Error(`Image download failed ${response.status} ${url}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async api(params: Record<string, string>): Promise<unknown> {
    await this.wait();
    const search = new URLSearchParams({ ...params, format: "json" });
    const url = `${WIKI_API}?${search.toString()}`;
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Wiki API ${response.status} for ${params.action}`);
    }
    return response.json();
  }

  private async wait(): Promise<void> {
    if (this.delayMs <= 0) return;
    await new Promise((r) => setTimeout(r, this.delayMs));
  }
}
