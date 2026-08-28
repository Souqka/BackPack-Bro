# Backpack Brawl Optimizer

Stage 1: a Wiki item parser that turns [backpackbrawl.wiki.gg](https://backpackbrawl.wiki.gg/) pages into normalized JSON.

Game data is taken from the Wiki. Missing fields stay `null` / `[]`. The parser does not invent stats, effects, or item IDs.

## Run

```bash
npm install

# three test items (images downloaded locally as WebP)
npm run parse:items -- --item "Adamantite Bar" --item "Adamantite Ore" --item "Starbloom"

# first N Cargo items
npm run parse:items -- --limit 5

# full catalog
npm run parse:items
```

Output:

- `data/normalized/items.json` — app-facing catalog
- `data/raw/items/{id}.json` — wikitext, template params, diagnostics
- `assets/items/{id}/icon.webp` and `full.webp`

```bash
npm test
npm run typecheck
```

## Geometry

`geometry.cells` and `geometry.stars` use local `[row, col]` after empty padding is cropped. Stars are not item cells. Width/height and rotations are not stored; rotate both arrays together at runtime later.

Wiki tile tables are classified by image `alt` (`Empty Tile`, `Item Tile`, `Star`), not by pixels.

## Test items

These Wiki pages exist and are the fixture set:

| Wiki page        | Why |
| ---------------- | --- |
| Adamantite Bar   | 2×1 cells, stars on both ends, two craft recipes, 15 levels |
| Adamantite Ore   | combat stats, on-hit ability, weapon level-up table, no stars |
| Starbloom        | Dawn + Star abilities, non-rectangular star layout |

No names were substituted.
