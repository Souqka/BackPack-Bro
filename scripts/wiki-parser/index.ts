import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseItems } from "./parser.ts";
import { Logger } from "./utils/logger.ts";

export interface CliArgs {
  items: string[];
  limit?: number;
  skipImages: boolean;
  outputDir: string;
  quiet: boolean;
}

/**
 * Точка входа `npm run parse:items`.
 *
 *   npm run parse:items
 *   npm run parse:items -- --item "Adamantite Bar"
 *   npm run parse:items -- --limit 5
 */
export function parseArgs(argv: string[]): CliArgs {
  const items: string[] = [];
  let limit: number | undefined;
  let skipImages = false;
  let outputDir = process.cwd();
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--item" && next) {
      items.push(next);
      i += 1;
      continue;
    }
    if (arg === "--limit" && next) {
      limit = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--skip-images") {
      skipImages = true;
      continue;
    }
    if (arg === "--quiet") {
      quiet = true;
      continue;
    }
    if ((arg === "--out" || arg === "--output-dir") && next) {
      outputDir = path.resolve(next);
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return { items, limit, skipImages, outputDir, quiet };
}

function printHelp(): void {
  console.log(`Парсер предметов Wiki

Использование:
  npm run parse:items
  npm run parse:items -- --item "Adamantite Bar"
  npm run parse:items -- --item "Adamantite Bar" --item "Starbloom"
  npm run parse:items -- --limit 5
  npm run parse:items -- --skip-images --quiet

Параметры:
  --item <name>       Разобрать указанную страницу Wiki (можно повторять)
  --limit <n>         Не больше n предметов
  --skip-images       Не скачивать портреты
  --quiet             Печатать только предупреждения, ошибки и итог
  --out <dir>         Корень вывода (по умолчанию cwd)
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logger = new Logger();
  logger.quiet = args.quiet;

  if (args.limit !== undefined && (!Number.isFinite(args.limit) || args.limit < 0)) {
    logger.error("cli", `Некорректный --limit: ${args.limit}`);
    process.exitCode = 1;
    return;
  }

  await parseItems(
    {
      outputDir: args.outputDir,
      itemTitles: args.items.length > 0 ? args.items : undefined,
      limit: args.limit,
      skipImages: args.skipImages,
    },
    logger,
  );

  logger.printSummary();
  if (logger.summary().errors > 0) {
    process.exitCode = 1;
  }
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  main().catch((err: unknown) => {
    console.error("[ERROR]", err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
  });
}
