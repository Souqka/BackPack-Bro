import { OptimizerPanel } from "@/components/optimizer/optimizer-panel";
import { loadCatalogView } from "@/lib/ui/catalog-view.ts";

export default function Page() {
  const catalog = loadCatalogView();
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Backpack Brawl</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Optimizer</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Choose bags and items from the production catalog, then run the production optimizer. The
          grid shows the returned layout — it does not place or score items itself.
        </p>
      </header>
      <OptimizerPanel catalog={catalog} />
    </div>
  );
}
