"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CatalogItemView } from "@/lib/ui/catalog-types.ts";

export function CatalogPicker({
  items,
  onAdd,
  label,
  disabled,
}: {
  items: CatalogItemView[];
  onAdd: (itemId: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items.slice(0, 40);
    return items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle),
      )
      .slice(0, 40);
  }, [items, query]);

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Search ${label.toLowerCase()}…`}
        aria-label={`Search ${label}`}
        disabled={disabled}
      />
      <ScrollArea className="h-44 rounded-md border border-border">
        <ul className="p-1">
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAdd(item.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                aria-label={`Add ${item.name}`}
              >
                {item.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.icon} alt="" className="h-7 w-7 object-contain" />
                ) : (
                  <span className="h-7 w-7 rounded bg-muted" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="text-xs capitalize text-muted-foreground">{item.rarity}</span>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
