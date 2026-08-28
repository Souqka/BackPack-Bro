# Optimizer

Этап 6: кандидаты и SearchState. Этап 7: двухслойный Beam Search.

```text
Bags → availableCells → Items → Star → Scoring
```

Пустой слой Bags не считается игровым layout. Item стоит только на клетках Bags. Bag и Item — разные слои, collision только внутри слоя.

```bash
npm run test:optimizer
```

`runOptimizer({ backpack, bags, items, catalog, options })` возвращает лучший найденный layout, unplaced items и статистику поиска.

