import type { TemplateParams } from "../types/raw.ts";

/**
 * Parse the top-level `{{Item | key=value | ... }}` template from a page.
 *
 * Wiki pages for items are almost entirely this one template. Nested templates
 * such as `{{Icon|Status|Armor}}` must stay inside values and not be treated
 * as extra parameters. The function therefore tracks `{{` / `}}` depth and
 * only splits on `|` at depth 1.
 *
 * @param wikitext - Full page wikitext from the MediaWiki API.
 * @returns Parameter map (empty object if no Item template is found).
 */
export function parseItemTemplate(wikitext: string): TemplateParams {
  const start = findTemplateStart(wikitext, "Item");
  if (start < 0) return {};

  const bodyStart = wikitext.indexOf("{", start) + 2; // skip {{
  const end = findMatchingBraces(wikitext, start);
  if (end < 0) return {};

  const inner = wikitext.slice(bodyStart, end);
  const parts = splitTopLevel(inner, "|");
  const params: TemplateParams = {};

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || /^Item$/i.test(trimmed)) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) params[key] = value;
  }

  return params;
}

function findTemplateStart(wikitext: string, name: string): number {
  const re = new RegExp(`\\{\\{\\s*${name}\\b`, "i");
  const match = re.exec(wikitext);
  return match ? match.index : -1;
}

function findMatchingBraces(text: string, start: number): number {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === "{{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (pair === "}}") {
      depth -= 1;
      if (depth === 0) return i;
      i += 1;
    }
  }
  return -1;
}

/**
 * Split `text` on `sep` that are not inside `{{...}}` or `[[...]]`.
 */
export function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let braceDepth = 0;
  let linkDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const pair = text.slice(i, i + 2);
    if (pair === "{{") {
      braceDepth += 1;
      buf += pair;
      i += 1;
      continue;
    }
    if (pair === "}}") {
      braceDepth = Math.max(0, braceDepth - 1);
      buf += pair;
      i += 1;
      continue;
    }
    if (pair === "[[") {
      linkDepth += 1;
      buf += pair;
      i += 1;
      continue;
    }
    if (pair === "]]") {
      linkDepth = Math.max(0, linkDepth - 1);
      buf += pair;
      i += 1;
      continue;
    }
    if (text[i] === sep && braceDepth === 0 && linkDepth === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += text[i];
  }
  parts.push(buf);
  return parts;
}

/**
 * Flatten Wiki markup used inside Item template values into readable text.
 * `{{Icon|Status|Armor}}` becomes `Armor`; `[[Foo]]` becomes `Foo`.
 */
export function flattenWikitext(value: string): string {
  let text = value;
  text = text.replace(/\{\{\s*Icon\s*\|[^}|]+\|([^}|]+)(?:\|[^}]*)?\}\}/gi, "$1");
  text = text.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");
  text = text.replace(/'{2,}/g, "");
  text = text.replace(/<br\s*\/?>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

export function param(params: TemplateParams, key: string): string {
  return params[key]?.trim() ?? "";
}

export function numberedParams(params: TemplateParams, prefix: string, max = 20): string[] {
  const values: string[] = [];
  for (let i = 1; i <= max; i++) {
    const value = param(params, `${prefix}${i}`);
    if (value) values.push(value);
  }
  return values;
}
