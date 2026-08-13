import { createFileRoute } from "@tanstack/react-router";
import { ContactSection } from "~/components/contact-section.tsx";
import { SiteFooter } from "~/components/site-footer.tsx";
import { SiteHeader } from "~/components/site-header.tsx";
import { APP_URL } from "~/lib/config.ts";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact us — Everband" },
      {
        name: "description",
        content:
          "Questions, feedback or ideas for Everband — the community band management tool. We read every message.",
      },
      { property: "og:title", content: "Contact us — Everband" },
      {
        property: "og:description",
        content:
          "Questions, feedback or ideas for Everband — the community band management tool. We read every message.",
      },
      { property: "og:url", content: "https://everband.meathill.com/contact" },
      { name: "twitter:title", content: "Contact us — Everband" },
      {
        name: "twitter:description",
        content:
          "Questions, feedback or ideas for Everband — the community band management tool. We read every message.",
      },
    ],
    links: [{ rel: "canonical", href: "https://everband.meathill.com/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Contact us</h1>
        <ContactSection appUrl={APP_URL} />
      </main>
      <SiteFooter />
    </div>
  );
}
