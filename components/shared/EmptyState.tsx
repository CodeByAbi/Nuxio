import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Shared empty-state pattern (icon → headline → description → verb-first CTA).
 * See docs/12. UI Design System.md §12.5 — copy passed in by callers must be
 * specific and actionable ("Belum ada transaksi"), never generic ("No data found").
 */
export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon ? (
        <div className="bg-neutral text-neutral-foreground flex size-12 items-center justify-center rounded-full">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-foreground text-base font-medium">{title}</h3>
        <p className="text-neutral-foreground max-w-[65ch] text-sm">{description}</p>
      </div>
      {action ? (
        <Button onClick={action.onClick} className="mt-2">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
