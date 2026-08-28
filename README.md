# Backpack Brawl Optimizer

Этап 3: полный каталог Wiki, валидация и production JSON.

Источник игровых значений — только [backpackbrawl.wiki.gg](https://backpackbrawl.wiki.gg/). Неизвестные формулировки сохраняются как `{ "type": "raw", "raw": "…" }`.

## Запуск

```bash
npm install
npm test

# три тестовых предмета
npm run parse:items -- --item "Adamantite Bar" --item "Adamantite Ore" --item "Starbloom"

# полный каталог
npm run parse:items -- --quiet

# продолжить, используя уже сохранённый raw HTML
npm run parse:items -- --resume --quiet
```

Результат:

```text
data/normalized/items.json          — source of truth
data/normalized/catalog-meta.json
data/normalized/indexes/by-id.json
data/normalized/indexes/by-type.json
data/normalized/indexes/by-rarity.json
data/normalized/indexes/by-hero.json
data/normalized/indexes/used-in-recipes.json
data/reports/catalog-report.json
data/reports/catalog-report.md
data/raw/items/{id}.json
assets/items/{id}/icon.webp
assets/items/{id}/full.webp
```

`usedIn` не дублируется в Item: индекс `used-in-recipes.json` строится из `item.recipes`.

## Геометрия

Канонические координаты после crop: `minRow === 0`, `minCol === 0`.

`rotateGeometry(geometry, 0 | 90 | 180 | 270)` вращает `cells` и `stars` вместе и снова обрезает к началу координат.

## Placement Engine (этап 4)

`src/lib/inventory/` размещает `PlacedItem` в рюкзаке произвольного размера, считает глобальную геометрию, коллизии Item-клеток и активацию Star.

```bash
npm run test:inventory
```

Star не занимает клетку и не создаёт collision. `analyzeInventory` не запускает optimizer.


## Модель эффектов

Вероятность — обёртка `ChancedEffect.chance`. Star — часть geometry, не отдельный Item.

Если формулировка Wiki не распознана надёжно, остаётся `raw`.
