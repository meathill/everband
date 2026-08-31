import { Link } from "@tanstack/react-router";
import { BrandFooter } from "meathill-brand-react";

// 全站共用页脚：Privacy / Terms 用 router Link（渲染为 <a>，prerender crawlLinks 可收录）
export function SiteFooter() {
  return (
    <BrandFooter
      currentSiteId="everband"
      description="Built for the people who keep community groups running."
      locale="en"
    >
      <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <Link to="/about" className="hover:text-foreground">
          About
        </Link>
        <Link to="/contact" className="hover:text-foreground">
          Contact
        </Link>
        <Link to="/privacy" className="hover:text-foreground">
          Privacy Policy
        </Link>
        <Link to="/terms" className="hover:text-foreground">
          Terms of Service
        </Link>
      </nav>
    </BrandFooter>
  );
}
