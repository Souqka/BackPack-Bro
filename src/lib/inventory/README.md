# Inventory Placement Engine

Этап 4: размещение предметов в рюкзаке, коллизии и Star-активация.

Каталог `data/normalized/items.json` не изменяется. Engine читает `Item` и работает с `PlacedItem`.

## Цепочка

```text
InventoryState + Catalog
    → resolvePlacedGeometry (rotateGeometry из Stage 3)
    → границы (только Item cells)
    → collision (только Item cell + Item cell)
    → Star overlap
    → Star activation
    → InventoryAnalysis
```

Star не занимает клетку, не создаёт collision и может быть за границей рюкзака.

## API

```ts
import {
  analyzeInventory,
  catalogFromItems,
  resolvePlacedGeometry,
} from "./src/lib/inventory/index.ts";
```

`valid === true`, если нет выхода за границы и нет коллизий. Неактивная Star — норма.

## Активация Star

- `star === null` или нет rules → `no_star_data`
- `star_occupant_type` / `on_star_occupant.itemTypes` / `effect.occupantTypes` → проверка `target.types` (ИЛИ внутри списка типов)
- `on_star_activation` без type-condition → универсальный overlap
- `on_star_occupant` без типов (имя предмета в Wiki) → `unsupported_condition`
- `raw` → `raw_condition`

## Тесты

```bash
npm test
npm run test:inventory
```
