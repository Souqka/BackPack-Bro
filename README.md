# Backpack Brawl Optimizer

Этап 2: строгая модель игровых эффектов по данным [backpackbrawl.wiki.gg](https://backpackbrawl.wiki.gg/).

Игровые значения берутся только из официальной Wiki. Неизвестные формулировки сохраняются как `{ "type": "raw", "raw": "…" }` — parser ничего не выдумывает.

## Запуск

```bash
npm install
npm test

# три тестовых предмета
npm run parse:items -- --item "Adamantite Bar" --item "Adamantite Ore" --item "Starbloom"

# быстрая проверка
npm run parse:items -- --limit 5 --skip-images

# полный каталог без портретов
npm run parse:items -- --skip-images --quiet
```

Результат:

- `data/normalized/items.json` — каталог + производный индекс `usedIn`
- `data/raw/items/{id}.json` — wikitext, диагностика
- `assets/items/{id}/icon.webp` и `full.webp`
- `data/analysis/wikitext-corpus.json` — частоты паттернов Wiki

Покрытие по wikitext-корпусу (912 предметов):

| Сущность | Нормализовано | Всего | Доля |
| --- | --- | --- | --- |
| Triggers | 1567 | 1690 | 93% |
| Effects | 1858 | 2534 | 73% |
| Constraints | 75 | 75 | 100% |

Нераспознанное остаётся `{ "type": "raw" }`. Полный HTML-обход Wiki.gg может отвечать HTTP 429 — для проектирования модели достаточно wikitext.

## Модель Stage 2

Вероятность — обёртка `ChancedEffect.chance`, а не отдельный тип эффекта.

`Gain 20 Armor` и `20% chance to gain 24 Armor` используют один `GainEffect`.

Star — часть geometry предмета, не отдельный Item в инвентаре. Правило Star: occupant на клетке Star → condition → trigger → effects.

Рецепты `item.recipes` — только крафт этого предмета. Кто использует предмет как ингредиент, считается из каталога в `usedIn`.

## Тестовые предметы

| Страница Wiki | Зачем |
| --- | --- |
| Adamantite Bar | Star `on_star_activation`, Gain Armor с шансом, два рецепта |
| Adamantite Ore | On hit, constraint `max_uses_per_battle`, статы, level-up |
| Starbloom | `start_of_phase` Dawn vs Star activation |

Подмен не было.
