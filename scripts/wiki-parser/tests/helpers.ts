import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseItemTemplate } from "../utils/wikitext.ts";
import type { RawWikiPage } from "../types/raw.ts";

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(dir, "fixtures");

export function loadFixture(id: "adamantite_bar" | "adamantite_ore" | "starbloom"): {
  html: string;
  wikitext: string;
  page: RawWikiPage;
} {
  const html = readFileSync(path.join(fixturesDir, `${id}.html`), "utf8");
  const wikitext = readFileSync(path.join(fixturesDir, `${id}.wiki`), "utf8");
  const title = {
    adamantite_bar: "Adamantite Bar",
    adamantite_ore: "Adamantite Ore",
    starbloom: "Starbloom",
  }[id];
  return {
    html,
    wikitext,
    page: {
      title,
      wikiUrl: `https://backpackbrawl.wiki.gg/wiki/${title.replace(/ /g, "_")}`,
      wikitext,
      html,
      images: [],
      fetchedAt: "2026-08-28T00:00:00.000Z",
    },
  };
}

export function paramsOf(id: "adamantite_bar" | "adamantite_ore" | "starbloom") {
  return parseItemTemplate(loadFixture(id).wikitext);
}
