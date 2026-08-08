import { Button } from "@everband/ui/components/button";
import { Input } from "@everband/ui/components/input";
import type { FORM_KINDS, FormPayload } from "@everband/validation";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import {
  closeEventForm,
  createEventForm,
  type getEventForm,
  type listFormResults,
  submitEventForm,
} from "~/server/forms.ts";

type FormData = Awaited<ReturnType<typeof getEventForm>>;
type Results = Awaited<ReturnType<typeof listFormResults>>;

export function EventFormSection({
  orgId,
  eventId,
  isStaff,
  formData,
  results,
}: {
  orgId: string;
  eventId: string;
  isStaff: boolean;
  formData: FormData;
  results: Results;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">Form</h2>
      {formData.form === null ? (
        isStaff ? (
          <CreateFormPanel orgId={orgId} eventId={eventId} />
        ) : (
          <p className="text-muted-foreground">No form for this event.</p>
        )
      ) : (
        <>
          <ParentFormPanel orgId={orgId} formData={formData} />
          {isStaff && <StaffResultsPanel orgId={orgId} form={formData.form} results={results} />}
        </>
      )}
    </section>
  );
}

function CreateFormPanel({ orgId, eventId }: { orgId: string; eventId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<(typeof FORM_KINDS)[number]>("rsvp");
  const [options, setOptions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      const result = await createEventForm({
        data: {
          orgId,
          eventId,
          kind,
          options:
            kind === "choice"
              ? options
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
              : undefined,
        },
      });
      if (result.ok) {
        await router.invalidate();
      } else {
        setError(result.error);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <form onSubmit={handleCreate} className="flex max-w-md flex-col gap-3">
      <label className="flex flex-col gap-1.5" htmlFor="form-kind">
        <span className="text-sm font-medium text-foreground">Form type</span>
        <select
          id="form-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as (typeof FORM_KINDS)[number])}
          className="h-9 rounded-md border border-input bg-popover px-3 text-base text-foreground sm:h-8 sm:text-sm"
        >
          <option value="rsvp">RSVP / attendance</option>
          <option value="volunteer">Volunteer sign-up</option>
          <option value="choice">Fixed options</option>
          <option value="text">Short answer</option>
        </select>
      </label>
      {kind === "choice" && (
        <label className="flex flex-col gap-1.5" htmlFor="form-options">
          <span className="text-sm font-medium text-foreground">Options (one per line)</span>
          <textarea
            id="form-options"
            rows={3}
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            className="rounded-md border border-input bg-popover px-3 py-2 text-base text-foreground sm:text-sm"
          />
        </label>
      )}
      {error && <p className="text-sm text-destructive-foreground">{error}</p>}
      <div>
        <Button type="submit" loading={isBusy}>
          Open form
        </Button>
      </div>
    </form>
  );
}

function ParentFormPanel({ orgId, formData }: { orgId: string; formData: FormData }) {
  const router = useRouter();
  const form = formData.form;
  const existing = formData.mySubmission?.payload as FormPayload | undefined;
  const [note, setNote] = useState(existing && "note" in existing ? (existing.note ?? "") : "");
  const [text, setText] = useState(existing?.kind === "text" ? existing.text : "");
  const [message, setMessage] = useState<string | null>(null);
  if (!form) {
    return null;
  }
  const isClosed = form.status === "closed";

  async function submit(payload: FormPayload) {
    setMessage(null);
    const result = await submitEventForm({ data: { orgId, formId: form?.id ?? "", payload } });
    setMessage(result.ok ? "Saved." : result.error);
    await router.invalidate();
  }

  return (
    <div className="flex max-w-md flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {form.kind === "rsvp" && "Will you attend?"}
          {form.kind === "volunteer" && "Can you help out?"}
          {form.kind === "choice" && "Pick an option"}
          {form.kind === "text" && "Your answer"}
        </p>
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {form.status}
        </span>
      </div>

      {isClosed && !existing && (
        <p className="text-sm text-muted-foreground">This form is closed.</p>
      )}
      {isClosed && existing && (
        <p className="text-sm text-muted-foreground">
          Your response: {JSON.stringify(existing)} (form closed, no more changes)
        </p>
      )}

      {!isClosed && form.kind === "rsvp" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {(["yes", "maybe", "no"] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={
                  existing?.kind === "rsvp" && existing.response === value ? "default" : "outline"
                }
                onClick={() => submit({ kind: "rsvp", response: value, note: note || undefined })}
              >
                {value}
              </Button>
            ))}
          </div>
          <Input
            aria-label="Note"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}

      {!isClosed && form.kind === "volunteer" && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={existing?.kind === "volunteer" && existing.canHelp ? "default" : "outline"}
              onClick={() => submit({ kind: "volunteer", canHelp: true, note: note || undefined })}
            >
              I can help
            </Button>
            <Button
              size="sm"
              variant={existing?.kind === "volunteer" && !existing.canHelp ? "default" : "outline"}
              onClick={() => submit({ kind: "volunteer", canHelp: false, note: note || undefined })}
            >
              Not this time
            </Button>
          </div>
          <Input
            aria-label="Note"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}

      {!isClosed && form.kind === "choice" && (
        <div className="flex flex-wrap gap-2">
          {(form.options ?? []).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={
                existing?.kind === "choice" && existing.choice === option ? "default" : "outline"
              }
              onClick={() => submit({ kind: "choice", choice: option })}
            >
              {option}
            </Button>
          ))}
        </div>
      )}

      {!isClosed && form.kind === "text" && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit({ kind: "text", text });
          }}
        >
          <textarea
            aria-label="Your answer"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="rounded-md border border-input bg-popover px-3 py-2 text-base text-foreground sm:text-sm"
          />
          <div>
            <Button type="submit" size="sm">
              Save answer
            </Button>
          </div>
        </form>
      )}

      {existing && !isClosed && (
        <p className="text-xs text-muted-foreground">
          You can change your response until the form closes.
        </p>
      )}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

function StaffResultsPanel({
  orgId,
  form,
  results,
}: {
  orgId: string;
  form: NonNullable<FormData["form"]>;
  results: Results;
}) {
  const router = useRouter();

  async function handleClose() {
    await closeEventForm({ data: { orgId, formId: form.id } });
    await router.invalidate();
  }

  function handleExport() {
    const lines = ["email,submitted_at,response"];
    for (const row of results) {
      const payload = JSON.stringify(JSON.parse(row.payloadJson)).replace(/"/g, '""');
      lines.push(`${row.email},${new Date(row.updatedAt).toISOString()},"${payload}"`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "form-results.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="font-medium text-foreground">Responses ({results.length})</h3>
        <Button size="xs" variant="outline" onClick={handleExport} disabled={results.length === 0}>
          Export CSV
        </Button>
        {form.status === "open" && (
          <Button size="xs" variant="destructive-outline" onClick={handleClose}>
            Close form
          </Button>
        )}
      </div>
      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground">No responses yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-1.5 pr-4 font-medium">Email</th>
              <th className="py-1.5 pr-4 font-medium">Response</th>
              <th className="py-1.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row) => (
              <tr key={row.id} className="border-b border-border align-top">
                <td className="py-1.5 pr-4 text-foreground">{row.email}</td>
                <td className="py-1.5 pr-4 font-mono text-xs text-foreground">{row.payloadJson}</td>
                <td className="py-1.5 text-muted-foreground num">
                  {new Date(row.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
