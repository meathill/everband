import { Button } from "@everband/ui/components/button";
import { Input } from "@everband/ui/components/input";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  createOrgEntryQr,
  type getPublicProfileSettings,
  getQrImageData,
  refreshQrStats,
  updatePublicProfile,
} from "~/server/public.ts";

type Settings = Awaited<ReturnType<typeof getPublicProfileSettings>>;

export function PublicProfileSection({ orgId, data }: { orgId: string; data: Settings }) {
  const router = useRouter();
  const profile = data.profile;
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const enabled = profile?.publicProfileEnabled ?? false;
  // 两个提交按钮共用一个表单：Save 保持现状，Open/Close 翻转开关
  const nextEnabledRef = useRef(enabled);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    const enabledNext = nextEnabledRef.current;
    event.preventDefault();
    setMessage(null);
    setIsBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await updatePublicProfile({
        data: {
          orgId,
          enabled: enabledNext,
          publicSlug: String(form.get("slug") || "") || undefined,
          publicDisplayName: String(form.get("displayName") || "") || undefined,
          publicSummary: String(form.get("summary") || "") || undefined,
        },
      });
      setMessage(result.ok ? "Saved." : result.error);
      await router.invalidate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateQr() {
    setMessage(null);
    const result = await createOrgEntryQr({ data: { orgId } });
    setMessage(result.ok ? `QR code created for ${result.shortUrl}` : result.error);
    await router.invalidate();
  }

  async function handleDownload(qrId: string, format: "svg" | "png") {
    setMessage(null);
    const result = await getQrImageData({ data: { orgId, qrId, format } });
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: result.contentType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `everband-entry-qr.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleRefreshStats() {
    await refreshQrStats({ data: { orgId } });
    await router.invalidate();
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">Public page & QR code</h2>
      <p className="text-sm text-muted-foreground">
        A read-only page for posters and flyers. It never shows members, events or rosters.
      </p>

      <form
        onSubmit={handleSave}
        className="flex max-w-xl flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
      >
        <p className="text-sm text-foreground">
          Status: <strong>{enabled ? "open" : "not open"}</strong>
        </p>
        <label className="flex flex-col gap-1.5" htmlFor="public-slug">
          <span className="text-sm font-medium text-foreground">Public link</span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">/p/</span>
            <Input
              id="public-slug"
              name="slug"
              defaultValue={profile?.publicSlug ?? ""}
              placeholder="riverside-band"
              pattern="[a-z0-9][a-z0-9-]{1,46}[a-z0-9]"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="public-name">
          <span className="text-sm font-medium text-foreground">Display name</span>
          <Input
            id="public-name"
            name="displayName"
            defaultValue={profile?.publicDisplayName ?? ""}
            placeholder={profile?.name}
          />
        </label>
        <label className="flex flex-col gap-1.5" htmlFor="public-summary">
          <span className="text-sm font-medium text-foreground">One-line summary</span>
          <Input
            id="public-summary"
            name="summary"
            defaultValue={profile?.publicSummary ?? ""}
            maxLength={200}
          />
        </label>
        <div className="flex gap-2">
          <Button
            type="submit"
            loading={isBusy}
            onClick={() => {
              nextEnabledRef.current = enabled;
            }}
          >
            Save
          </Button>
          <Button
            type="submit"
            variant="outline"
            onClick={() => {
              nextEnabledRef.current = !enabled;
            }}
          >
            {enabled ? "Close public page" : "Open public page"}
          </Button>
        </div>
      </form>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-foreground">Entry QR codes</h3>
          <Button size="xs" variant="outline" onClick={handleCreateQr}>
            Generate QR code
          </Button>
          {data.qrCodes.length > 0 && (
            <Button size="xs" variant="ghost" onClick={handleRefreshStats}>
              Refresh scan stats
            </Button>
          )}
        </div>
        {data.qrCodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No QR codes yet.</p>
        ) : (
          <ul className="flex max-w-xl flex-col gap-2">
            {data.qrCodes.map((qr) => (
              <li
                key={qr.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-sm"
              >
                <div className="flex flex-col">
                  <span className="font-mono text-foreground">{qr.shortUrl}</span>
                  <span className="text-xs text-muted-foreground num">
                    {qr.status} · scans: {qr.scanCount ?? "—"}
                    {qr.lastStatsSyncAt
                      ? ` (updated ${new Date(qr.lastStatsSyncAt).toLocaleString()})`
                      : " (not synced yet)"}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <Button size="xs" variant="outline" onClick={() => handleDownload(qr.id, "svg")}>
                    SVG
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => handleDownload(qr.id, "png")}>
                    PNG
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
