# Scoring Engine

Этап 5: статическая оценка расстановки. Боевая симуляция не входит в этот слой.

```text
InventoryState + Catalog
  → analyzeInventory (один раз)
  → PlacementFacts
  → Synergies + SynergyGraph
  → Structural Score + Effect Coverage
  → PlacementScore
```

Невалидная расстановка (коллизия или выход за границы) получает `INVALID_PLACEMENT_SCORE` (`-Infinity`) и никогда не побеждает валидную.

## Structural Score

Число достоверно активированных Star × `weights.activatedStar` (по умолчанию 1).
Величины Armor / Damage / Poison в очки не переводятся.

## Effect Coverage

Сколько эффектов активных Star система понимает: `normalized` / `raw` / `unsupported`.
Unknown не пропадает: он виден в coverage, synergies и breakdown, но не даёт выдуманных очков.

## Adjacency

В строгой модели Stage 2/3 нет механики `adjacent` (только геометрическая статистика расстояния Star в отчёте каталога). Рёбра graph из соседства клеток не строятся.

## Тесты

```bash
npm test
npm run test:scoring
```
