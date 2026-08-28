/**
 * Публичный API Candidate Generator и SearchState.
 *
 * Не экспортирует подпись geometry и расчёт bounding box.
 */

export type {
  CandidateInvalidReason,
  CandidateValidationResult,
  ItemToPlace,
  OccupiedCell,
  PlacementCandidate,
  SearchState,
  SearchStateIssue,
  SearchStateResult,
} from "./types.ts";

export { getUniqueRotations } from "./rotations.ts";
export { createSearchState, addCandidate, removePlacement } from "./state.ts";
export { canPlaceCandidate } from "./constraints.ts";
export { generatePlacementCandidates } from "./candidates.ts";
export { getStateSignature, getCandidateSignature } from "./deduplication.ts";
