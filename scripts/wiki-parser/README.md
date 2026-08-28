# Wiki parser — Backpack Brawl Optimizer

Парсер предметов с [backpackbrawl.wiki.gg](https://backpackbrawl.wiki.gg/).

Источник игровых значений — только Wiki. Неизвестное остаётся `raw`.

## Команды

```bash
npm test
npm run parse:items -- --item "Adamantite Bar" --item "Adamantite Ore" --item "Starbloom"
npm run parse:items -- --limit 5 --skip-images --quiet
npm run analyze:corpus
```

## Геометрия

`geometry.cells` и `geometry.stars` — локальные `[row, col]` после обрезки пустых клеток. Star не занимает клетку Item. Повороты не хранятся.

## Эффекты (этап 2)

Строгие union-типы в `types/effects.ts`:

- `Effect` — gain / inflict / modify_stat / reduce / …
- `ChancedEffect` — `{ chance?, effect }`
- `Trigger` — on_hit, start_of_phase, on_star_activation, …
- `Condition` — тип occupant'а Star, наличие статуса у противника
- `Constraint` — лимит использований, quantity, counts_as
- `StarRule` — trigger + conditions + effects; Star не отдельный предмет

Если формулировка Wiki не распознана: `{ type: "raw", raw: "оригинальный текст" }`.
