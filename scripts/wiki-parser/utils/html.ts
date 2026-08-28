import type { CheerioAPI, Cheerio } from "cheerio";
import type { AnyNode, Element } from "domhandler";

/**
 * Visible text of a Wiki HTML fragment.
 *
 * Wiki status/icon images carry the actual word in `alt` or `title`
 * (e.g. `<img alt="Armor">`). Those must be inserted into the text or
 * "gain 24" would lose the status name.
 */
export function visibleText($: CheerioAPI, root: Cheerio<AnyNode> | string): string {
  const node = typeof root === "string" ? $(root) : root;
  const clone = node.clone();
  clone.find("img").each((_, img) => {
    const el = $(img);
    const label = (el.attr("alt") ?? el.attr("title") ?? "").trim();
    if (label && !/\.png$/i.test(label) && !/tile/i.test(label)) {
      el.replaceWith(` ${label} `);
    } else {
      el.remove();
    }
  });
  clone.find("br").replaceWith(" ");
  clone.find("script, style").remove();
  return collapseWhitespace(clone.text());
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

export function infoboxData($: CheerioAPI, field: string): string {
  const el = $(`.druid-data-${field}`).first();
  if (el.length === 0) return "";
  return visibleText($, el);
}

export function headingSection($: CheerioAPI, headingId: string): Cheerio<Element> {
  const heading = $(`#${headingId}`).closest("h2");
  if (heading.length === 0) {
    return $() as Cheerio<Element>;
  }
  const nodes: Element[] = [];
  let cursor = heading.get(0)?.nextSibling ?? null;
  while (cursor) {
    if (cursor.type === "tag") {
      const tag = (cursor as Element).tagName?.toLowerCase();
      if (tag === "h2") break;
      nodes.push(cursor as Element);
    }
    cursor = cursor.nextSibling;
  }
  return $(nodes) as Cheerio<Element>;
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
