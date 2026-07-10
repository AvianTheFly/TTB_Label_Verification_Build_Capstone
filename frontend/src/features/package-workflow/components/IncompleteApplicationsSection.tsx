import type { IncompleteApplicationRecord } from "../packageWorkflowUtils";
import type { IncompleteFilter, IncompleteSummary } from "../types";
import { SectionStats } from "./SectionStats";

interface IncompleteApplicationsSectionProps {
  allRecordCount: number;
  filteredRecords: IncompleteApplicationRecord[];
  filters: Record<IncompleteFilter, boolean>;
  onToggleFilter: (filter: IncompleteFilter | "total") => void;
  summary: IncompleteSummary;
}

export function IncompleteApplicationsSection({
  allRecordCount,
  filteredRecords,
  filters,
  onToggleFilter,
  summary
}: IncompleteApplicationsSectionProps) {
  return (
    <section
      className="applications-section applications-section--incomplete"
      aria-labelledby="incomplete-applications-title"
    >
      <div className="section-rule section-rule--incomplete">
        <h2 id="incomplete-applications-title">Incomplete Applications</h2>
        <SectionStats
          items={[
            {
              active: filters.json && filters.image,
              filterKey: "total",
              label: "total",
              value: summary.total,
              tone: "neutral"
            },
            {
              active: filters.json,
              filterKey: "json",
              label: "json",
              value: summary.json,
              tone: "review"
            },
            {
              active: filters.image,
              filterKey: "image",
              label: "images",
              value: summary.images,
              tone: "pending"
            }
          ]}
          onToggle={(filterKey) => onToggleFilter(filterKey as IncompleteFilter | "total")}
        />
      </div>
      <div className="package-grid" aria-label="Incomplete applications">
        {filteredRecords.length === 0 ? (
          <div className="empty-state empty-state--compact">
            <h2>
              {allRecordCount === 0
                ? "No Incomplete Applications"
                : "No Matching Incomplete Applications"}
            </h2>
            <p>
              {allRecordCount === 0
                ? "Unpaired JSON or image files will appear here."
                : "Adjust search filters to show more incomplete items."}
            </p>
          </div>
        ) : (
          filteredRecords.map((record, index) => (
            <article className="package-card package-card--incomplete" key={record.incomplete_id}>
              <div className="package-card__button package-card__button--static">
                {record.image_preview_url ? (
                  <img alt="" className="package-card__thumbnail" src={record.image_preview_url} />
                ) : (
                  <span className="package-card__thumbnail package-card__thumbnail--blank" />
                )}
                <span className="package-card__body">
                  <strong>Incomplete Application {index + 1}</strong>
                  <span className="status-chip status-chip--pending">
                    {record.kind === "json_missing_image"
                      ? "Missing Image"
                      : "Missing Application Data"}
                  </span>
                </span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

