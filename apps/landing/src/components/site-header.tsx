import { BrandHeader } from "meathill-brand-react";
import { APP_URL } from "~/lib/config.ts";

// 全站共用页头：锚点用 /#xxx 形式，在子页面也能跳回首页对应板块；
// Contact 与 Privacy 只在 footer 提供
export function SiteHeader() {
  return (
    <BrandHeader
      currentSiteId="everband"
      locale="en"
      productName="Everband"
      productUrl="https://everband.meathill.com"
      actions={
        <div className="flex items-center gap-5">
          <nav className="hidden items-center gap-5 text-sm text-muted-foreground sm:flex">
            <a href="/#how" className="hover:text-foreground">
              How it works
            </a>
            <a href="/#use-cases" className="hover:text-foreground">
              Use cases
            </a>
            <a href="/#features" className="hover:text-foreground">
              Features
            </a>
            <a href="/#faq" className="hover:text-foreground">
              FAQ
            </a>
            <a href="/about" className="hover:text-foreground">
              About
            </a>
          </nav>
          <a
            href={`${APP_URL}/new-org`}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
          >
            Get started
          </a>
        </div>
      }
    />
  );
}
