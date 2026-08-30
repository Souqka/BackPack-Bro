"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";
import type { OptimizedInstance } from "@/lib/optimizer/api/types.ts";

export function UnplacedItems({
  items,
  catalog,
}: {
  items: OptimizedInstance[];
  catalog: Map<string, CatalogItemView>;
}) {
  if (items.length === 0) return null;
  return (
    <Card data-testid="unplaced-items">
      <CardHeader>
        <CardTitle>Unplaced</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((entry) => {
            const item = catalog.get(entry.itemId);
            return (
              <li
                key={entry.instanceId}
                className="flex items-center gap-2 text-sm"
                data-instance-id={entry.instanceId}
              >
                {item?.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.icon} alt="" className="h-7 w-7 object-contain" />
                ) : null}
                <span>
                  {item?.name ?? entry.itemId}
                  <span className="sr-only"> instance {entry.instanceId}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
