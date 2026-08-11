import { Button } from "@everband/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@everband/ui/components/frame";
import { CSV_TEMPLATE } from "@everband/validation";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import type React from "react";
import { useRef, useState } from "react";
import { DataTablePagination } from "~/components/data-table/data-table-pagination.tsx";
import { confirmImport, type listImportJobs, previewImport } from "~/server/import.ts";
import { ImportJobsTable } from "./import-jobs-table.tsx";

type Jobs = Awaited<ReturnType<typeof listImportJobs>>;
type Preview = Awaited<ReturnType<typeof previewImport>>;

export function DataImportSettingsSection({
  jobs,
  onPageChange,
  orgId,
  timezone,
}: {
  jobs: Jobs;
  onPageChange: (page: number) => void;
  orgId: string;
  timezone: string;
}): React.ReactElement {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  function handleDownloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "everband-members-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage(null);
    setPreview(null);
    setFileName(file.name);
    setIsBusy(true);
    try {
      const text = await file.text();
      setCsvText(text);
      setPreview(await previewImport({ data: { orgId, csvText: text } }));
    } catch {
      setCsvText(null);
      setMessage("Could not read or validate this CSV. Check the file and try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConfirm() {
    if (!csvText) return;
    setIsBusy(true);
    setMessage(null);
    try {
      const result = await confirmImport({ data: { orgId, csvText } });
      setMessage(
        result.deduplicated
          ? "This file was already imported — showing the existing job."
          : "Import queued. Refresh to see progress.",
      );
      setCsvText(null);
      setPreview(null);
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await router.invalidate();
    } catch {
      setMessage("The import could not be queued. Try again.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl">Data import</h2>
          <p className="text-muted-foreground text-sm">
            Preview member CSV files before writing data.
          </p>
        </div>
        <Button onClick={handleDownloadTemplate} variant="outline">
          <DownloadSimpleIcon /> Download CSV template
        </Button>
      </div>
      <Frame className="max-w-2xl">
        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Upload CSV</FrameTitle>
            <FrameDescription>Nothing is imported until you confirm the preview.</FrameDescription>
          </FrameHeader>
          <Field>
            <FieldLabel htmlFor="settings-csv-file">CSV file</FieldLabel>
            <input
              accept=".csv,text/csv"
              className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-popover file:px-3 file:py-1.5"
              id="settings-csv-file"
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
            <FieldDescription>New templates do not include group assignments.</FieldDescription>
          </Field>
        </FramePanel>
        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Review and confirm</FrameTitle>
          </FrameHeader>
          {preview ? (
            <div className="flex flex-col gap-2 pb-4 text-sm">
              <p className="tabular-nums">
                {fileName}: {preview.totalRows} rows · {preview.validCount} valid ·{" "}
                {preview.invalidRows.length} with errors
              </p>
              {preview.headerError && (
                <p className="text-destructive-foreground">{preview.headerError}</p>
              )}
              {preview.invalidRows.length > 0 && (
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md bg-muted p-2">
                  {preview.invalidRows.map((row) => (
                    <li className="text-destructive-foreground" key={row.rowNumber}>
                      Row {row.rowNumber}: {row.errors.join("; ")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="pb-4 text-muted-foreground text-sm">Choose a file to preview its rows.</p>
          )}
          <Button
            disabled={!preview || Boolean(preview.headerError) || preview.validCount === 0}
            loading={isBusy}
            onClick={handleConfirm}
          >
            Confirm import
          </Button>
          {message && (
            <p className="pt-3 text-muted-foreground text-sm" role="status">
              {message}
            </p>
          )}
        </FramePanel>
      </Frame>
      <div className="flex flex-col gap-3">
        <h3 className="font-semibold text-lg">Import history</h3>
        <ImportJobsTable rows={jobs.items} timezone={timezone} />
        <DataTablePagination
          onPageChange={onPageChange}
          page={jobs.page}
          pageSize={jobs.pageSize}
          total={jobs.total}
        />
      </div>
    </section>
  );
}
