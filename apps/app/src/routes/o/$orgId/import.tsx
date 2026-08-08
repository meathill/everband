import { Button } from "@everband/ui/components/button";
import { CSV_TEMPLATE } from "@everband/validation";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { confirmImport, listImportJobs, previewImport } from "~/server/import.ts";

export const Route = createFileRoute("/o/$orgId/import")({
  loader: async ({ params }) => {
    try {
      return { jobs: await listImportJobs({ data: { orgId: params.orgId } }) };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: ImportPage,
});

type Preview = Awaited<ReturnType<typeof previewImport>>;

function ImportPage() {
  const { jobs } = Route.useLoaderData();
  const { orgId } = Route.useParams();
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
    if (!file) {
      return;
    }
    setMessage(null);
    setPreview(null);
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    setIsBusy(true);
    try {
      setPreview(await previewImport({ data: { orgId, csvText: text } }));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConfirm() {
    if (!csvText) {
      return;
    }
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
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await router.invalidate();
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Import members</h1>
        <Button variant="outline" onClick={handleDownloadTemplate}>
          Download CSV template
        </Button>
      </div>

      <section className="flex max-w-2xl flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <label className="flex flex-col gap-1.5" htmlFor="csv-file">
          <span className="text-sm font-medium text-foreground">CSV file</span>
          <input
            id="csv-file"
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-popover file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          />
        </label>

        {preview && (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-foreground">
              {fileName}: {preview.totalRows} rows · {preview.validCount} valid ·{" "}
              {preview.invalidRows.length} with errors
            </p>
            {preview.headerError && (
              <p className="text-destructive-foreground">{preview.headerError}</p>
            )}
            {preview.invalidRows.length > 0 && (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md bg-muted p-2">
                {preview.invalidRows.map((row) => (
                  <li key={row.rowNumber} className="text-destructive-foreground">
                    Row {row.rowNumber}: {row.errors.join("; ")}
                  </li>
                ))}
              </ul>
            )}
            {!preview.headerError && preview.validCount > 0 && (
              <p className="text-muted-foreground">
                Valid rows will be imported; rows with errors are kept in the result for review.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleConfirm}
            loading={isBusy}
            disabled={!preview || Boolean(preview.headerError) || preview.validCount === 0}
          >
            Confirm import
          </Button>
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-foreground">Import history</h2>
        {jobs.length === 0 ? (
          <p className="text-muted-foreground">No imports yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full max-w-3xl text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Started</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Rows</th>
                  <th className="py-2 pr-4 font-medium">Created</th>
                  <th className="py-2 pr-4 font-medium">Updated</th>
                  <th className="py-2 pr-4 font-medium">Skipped</th>
                  <th className="py-2 font-medium">Failed</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-border num">
                    <td className="py-2 pr-4 text-foreground">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          job.status === "succeeded"
                            ? "text-success-foreground"
                            : job.status === "failed"
                              ? "text-destructive-foreground"
                              : "text-muted-foreground"
                        }
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{job.totalRows}</td>
                    <td className="py-2 pr-4">{job.createdCount}</td>
                    <td className="py-2 pr-4">{job.updatedCount}</td>
                    <td className="py-2 pr-4">{job.skippedCount}</td>
                    <td className="py-2">{job.failedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
