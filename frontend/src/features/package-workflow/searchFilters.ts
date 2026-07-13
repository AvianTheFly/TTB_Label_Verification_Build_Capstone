import type {
  AdvancedSearchFilters,
  AbvOperator
} from "./types";
import type {
  ApplicationPackageRecord,
  VisibleStatus
} from "./packageWorkflowUtils";

export function matchesApplicationSearch(
  record: ApplicationPackageRecord,
  searchTerm: string,
  statusFilters: Record<VisibleStatus, boolean>,
  advancedFilters: AdvancedSearchFilters
): boolean {
  if (!statusFilters[record.status]) {
    return false;
  }

  if (!matchesAdvancedApplicationFilters(record, advancedFilters)) {
    return false;
  }

  const normalizedSearch = normalizeSearchTerm(searchTerm);
  if (!normalizedSearch) {
    return true;
  }

  return [
    record.package_id,
    record.json_filename,
    record.image_filename,
    record.status,
    record.item_error ?? "",
    ...Object.values(record.application_data),
    ...Object.values(record.reviewed_extracted_data ?? {})
  ].some((value) => normalizeSearchTerm(value ?? "").includes(normalizedSearch));
}

export function normalizeSearchTerm(value: string): string {
  return value.trim().toLowerCase();
}

export function allStatusFilters(): Record<VisibleStatus, boolean> {
  return {
    "Pending Check": true,
    Passed: true,
    Fail: true
  };
}

export function matchesAdvancedApplicationFilters(
  record: ApplicationPackageRecord,
  filters: AdvancedSearchFilters
): boolean {
  const data = record.application_data;
  if (!textIncludes(data.brand_name, filters.brandName)) {
    return false;
  }
  if (!textIncludes(data.class_type, filters.classType)) {
    return false;
  }
  if (!textIncludes(data.net_contents, filters.netContents)) {
    return false;
  }
  if (!textIncludes(data.producer, filters.producer)) {
    return false;
  }
  if (!textIncludes(data.country_of_origin, filters.countryOfOrigin)) {
    return false;
  }
  if (!textIncludes(data.government_warning, filters.governmentWarning)) {
    return false;
  }
  return matchesAbvFilter(data.abv, filters.abvOperator, filters.abvValue);
}

function textIncludes(value: string, filter: string): boolean {
  const normalizedFilter = normalizeSearchTerm(filter);
  return !normalizedFilter || normalizeSearchTerm(value).includes(normalizedFilter);
}

function matchesAbvFilter(value: string, operator: AbvOperator, filterValue: string): boolean {
  if (operator === "any" || !filterValue.trim()) {
    return true;
  }

  const recordAbv = parseAbv(value);
  const targetAbv = parseAbv(filterValue);
  if (recordAbv === null || targetAbv === null) {
    return false;
  }

  if (operator === "lt") {
    return recordAbv < targetAbv;
  }
  if (operator === "gt") {
    return recordAbv > targetAbv;
  }
  return Math.abs(recordAbv - targetAbv) < 0.001;
}

function parseAbv(value: string): number | null {
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}
