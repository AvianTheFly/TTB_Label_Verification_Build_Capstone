import type { AbvOperator, AdvancedSearchFilters } from "../types";

interface SearchPanelProps {
  advancedFilters: AdvancedSearchFilters;
  isAdvancedSearchOpen: boolean;
  onAdvancedFilterChange: <Key extends keyof AdvancedSearchFilters>(
    key: Key,
    value: AdvancedSearchFilters[Key]
  ) => void;
  onSearchTermChange: (value: string) => void;
  onToggleAdvancedSearch: () => void;
  searchTerm: string;
}

export function SearchPanel({
  advancedFilters,
  isAdvancedSearchOpen,
  onAdvancedFilterChange,
  onSearchTermChange,
  onToggleAdvancedSearch,
  searchTerm
}: SearchPanelProps) {
  return (
    <section className="search-panel" aria-label="Search applications">
      <label className="search-panel__field">
        <span>Find Application</span>
        <input
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Brand, field value, filename, or message"
          type="search"
          value={searchTerm}
        />
      </label>
      <button
        aria-expanded={isAdvancedSearchOpen}
        className="secondary-button"
        onClick={onToggleAdvancedSearch}
        type="button"
      >
        Filters
      </button>
      {isAdvancedSearchOpen && (
        <div className="advanced-search-panel">
          <label className="advanced-search-field">
            <span>Brand Name</span>
            <input
              onChange={(event) => onAdvancedFilterChange("brandName", event.target.value)}
              type="text"
              value={advancedFilters.brandName}
            />
          </label>
          <label className="advanced-search-field">
            <span>Class Type</span>
            <input
              onChange={(event) => onAdvancedFilterChange("classType", event.target.value)}
              type="text"
              value={advancedFilters.classType}
            />
          </label>
          <label className="advanced-search-field">
            <span>Alcohol Content %</span>
            <span className="advanced-search-field__pair">
              <select
                onChange={(event) =>
                  onAdvancedFilterChange("abvOperator", event.target.value as AbvOperator)
                }
                value={advancedFilters.abvOperator}
              >
                <option value="any">Any</option>
                <option value="lt">Less than</option>
                <option value="eq">Equal to</option>
                <option value="gt">Greater than</option>
              </select>
              <input
                inputMode="decimal"
                onChange={(event) => onAdvancedFilterChange("abvValue", event.target.value)}
                placeholder="14"
                type="text"
                value={advancedFilters.abvValue}
              />
            </span>
          </label>
          <label className="advanced-search-field">
            <span>Net Contents</span>
            <input
              onChange={(event) => onAdvancedFilterChange("netContents", event.target.value)}
              type="text"
              value={advancedFilters.netContents}
            />
          </label>
          <label className="advanced-search-field">
            <span>Producer</span>
            <input
              onChange={(event) => onAdvancedFilterChange("producer", event.target.value)}
              type="text"
              value={advancedFilters.producer}
            />
          </label>
          <label className="advanced-search-field">
            <span>Country of Origin</span>
            <input
              onChange={(event) => onAdvancedFilterChange("countryOfOrigin", event.target.value)}
              type="text"
              value={advancedFilters.countryOfOrigin}
            />
          </label>
          <label className="advanced-search-field advanced-search-field--wide">
            <span>Government Warning</span>
            <input
              onChange={(event) => onAdvancedFilterChange("governmentWarning", event.target.value)}
              type="text"
              value={advancedFilters.governmentWarning}
            />
          </label>
        </div>
      )}
    </section>
  );
}
