# Wiki parser — Backpack Brawl Optimizer

Парсер предметов с [backpackbrawl.wiki.gg](https://backpackbrawl.wiki.gg/).

Источник игровых значений — только Wiki. Неизвестное остаётся `raw`.

## Команды

```bash
npm test
npm run parse:items
npm run parse:items -- --item "Adamantite Bar" --item "Adamantite Ore" --item "Starbloom"
npm run parse:items -- --resume --quiet
npm run analyze:corpus
```

Полный прогон обрабатывает весь Cargo-список, не останавливается на ошибке одной страницы, пишет каталог, индексы, отчёт и raw.

## Выход

- `data/normalized/items.json` — единственный source of truth предметов
- `data/normalized/catalog-meta.json` — schemaVersion / parserVersion / itemCount
- `data/normalized/indexes/` — только item ID
- `data/reports/catalog-report.md` — качество базы
- `data/raw/items/` — диагностика

## Геометрия

`geometry.cells` и `geometry.stars` — локальные `[row, col]` после обрезки. Star не занимает клетку Item.

`rotateGeometry` в `utils/geometry.ts` — поворот 0/90/180/270 с повторным crop.

## Валидация

`validateCatalog(items)` проверяет id, имена, geometry, stars, рецепты, ссылки, уровни, source URL. Изображения проверяются отдельно: битые локальные пути обнуляются.
