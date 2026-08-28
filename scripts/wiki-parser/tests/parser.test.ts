import { describe, expect, it } from "vitest";
import { parseArgs } from "../index.ts";
import { buildUsedInIndex, parseOneItem } from "../parser.ts";
import { slugifyItemName } from "../utils/ids.ts";
import { Logger } from "../utils/logger.ts";
import { parseItemTemplate } from "../utils/wikitext.ts";
import { validateCatalog } from "../validate.ts";
import { loadFixture } from "./helpers.ts";

describe("wikitext template parser", () => {
  it("keeps nested Icon templates inside parameter values", () => {
    const params = parseItemTemplate(loadFixture("adamantite_bar").wikitext);
    expect(params.name).toBe("Adamantite Bar");
    expect(params.ability1Trigger).toContain("{{Icon");
    expect(params.r2c2).toBe("s");
    expect(params.r2c3).toBe("i");
  });
});

describe("ids", () => {
  it("slugifies Wiki names without inventing extra tokens", () => {
    expect(slugifyItemName("Adamantite Bar")).toBe("adamantite_bar");
    expect(slugifyItemName("Nor'easter Hat")).toBe("noreaster_hat");
  });
});

describe("parseOneItem fixtures", () => {
  async function parse(id: "adamantite_bar" | "adamantite_ore" | "starbloom") {
    const logger = new Logger();
    return parseOneItem(loadFixture(id).page, {
      logger,
      knownNames: new Map(),
      outputDir: "/tmp",
      skipImages: true,
      fetcher: null,
    });
  }

  it("produces a valid Adamantite Bar item", async () => {
    const { item } = await parse("adamantite_bar");
    expect(item.id).toBe("adamantite_bar");
    expect(item.rarity).toBe("epic");
    expect(item.types).toEqual(["part", "accessory"]);
    expect(item.geometry.cells).toHaveLength(2);
    expect(item.geometry.stars).toHaveLength(2);
    expect(item.recipes).toHaveLength(2);
    expect(item.upgrade?.maxLevel).toBe(15);
    expect(item.stats).toBeNull();
    const logger = new Logger();
    const issues = validateCatalog([item], logger);
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("detects duplicate ids and names", async () => {
    const { item } = await parse("adamantite_bar");
    const logger = new Logger();
    const issues = validateCatalog([item, { ...item }], logger);
    expect(issues.some((i) => i.message.includes("Дублирующийся id"))).toBe(true);
    expect(issues.some((i) => i.message.includes("Дублирующееся имя"))).toBe(true);
  });
});

describe("usedIn index", () => {
  it("строит производный индекс только из recipes целевого предмета", async () => {
    const logger = new Logger();
    const bar = await parseOneItem(loadFixture("adamantite_bar").page, {
      logger,
      knownNames: new Map(),
      outputDir: "/tmp",
      skipImages: true,
      fetcher: null,
    });
    const index = buildUsedInIndex([bar.item]);
    expect(index.steel_bar).toEqual(["adamantite_bar"]);
    expect(index.adamantite_ore).toEqual(["adamantite_bar"]);
    expect(bar.item).not.toHaveProperty("usedInRecipes");
  });
});

describe("CLI args", () => {
  it("parses --item, --limit, and --skip-images", () => {
    const args = parseArgs(["--item", "Adamantite Bar", "--limit", "5", "--skip-images"]);
    expect(args.items).toEqual(["Adamantite Bar"]);
    expect(args.limit).toBe(5);
    expect(args.skipImages).toBe(true);
    expect(args.quiet).toBe(false);
  });
});
