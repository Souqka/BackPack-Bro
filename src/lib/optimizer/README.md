# Candidate Generator

Этап 6: валидные позиции и уникальные повороты. Поиск лучшей расстановки не входит в этот слой.

```text
ItemToPlace + SearchState
  → unique rotations (cells + stars)
  → позиции (bounding box Item-клеток)
  → O(клетки кандидата) collision
  → PlacementCandidate[]
```

Scoring и `analyzeInventory` на каждый кандидат не вызываются.

## SearchState

Инкрементально: `addCandidate` / `removePlacement` обновляют `occupiedCells` и `itemGeometries` без полного анализа рюкзака.

Невалидное начальное состояние (`createSearchState`) возвращает `ok: false` и список issues — молча не принимается.

## Тесты

```bash
npm test
npm run test:optimizer
```
