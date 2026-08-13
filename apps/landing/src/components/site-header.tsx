import { APP_URL } from "~/lib/config.ts";

// 全站共用页头：锚点用 /#xxx 形式，在子页面（/privacy /terms）也能跳回首页对应板块
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <a href="/" aria-label="Everband" className="flex items-center">
          <img src="/brand/band-lockup.png" alt="Everband" className="h-8 w-auto" />
        </a>
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
          <a href="/#privacy" className="hover:text-foreground">
            Privacy
          </a>
          <a href="/#contact" className="hover:text-foreground">
            Contact
          </a>
        </nav>
        <a
          href={`${APP_URL}/new-org`}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          Get started
        </a>
      </div>
    </header>
  );
}
