import Link from "next/link";
import { Box } from "lucide-react";

export default function MarketingFooter() {
  return (
    <>
      <footer className="border-border/40 bg-muted/30 border-t">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-4">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5">
                <Box className="text-foreground h-5 w-5" />
                <span className="text-foreground text-base font-semibold tracking-tight">
                  Asset Tracker
                </span>
              </div>
              <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
                Modern asset management platform for teams of all sizes.
              </p>
            </div>

            {/* Product */}
            <div>
              <h3 className="text-foreground text-xs font-semibold tracking-wider uppercase">
                Product
              </h3>
              <ul className="mt-4 space-y-3">
                <li>
                  <Link
                    href="/#features"
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="/#how-it-works"
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    How it works
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h3 className="text-foreground text-xs font-semibold tracking-wider uppercase">
                Company
              </h3>
              <ul className="mt-4 space-y-3">
                <li>
                  <Link
                    href="/terms"
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>

            {/* Get started */}
            <div>
              <h3 className="text-foreground text-xs font-semibold tracking-wider uppercase">
                Get Started
              </h3>
              <ul className="mt-4 space-y-3">
                <li>
                  <Link
                    href="/register"
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    Create Account
                  </Link>
                </li>
                <li>
                  <Link
                    href="/login"
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    Sign In
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-border/40 mt-12 border-t pt-8">
            <p className="text-muted-foreground text-center text-xs">
              &copy; {new Date().getFullYear()} Asset Tracker. All rights
              reserved.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
