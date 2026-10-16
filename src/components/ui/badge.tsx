import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success: "bg-success-bg text-success-foreground border-success-bg",
        warning: "bg-warning-bg text-warning-foreground border-warning-bg",
        info: "bg-info-bg text-info-foreground border-info-bg",
        muted: "bg-muted text-muted-foreground border-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

/**
 * A `<span>`, not a `<div>`.
 *
 * A badge is inline-level by nature — it is `inline-flex`, it sits inside
 * sentences, inside table cells and inside list rows — and rendering it as a
 * block element made every one of those placements invalid HTML. The browser
 * parser closes the surrounding `<p>` early and React then reports a hydration
 * mismatch against markup that never matches what it rendered.
 *
 * The classes are already `inline-flex`, so this is a correctness fix with no
 * visual change: same box, valid wherever it is used.
 */
export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant }), className)}
        {...props}
      />
    );
  },
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
