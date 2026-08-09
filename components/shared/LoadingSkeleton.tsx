import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type LoadingSkeletonVariant = "card" | "list" | "text";

export interface LoadingSkeletonProps {
  variant: LoadingSkeletonVariant;
  count?: number;
  className?: string;
}

// motion-reduce:animate-none overrides shadcn Skeleton's animate-pulse under
// prefers-reduced-motion: reduce — a static placeholder instead of a sped-up/
// slowed-down pulse. See docs/11. Frontend.md §11.8.
const REDUCED_MOTION_CLASS = "motion-reduce:animate-none";

function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("border-border space-y-3 rounded-lg border p-4", className)}>
      <Skeleton className={cn("h-5 w-1/2", REDUCED_MOTION_CLASS)} />
      <Skeleton className={cn("h-4 w-full", REDUCED_MOTION_CLASS)} />
      <Skeleton className={cn("h-4 w-2/3", REDUCED_MOTION_CLASS)} />
    </div>
  );
}

function ListRowSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Skeleton className={cn("size-9 shrink-0 rounded-full", REDUCED_MOTION_CLASS)} />
      <div className="flex-1 space-y-2">
        <Skeleton className={cn("h-4 w-1/3", REDUCED_MOTION_CLASS)} />
        <Skeleton className={cn("h-3 w-2/3", REDUCED_MOTION_CLASS)} />
      </div>
    </div>
  );
}

function TextLineSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-4 w-full", REDUCED_MOTION_CLASS, className)} />;
}

const DEFAULT_COUNT: Record<LoadingSkeletonVariant, number> = {
  card: 3,
  list: 3,
  text: 3,
};

/**
 * Shape-matched loading placeholder — not a generic spinner. See
 * docs/11. Frontend.md §11.5/§11.8 and docs/12. UI Design System.md §12.8.
 */
export function LoadingSkeleton({ variant, count, className }: LoadingSkeletonProps) {
  const items = Array.from({ length: count ?? DEFAULT_COUNT[variant] });

  if (variant === "card") {
    return (
      <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
        {items.map((_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (variant === "list") {
    return (
      <div className={cn("space-y-4", className)}>
        {items.map((_, index) => (
          <ListRowSkeleton key={index} />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {items.map((_, index) => (
        <TextLineSkeleton
          key={index}
          className={index === items.length - 1 ? "w-2/3" : undefined}
        />
      ))}
    </div>
  );
}
