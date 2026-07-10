import { VISIBLE_STATUSES } from "../constants";
import type { ApplicationPackageRecord, VisibleStatus } from "../packageWorkflowUtils";
import { cardStatusClass } from "../recordStatus";
import type { ApplicationSummary } from "../types";
import { SectionStats } from "./SectionStats";

interface ApplicationsSectionProps {
  allRecordCount: number;
  filteredRecords: ApplicationPackageRecord[];
  onOpenDetail: (packageId: string) => void;
  onToggleStatusFilter: (status: VisibleStatus | "total") => void;
  sortedRecords: ApplicationPackageRecord[];
  statusFilters: Record<VisibleStatus, boolean>;
  summary: ApplicationSummary;
}

export function ApplicationsSection({
  allRecordCount,
  filteredRecords,
  onOpenDetail,
  onToggleStatusFilter,
  sortedRecords,
  statusFilters,
  summary
}: ApplicationsSectionProps) {
  return (
    <section className="applications-section" aria-labelledby="applications-title">
      <div className="section-rule">
        <h2 id="applications-title">Applications</h2>
        <SectionStats
          items={[
            {
              active: VISIBLE_STATUSES.every((status) => statusFilters[status]),
              filterKey: "total",
              label: "total",
              value: summary.total,
              tone: "neutral"
            },
            {
              active: statusFilters.Fail,
              filterKey: "Fail",
              label: "fail",
              value: summary.fail,
              tone: "fail"
            },
            {
              active: statusFilters["Needs Review"],
              filterKey: "Needs Review",
              label: "needs review",
              value: summary.needsReview,
              tone: "review"
            },
            {
              active: statusFilters.Passed,
              filterKey: "Passed",
              label: "passed",
              value: summary.passed,
              tone: "passed"
            }
          ]}
          onToggle={(filterKey) => onToggleStatusFilter(filterKey as VisibleStatus | "total")}
        />
      </div>
      <div className="package-grid" aria-label="Uploaded applications">
        {filteredRecords.length === 0 ? (
          <div className="empty-state">
            <h2>{allRecordCount === 0 ? "No Applications Loaded" : "No Matching Applications"}</h2>
            <p>
              {allRecordCount === 0
                ? "Choose JSON and image files to begin."
                : "Adjust search filters to show more applications."}
            </p>
          </div>
        ) : (
          sortedRecords.map((record) => (
            <article
              className={`package-card package-card--${cardStatusClass(record.status)}`}
              key={record.package_id}
            >
              <button
                className="package-card__button"
                onClick={() => onOpenDetail(record.package_id)}
                type="button"
              >
                {record.image_preview_url ? (
                  <img alt="" className="package-card__thumbnail" src={record.image_preview_url} />
                ) : (
                  <span className="package-card__thumbnail package-card__thumbnail--blank" />
                )}
                <span className="package-card__body">
                  <strong>{record.application_data.brand_name}</strong>
                  <span className={`status-chip status-chip--${cardStatusClass(record.status)}`}>
                    {record.status}
                  </span>
                  {record.item_error && (
                    <span className="package-card__error">{record.item_error}</span>
                  )}
                </span>
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

