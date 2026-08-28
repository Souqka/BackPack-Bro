import type { Diagnostic } from "../types/raw.ts";

export interface LoggerSummary {
  parsed: number;
  successful: number;
  warnings: number;
  errors: number;
}

/**
 * Collects parser diagnostics and prints `[INFO]` / `[WARN]` / `[ERROR]` lines.
 */
export class Logger {
  readonly diagnostics: Diagnostic[] = [];
  parsed = 0;
  successful = 0;

  info(message: string, itemName?: string): void {
    console.log(`[INFO] ${message}`);
    this.diagnostics.push({ level: "info", code: "info", message, itemName });
  }

  warn(code: string, message: string, itemName?: string, detail?: unknown): void {
    console.warn(`[WARN] ${message}`);
    this.diagnostics.push({ level: "warning", code, message, itemName, detail });
  }

  error(code: string, message: string, itemName?: string, detail?: unknown): void {
    console.error(`[ERROR] ${message}`);
    this.diagnostics.push({ level: "error", code, message, itemName, detail });
  }

  itemDiagnostics(itemName: string): Diagnostic[] {
    return this.diagnostics.filter((d) => d.itemName === itemName);
  }

  summary(): LoggerSummary {
    return {
      parsed: this.parsed,
      successful: this.successful,
      warnings: this.diagnostics.filter((d) => d.level === "warning").length,
      errors: this.diagnostics.filter((d) => d.level === "error").length,
    };
  }

  printSummary(): void {
    const s = this.summary();
    console.log("");
    console.log(`Parsed: ${s.parsed}`);
    console.log(`Successful: ${s.successful}`);
    console.log(`Warnings: ${s.warnings}`);
    console.log(`Errors: ${s.errors}`);
  }
}
