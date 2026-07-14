import { useMemo, useState } from "react";

import { VISIBLE_STATUSES } from "./constants";
import {
  ApplicationPackageRecord,
  VisibleStatus,
  statusSortRank
} from "./packageWorkflowUtils";
import { summarizeApplications } from "./recordStatus";
import {
  allStatusFilters,
  matchesApplicationSearch
} from "./searchFilters";
import type { AdvancedSearchFilters } from "./types";

export function usePackageFilters(records: ApplicationPackageRecord[]) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
  const [statusFilters, setStatusFilters] = useState<Record<VisibleStatus, boolean>>({
    "Pending Check": true,
    Approved: true,
    "Needs Review": true
  });
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedSearchFilters>({
    abvOperator: "any",
    abvValue: "",
    brandName: "",
    classType: "",
    countryOfOrigin: "",
    governmentWarning: "",
    netContents: "",
    producer: ""
  });

  const searchMatchedRecords = useMemo(
    () => records.filter((record) => matchesApplicationSearch(record, searchTerm, allStatusFilters(), advancedFilters)),
    [records, searchTerm, advancedFilters]
  );
  const filteredRecords = useMemo(
    () => searchMatchedRecords.filter((record) => statusFilters[record.status]),
    [searchMatchedRecords, statusFilters]
  );
  const applicationSummary = useMemo(
    () => summarizeApplications(searchMatchedRecords),
    [searchMatchedRecords]
  );
  const sortedRecords = useMemo(
    () =>
      filteredRecords
        .slice()
        .sort(
          (left, right) =>
            statusSortRank(left.status) - statusSortRank(right.status) ||
            left.package_id.localeCompare(right.package_id)
        ),
    [filteredRecords]
  );

  function toggleStatusFilter(status: VisibleStatus | "total") {
    setStatusFilters((current) => {
      if (status === "total") {
        const allActive = VISIBLE_STATUSES.every((candidate) => current[candidate]);
        return {
          "Pending Check": !allActive,
          Approved: !allActive,
          "Needs Review": !allActive
        };
      }

      if (VISIBLE_STATUSES.every((candidate) => current[candidate])) {
        return {
          "Pending Check": status === "Pending Check",
          Approved: status === "Approved",
          "Needs Review": status === "Needs Review"
        };
      }

      return {
        ...current,
        [status]: !current[status]
      };
    });
  }

  function updateAdvancedFilter<Key extends keyof AdvancedSearchFilters>(
    key: Key,
    value: AdvancedSearchFilters[Key]
  ) {
    setAdvancedFilters((current) => ({
      ...current,
      [key]: value
    }));
  }

  return {
    advancedFilters,
    applicationSummary,
    filteredRecords,
    isAdvancedSearchOpen,
    searchTerm,
    sortedRecords,
    statusFilters,
    setSearchTerm,
    toggleAdvancedSearch: () => setIsAdvancedSearchOpen((isOpen) => !isOpen),
    toggleStatusFilter,
    updateAdvancedFilter
  };
}
