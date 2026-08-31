import appCss from "@everband/ui/styles/globals.css?url";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { brandCatalog, getOrganizationJsonLd } from "meathill-brand";
import brandCss from "meathill-brand-react/styles.css?url";
import type { ReactNode } from "react";
import { OG_IMAGE_URL } from "~/lib/config.ts";

const BRAND_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    getOrganizationJsonLd(),
    {
      "@type": "WebSite",
      name: "Everband",
      url: "https://everband.meathill.com",
      publisher: { "@id": brandCatalog.organization.id },
    },
  ],
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Everband — run your community band without the spreadsheets" },
      {
        name: "description",
        content:
          "Members, events, rehearsals and parent rosters for community bands, teams and clubs. One place instead of spreadsheets, group emails and lost attachments.",
      },
      // Open Graph 默认值；og:title/og:description/og:url 由各页面覆盖（meta 按 property 去重，子路由优先）
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Everband" },
      { property: "og:image", content: OG_IMAGE_URL },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:title",
        content: "Everband — run your community band without the spreadsheets",
      },
      {
        property: "og:description",
        content:
          "Members, events, rehearsals and parent rosters for community bands, teams and clubs. One place instead of spreadsheets, group emails and lost attachments.",
      },
      { property: "og:url", content: "https://everband.meathill.com/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: OG_IMAGE_URL },
      {
        name: "twitter:title",
        content: "Everband — run your community band without the spreadsheets",
      },
      {
        name: "twitter:description",
        content:
          "Members, events, rehearsals and parent rosters for community bands, teams and clubs. One place instead of spreadsheets, group emails and lost attachments.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: brandCss },
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "256x256" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD 结构化数据
          dangerouslySetInnerHTML={{ __html: JSON.stringify(BRAND_STRUCTURED_DATA) }}
        />
        {children}
        <Scripts />
      </body>
    </html>
  );
}
