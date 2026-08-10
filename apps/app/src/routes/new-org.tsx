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
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // 非受控 + FormData 读值：受控输入在水合前的键入会被 state 重置清空（慢网络真实可复现）
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setIsBusy(true);
    try {
      const result = await createOrganization({
        data: {
          name: String(formData.get("name") ?? ""),
          type: String(formData.get("type") ?? "band") as (typeof ORGANIZATION_TYPES)[number],
          timezone: String(formData.get("timezone") ?? "Australia/Sydney"),
        },
      });
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
            name="name"
            required
            autoFocus
            placeholder="Riverside Community Band"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Type</span>
          <select
            name="type"
            className="h-9 rounded-md border border-input bg-popover px-3 text-base text-foreground sm:h-8 sm:text-sm"
            defaultValue="band"
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
            name="timezone"
            className="h-9 rounded-md border border-input bg-popover px-3 text-base text-foreground sm:h-8 sm:text-sm"
            defaultValue="Australia/Sydney"
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
