/**
 * Каноническая подпись layout: Bags и Items независимо от порядка обхода.
 * Нужна для Top-N: одинаковая геометрия + конфигурация не должна
 * попадать в результат дважды только из-за другого порядка поиска.
 */

import { getBagStateSignature } from "./bags/index.ts";
import { getStateSignature } from "./deduplication.ts";
import type { OptimizerState } from "./search-types.ts";

export function getOptimizerStateSignature(state: OptimizerState): string {
  return `${getBagStateSignature(state.bags)}\n#\n${getStateSignature(state.items)}`;
}
