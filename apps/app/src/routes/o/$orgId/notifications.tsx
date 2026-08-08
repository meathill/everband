import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { listEmailSends, listMyNotifications, markNotificationsRead } from "~/server/notify.ts";
import { getOrgContext } from "~/server/org.ts";

export const Route = createFileRoute("/o/$orgId/notifications")({
  loader: async ({ params }) => {
    const orgId = params.orgId;
    try {
      const ctx = await getOrgContext({ data: { orgId } });
      const isStaff = ctx.role === "owner" || ctx.role === "staff";
      const [notifications, sends] = await Promise.all([
        listMyNotifications({ data: { orgId } }),
        isStaff ? listEmailSends({ data: { orgId } }) : Promise.resolve([]),
      ]);
      // 打开页面即标记已读（PRD：未读状态）
      await markNotificationsRead({ data: { orgId } });
      return { notifications, sends, isStaff };
    } catch {
      throw redirect({ to: "/o/$orgId", params: { orgId } });
    }
  },
  component: NotificationsPage,
});

function NotificationsPage() {
  const { notifications, sends, isStaff } = Route.useLoaderData();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Notifications</h1>
        {notifications.length === 0 ? (
          <p className="text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="flex max-w-2xl flex-col gap-2">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 text-sm shadow-sm"
              >
                <div className="flex items-center gap-2">
                  {!notification.readAt && (
                    <span
                      className="size-2 rounded-full bg-primary"
                      aria-label="Unread"
                      role="status"
                    />
                  )}
                  {notification.linkPath ? (
                    <Link
                      to={notification.linkPath}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {notification.title}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{notification.title}</span>
                  )}
                </div>
                <span className="text-muted-foreground num">
                  {new Date(notification.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isStaff && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-foreground">Email history</h2>
          <p className="text-sm text-muted-foreground">
            Queued means the job was accepted — it does not mean delivered. Watch the per-send
            counts below.
          </p>
          {sends.length === 0 ? (
            <p className="text-muted-foreground">No emails sent yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full max-w-4xl text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Requested</th>
                    <th className="py-2 pr-4 font-medium">Subject</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Recipients</th>
                    <th className="py-2 pr-4 font-medium">Sent</th>
                    <th className="py-2 pr-4 font-medium">Failed</th>
                    <th className="py-2 font-medium">Opted out</th>
                  </tr>
                </thead>
                <tbody>
                  {sends.map((send) => (
                    <tr key={send.id} className="border-b border-border num">
                      <td className="py-2 pr-4 text-foreground">
                        {new Date(send.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-foreground">{send.subject}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={
                            send.status === "succeeded"
                              ? "text-success-foreground"
                              : send.status === "failed"
                                ? "text-destructive-foreground"
                                : "text-muted-foreground"
                          }
                        >
                          {send.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{send.recipientCount}</td>
                      <td className="py-2 pr-4">{send.sentCount}</td>
                      <td className="py-2 pr-4">{send.failedCount}</td>
                      <td className="py-2">{send.suppressedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
