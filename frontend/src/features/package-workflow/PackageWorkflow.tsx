import { ApplicationDetailDialog } from "./components/ApplicationDetailDialog";
import { ApplicationsSection } from "./components/ApplicationsSection";
import { SearchPanel } from "./components/SearchPanel";
import { UploadDropSurface } from "./components/UploadDropSurface";
import { WorkflowHeader } from "./components/WorkflowHeader";
import { usePackageWorkflow } from "./usePackageWorkflow";

export function PackageWorkflow() {
  const workflow = usePackageWorkflow();

  return (
    <main className="app-shell">
      <section className="tool-layout package-workflow" aria-labelledby="package-title">
        <WorkflowHeader
          canVerifyBatch={workflow.records.length > 0}
          checkingMessage={workflow.checkingMessage}
          isChecking={workflow.isChecking}
          onDownloadSampleLabels={workflow.downloadSampleLabels}
          onVerifyBatch={workflow.verifyBatchApplications}
        />

        <UploadDropSurface
          checkError={workflow.checkError}
          fileInputRef={workflow.fileInputRef}
          isDragging={workflow.isDragging}
          onDragEnter={workflow.handleDragEnter}
          onDragLeave={workflow.handleDragLeave}
          onDragOver={workflow.handleDragOver}
          onDrop={workflow.handleDrop}
          onFileInputChange={workflow.handleFileInputChange}
          validationErrors={workflow.validationErrors}
        >
          <ApplicationsSection
            allRecordCount={workflow.records.length}
            filteredRecords={workflow.filteredRecords}
            onOpenDetail={workflow.openDetail}
            onToggleStatusFilter={workflow.toggleStatusFilter}
            searchPanel={(
              <SearchPanel
                advancedFilters={workflow.advancedFilters}
                isAdvancedSearchOpen={workflow.isAdvancedSearchOpen}
                onAdvancedFilterChange={workflow.updateAdvancedFilter}
                onSearchTermChange={workflow.setSearchTerm}
                onToggleAdvancedSearch={workflow.toggleAdvancedSearch}
                searchTerm={workflow.searchTerm}
              />
            )}
            sortedRecords={workflow.sortedRecords}
            statusFilters={workflow.statusFilters}
            summary={workflow.applicationSummary}
          />
        </UploadDropSurface>

        {workflow.selectedRecord && (
          <ApplicationDetailDialog
            detailHeadingRef={workflow.detailHeadingRef}
            isVerifying={workflow.isChecking}
            onApplicationDataChange={workflow.updateApplicationData}
            onApplicationBoldFormattingChange={workflow.updateApplicationBoldFormatting}
            onClose={workflow.closeDetail}
            onExtractedDataChange={workflow.updateExtractedData}
            onExtractedBoldFormattingChange={workflow.updateExtractedBoldFormatting}
            onFieldDecision={workflow.setFieldDecision}
            onFieldEditComplete={workflow.compareEditedRecord}
            onVerify={workflow.verifySingleApplication}
            record={workflow.selectedRecord}
          />
        )}
      </section>
    </main>
  );
}
