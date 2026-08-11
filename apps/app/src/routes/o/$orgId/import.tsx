import { Button } from "@everband/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@everband/ui/components/frame";
import { CSV_TEMPLATE, importJobsListSchema } from "@everband/validation";
import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { createFileRoute, getRouteApi, redirect, useRouter } from "@tanstack/react-router";
import type React from "react";
import { useRef, useState } from "react";
import { DataTablePagination } from "~/components/data-table/data-table-pagination.tsx";
import { confirmImport, listImportJobs, previewImport } from "~/server/import.ts";
import { ImportJobsTable } from "./-components/import-jobs-table.tsx";

export const Route = createFileRoute("/o/$orgId/import")({
  validateSearch: importJobsListSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    try {
      return { jobs: await listImportJobs({ data: { orgId: params.orgId, ...deps } }) };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: ImportPage,
});

type Preview = Awaited<ReturnType<typeof previewImport>>;

const orgRoute = getRouteApi("/o/$orgId");

function ImportPage(): React.ReactElement {
  const { jobs } = Route.useLoaderData();
  const { org } = orgRoute.useLoaderData();
  const { orgId } = Route.useParams();
  const navigate = Route.useNavigate();
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
    } catch {
      setMessage("The import could not be queued. Try again.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-semibold text-3xl text-foreground tracking-tight">Import members</h1>
        <Button onClick={handleDownloadTemplate} variant="outline">
          <DownloadSimpleIcon />
          Download CSV template
        </Button>
      </div>

      {/* 上传是本页的主任务，留在页内而不是抽屉；分区结构与抽屉里的表单保持一致 */}
      <Frame className="max-w-2xl">
        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Upload CSV</FrameTitle>
            <FrameDescription>
              Pick a file to check it before anything is written. Nothing is imported until you
              confirm.
            </FrameDescription>
          </FrameHeader>
          <Field>
            <FieldLabel htmlFor="csv-file">CSV file</FieldLabel>
            <input
              accept=".csv,text/csv"
              className="text-foreground text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-popover file:px-3 file:py-1.5 file:text-foreground file:text-sm"
              id="csv-file"
              onChange={handleFileChange}
              ref={fileInputRef}
              type="file"
            />
            <FieldDescription>
              Use the template above — the header row must match it.
            </FieldDescription>
          </Field>
        </FramePanel>

        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Review and confirm</FrameTitle>
            <FrameDescription>
              {preview
                ? "Rows with errors stay in the result for review; valid rows are imported."
                : "Choose a file to see how many rows will be imported."}
            </FrameDescription>
          </FrameHeader>

          {preview && (
            <div className="flex flex-col gap-2 pb-4 text-sm">
              <p className="text-foreground tabular-nums">
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

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-foreground text-xl">Import history</h2>
        <ImportJobsTable rows={jobs.items} timezone={org.timezone} />
        <DataTablePagination
          onPageChange={(page) =>
            navigate({ replace: true, search: (prev) => ({ ...prev, page }) })
          }
          page={jobs.page}
          pageSize={jobs.pageSize}
          total={jobs.total}
        />
      </section>
    </div>
  );
}
