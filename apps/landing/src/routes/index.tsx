import { createFileRoute } from "@tanstack/react-router";
import { ContactSection } from "~/components/contact-section.tsx";
import { SiteFooter } from "~/components/site-footer.tsx";
import { SiteHeader } from "~/components/site-header.tsx";
import { APP_URL } from "~/lib/config.ts";

export const Route = createFileRoute("/")({
  component: Home,
});

// Landing 六板块（PRD §7.1）：Home / How it works / Use cases / Features /
// Privacy & Safety / Contact。不展示未实现能力（器材/财务/学生账号/公开活动）。

function Home() {
  return (
    <div className="flex flex-col">
      <SiteHeader />

      <main>
        {/* Home */}
        <section className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            For community bands, teams and clubs
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-foreground">
            Run your community band without the spreadsheets
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Members, events, rehearsals and parent rosters in one place — instead of spreadsheets,
            group emails and lost attachments.
          </p>
          <a
            href={`${APP_URL}/new-org`}
            className="rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground shadow-sm"
          >
            Create your organization
          </a>
        </section>

        {/* How it works */}
        <section id="how" className="border-t border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">How it works</h2>
            <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Set up", "Create your organization, groups and school terms in one sitting."],
                [
                  "Bring members in",
                  "Import students and families from a CSV, then invite parents by email.",
                ],
                [
                  "Plan the term",
                  "Publish events with updates and attachments; weekly rehearsals expand automatically.",
                ],
                [
                  "Keep everyone posted",
                  "Parents see what's next, confirm attendance and swap helper duties.",
                ],
              ].map(([title, body], index) => (
                <li
                  key={title}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-background p-5"
                >
                  <span className="text-sm font-semibold text-primary num">{index + 1}</span>
                  <h3 className="font-semibold text-foreground">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Use cases */}
        <section id="use-cases" className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">Use cases</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Community band", "Sections, concerts and weekly rehearsals with parent helpers."],
              ["Baseball team", "Squads, game days and canteen rosters."],
              ["Football team", "Age groups, training nights and matchday volunteers."],
              ["Community club", "Members, meetups and working bees."],
            ].map(([title, body]) => (
              <div
                key={title}
                className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 shadow-sm"
              >
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">Features</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                [
                  "Member management",
                  "Students, families and contacts stay linked — one email, one record, however many kids.",
                ],
                [
                  "Event updates",
                  "Publish changes once. Parents get an email and see the latest version, always.",
                ],
                [
                  "Parent collaboration",
                  "RSVPs, volunteer sign-ups and short answers on every event.",
                ],
                [
                  "Helper rosters",
                  "Fair, predictable rotation for rehearsal duties — with swap requests staff approve.",
                ],
                [
                  "Audit trail",
                  "Every publish, import and approval is recorded, so handovers don't lose history.",
                ],
                [
                  "Send with confidence",
                  "Delivery history shows who was emailed, when, and what failed.",
                ],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-background p-5"
                >
                  <h3 className="font-semibold text-foreground">{title}</h3>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy & Safety */}
        <section id="privacy" className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-16">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            Privacy & safety
          </h2>
          <ul className="flex flex-col gap-3 text-muted-foreground">
            <li>
              Adults hold the accounts. Students never sign in, and we collect the minimum about
              them.
            </li>
            <li>
              Each organization's data is isolated — staff and parents only see their own
              organization.
            </li>
            <li>
              Attachments are private. Every download is checked against who is allowed to see it.
            </li>
            <li>Contact details are never public. There are no public event pages.</li>
          </ul>
        </section>

        {/* Contact / Start */}
        <ContactSection appUrl={APP_URL} />
      </main>

      <SiteFooter />
    </div>
  );
}
