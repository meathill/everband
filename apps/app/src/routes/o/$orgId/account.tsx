import { Button } from "@everband/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@everband/ui/components/frame";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { PageSkeleton } from "~/components/page-loaders.tsx";
import { useServerFormAction } from "~/hooks/use-server-form-action.ts";
import { getMyEmailPreference, setEmailPreference } from "~/server/notify.ts";
import { getOrgContext } from "~/server/org.ts";

export const Route = createFileRoute("/o/$orgId/account")({
  loader: async ({ params }) => {
    try {
      const [ctx, preference] = await Promise.all([
        getOrgContext({ data: { orgId: params.orgId } }),
        getMyEmailPreference({ data: { orgId: params.orgId } }),
      ]);
      return { email: ctx.email, optOut: preference.optOut };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId: params.orgId } });
    }
  },
  component: AccountPage,
  pendingComponent: PageSkeleton,
});

function AccountPage() {
  const { email, optOut } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const preference = useServerFormAction({
    action: setEmailPreference,
    successMessage: "Email preference saved",
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="font-semibold text-3xl text-foreground tracking-tight">Account</h1>

      <Frame>
        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Signed-in account</FrameTitle>
            <FrameDescription>This address is used for sign-in and invitations.</FrameDescription>
          </FrameHeader>
          <p className="font-medium text-foreground text-sm">{email}</p>
        </FramePanel>

        <FramePanel>
          <FrameHeader className="px-0 pt-0">
            <FrameTitle>Email preferences</FrameTitle>
            <FrameDescription>
              Event updates and roster changes are optional. Sign-in and security emails are always
              sent.
            </FrameDescription>
          </FrameHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-foreground text-sm">
              Operational emails: <strong>{optOut ? "off" : "on"}</strong>
            </p>
            <Button
              loading={preference.isBusy}
              onClick={() => preference.submit({ orgId, optOut: !optOut })}
              size="sm"
              variant="outline"
            >
              {optOut ? "Turn on" : "Turn off"}
            </Button>
          </div>
          {preference.error && (
            <p className="mt-3 text-destructive-foreground text-sm" role="alert">
              {preference.error}
            </p>
          )}
        </FramePanel>
      </Frame>

      <Link to="/select-org" className="text-sm text-primary underline-offset-4 hover:underline">
        Switch organization
      </Link>
    </div>
  );
}
