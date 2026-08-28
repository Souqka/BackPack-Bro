import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseItems } from "./parser.ts";
import { Logger } from "./utils/logger.ts";

export interface CliArgs {
  items: string[];
  limit?: number;
  skipImages: boolean;
  outputDir: string;
}

/**
 * CLI entry for `npm run parse:items`.
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

  return { items, limit, skipImages, outputDir };
}

function printHelp(): void {
  console.log(`Wiki item parser

Usage:
  npm run parse:items
  npm run parse:items -- --item "Adamantite Bar"
  npm run parse:items -- --item "Adamantite Bar" --item "Starbloom"
  npm run parse:items -- --limit 5
  npm run parse:items -- --skip-images --limit 10

Options:
  --item <name>       Parse a specific Wiki page (repeatable)
  --limit <n>         Parse at most n items
  --skip-images       Do not download / convert portraits
  --out <dir>         Output root (default: cwd)
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logger = new Logger();

  if (args.limit !== undefined && (!Number.isFinite(args.limit) || args.limit < 0)) {
    logger.error("cli", `Invalid --limit: ${args.limit}`);
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
