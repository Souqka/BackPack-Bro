/**
 * Stable item IDs are derived from Wiki page/item names.
 * Never invent an ID that does not correspond to a Wiki name.
 */

export function slugifyItemName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function normalizeTypeSlug(typeName: string): string {
  return slugifyItemName(typeName);
}

export function normalizeRarity(raw: string): string {
  return raw.trim().toLowerCase();
}

export function wikiItemUrl(title: string): string {
  const encoded = title.replace(/ /g, "_");
  return `https://backpackbrawl.wiki.gg/wiki/${encoded}`;
}
