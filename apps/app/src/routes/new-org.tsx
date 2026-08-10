import { Button } from "@everband/ui/components/button";
import { Input } from "@everband/ui/components/input";
import { ORGANIZATION_TYPES } from "@everband/validation";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { getCurrentUser } from "~/server/auth.ts";
import { createOrganization } from "~/server/org.ts";

export const Route = createFileRoute("/new-org")({
  // 未登录先去登录，登录后回跳本页（issue #1）
  loader: async () => {
    const user = await getCurrentUser();
    if (!user) {
      throw redirect({ to: "/login", search: { redirect: "/new-org" } });
    }
  },
  component: NewOrgPage,
});

const COMMON_TIMEZONES = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Perth",
  "Australia/Hobart",
  "Pacific/Auckland",
];

function NewOrgPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof ORGANIZATION_TYPES)[number]>("band");
  const [timezone, setTimezone] = useState("Australia/Sydney");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsBusy(true);
    try {
      const result = await createOrganization({ data: { name, type, timezone } });
      await navigate({ to: "/o/$orgId", params: { orgId: result.orgId } });
    } catch (cause) {
      // loader 已挡未登录；这里兜底 session 中途过期的情形
      const message = cause instanceof Error ? cause.message : null;
      setError(
        message === "unauthenticated"
          ? "session-expired"
          : (message ?? "Something went wrong. Try again."),
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Create an organization
        </h1>
        <p className="text-muted-foreground">A band, team or club you run. You'll be its owner.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5" htmlFor="org-name">
          <span className="text-sm font-medium text-foreground">Organization name</span>
          <Input
            id="org-name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Riverside Community Band"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Type</span>
          <select
            className="h-9 rounded-md border border-input bg-popover px-3 text-base text-foreground sm:h-8 sm:text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as (typeof ORGANIZATION_TYPES)[number])}
          >
            {ORGANIZATION_TYPES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Timezone</span>
          <select
            className="h-9 rounded-md border border-input bg-popover px-3 text-base text-foreground sm:h-8 sm:text-sm"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {COMMON_TIMEZONES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <Button type="submit" loading={isBusy}>
          Create organization
        </Button>
      </form>

      {error === "session-expired" ? (
        <p className="text-sm text-muted-foreground">
          Your session has expired.{" "}
          <Link
            to="/login"
            search={{ redirect: "/new-org" }}
            className="text-primary underline-offset-4 hover:underline"
          >
            Sign in to continue
          </Link>
        </p>
      ) : (
        error && <p className="text-sm text-destructive-foreground">{error}</p>
      )}
    </main>
  );
}
