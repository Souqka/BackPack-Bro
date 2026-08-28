/**
 * Результат целостности каталога после полного прогона.
 */

export interface ValidationIssue {
  itemId?: string;
  code: string;
  message: string;
}

export interface CatalogValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidateCatalogOptions {
  /** Корень репозитория / --out, чтобы проверить локальные изображения. */
  outputDir?: string;
  /** Известные id для ссылок рецептов (по умолчанию — id предметов каталога). */
  knownIds?: Set<string>;
}
