import type {
  OptimizeInventoryInput,
  OptimizeInventoryResult,
  OptimizeInventorySuccess,
  ProductionQuality,
} from "../optimizer/api/types.ts";
import { MAX_LINE_QUANTITY, MAX_UI_RESULT_COUNT } from "./constants.ts";
import type { DisplayError } from "./error-messages.ts";
import { addLine, expandQuantities, setLineQuantity, type QuantityLine } from "./expand-quantities.ts";
import type { OptimizerExample } from "./examples.ts";

export type OptimizerStatus = "idle" | "optimizing" | "success" | "error";

export interface OptimizerUiState {
  bags: QuantityLine[];
  items: QuantityLine[];
  quality: ProductionQuality;
  resultCount: number;
  status: OptimizerStatus;
  result: OptimizeInventorySuccess | null;
  error: DisplayError | null;
  selectedSignature: string | null;
}

export const initialOptimizerState: OptimizerUiState = {
  bags: [],
  items: [],
  quality: "balanced",
  resultCount: 1,
  status: "idle",
  result: null,
  error: null,
  selectedSignature: null,
};

export type OptimizerUiAction =
  | { type: "SET_QUALITY"; quality: ProductionQuality }
  | { type: "SET_RESULT_COUNT"; resultCount: number }
  | { type: "ADD_BAG"; itemId: string }
  | { type: "ADD_ITEM"; itemId: string }
  | { type: "SET_BAG_QUANTITY"; itemId: string; quantity: number }
  | { type: "SET_ITEM_QUANTITY"; itemId: string; quantity: number }
  | { type: "LOAD_EXAMPLE"; example: OptimizerExample }
  | { type: "OPTIMIZE_STARTED" }
  | { type: "OPTIMIZE_FINISHED"; result: OptimizeInventoryResult }
  | { type: "OPTIMIZE_UNEXPECTED" }
  | { type: "SELECT_RESULT"; signature: string };

export function optimizerReducer(state: OptimizerUiState, action: OptimizerUiAction): OptimizerUiState {
  switch (action.type) {
    case "SET_QUALITY":
      return dirty({ ...state, quality: action.quality });
    case "SET_RESULT_COUNT":
      return dirty({
        ...state,
        resultCount: clampResultCount(action.resultCount),
      });
    case "ADD_BAG":
      return dirty({ ...state, bags: addLine(state.bags, action.itemId, MAX_LINE_QUANTITY) });
    case "ADD_ITEM":
      return dirty({ ...state, items: addLine(state.items, action.itemId, MAX_LINE_QUANTITY) });
    case "SET_BAG_QUANTITY":
      return dirty({
        ...state,
        bags: setLineQuantity(state.bags, action.itemId, Math.min(MAX_LINE_QUANTITY, action.quantity)),
      });
    case "SET_ITEM_QUANTITY":
      return dirty({
        ...state,
        items: setLineQuantity(state.items, action.itemId, Math.min(MAX_LINE_QUANTITY, action.quantity)),
      });
    case "LOAD_EXAMPLE":
      return dirty({
        ...state,
        bags: action.example.bags.map((line) => ({ ...line })),
        items: action.example.items.map((line) => ({ ...line })),
      });
    case "OPTIMIZE_STARTED":
      return { ...state, status: "optimizing", error: null };
    case "OPTIMIZE_FINISHED":
      if (!action.result.ok) {
        return { ...state, status: "error", error: action.result.error };
      }
      return {
        ...state,
        status: "success",
        result: action.result,
        error: null,
        selectedSignature: action.result.signature,
      };
    case "OPTIMIZE_UNEXPECTED":
      return {
        ...state,
        status: "error",
        error: { code: "UNEXPECTED", message: "Something went wrong while optimizing the backpack." },
      };
    case "SELECT_RESULT":
      if (!state.result) return state;
      if (!state.result.results.some((entry) => entry.signature === action.signature)) return state;
      return { ...state, selectedSignature: action.signature };
  }
}

export function toOptimizeInput(state: OptimizerUiState): OptimizeInventoryInput {
  return {
    bagItemIds: expandQuantities(state.bags),
    itemIds: expandQuantities(state.items),
    options: {
      quality: state.quality,
      resultCount: state.resultCount,
    },
  };
}

export function selectedLayout(state: OptimizerUiState) {
  if (!state.result) return null;
  const match = state.result.results.find((entry) => entry.signature === state.selectedSignature);
  return match ?? state.result.results[0] ?? null;
}

function dirty(state: OptimizerUiState): OptimizerUiState {
  return {
    ...state,
    status: state.status === "optimizing" ? state.status : "idle",
    result: null,
    error: null,
    selectedSignature: null,
  };
}

function clampResultCount(value: number): number {
  if (!Number.isInteger(value)) return 1;
  return Math.min(MAX_UI_RESULT_COUNT, Math.max(1, value));
}
