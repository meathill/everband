import { Button } from "@everband/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@everband/ui/components/field";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@everband/ui/components/frame";
import { Input } from "@everband/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@everband/ui/components/select";
import { COMMON_TIMEZONES, ORGANIZATION_TYPES } from "@everband/validation";
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

const ORGANIZATION_TYPE_LABELS: Record<(typeof ORGANIZATION_TYPES)[number], string> = {
  band: "Band",
  baseball: "Baseball team",
  club: "Club",
  football: "Football team",
  other: "Other community group",
};

const TIMEZONE_LABELS = Object.fromEntries(COMMON_TIMEZONES.map((value) => [value, value]));

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

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Frame>
          <FramePanel>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>Organization</FrameTitle>
              <FrameDescription>Start with the group people already recognize.</FrameDescription>
            </FrameHeader>
            <Field>
              <FieldLabel htmlFor="org-name">Organization name</FieldLabel>
              <Input
                autoFocus
                id="org-name"
                name="name"
                placeholder="Riverside Community Band"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="org-type">Type</FieldLabel>
              <Select defaultValue="band" items={ORGANIZATION_TYPE_LABELS} name="type">
                <SelectTrigger id="org-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORGANIZATION_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {ORGANIZATION_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FramePanel>

          <FramePanel>
            <FrameHeader className="px-0 pt-0">
              <FrameTitle>Local time</FrameTitle>
              <FrameDescription>Used for events, rehearsals and reminders.</FrameDescription>
            </FrameHeader>
            <Field>
              <FieldLabel htmlFor="org-timezone">Timezone</FieldLabel>
              <Select defaultValue="Australia/Sydney" items={TIMEZONE_LABELS} name="timezone">
                <SelectTrigger id="org-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_TIMEZONES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>You can change this later from Settings.</FieldDescription>
            </Field>
          </FramePanel>
        </Frame>

        <Button loading={isBusy} type="submit">
          Create organization
        </Button>
      </form>

      {error === "session-expired" ? (
        <p className="text-muted-foreground text-sm">
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
        error && <p className="text-destructive-foreground text-sm">{error}</p>
      )}
    </main>
  );
}
