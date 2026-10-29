import type { HTMLAttributes } from "react";

import { cn } from "../utils";

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-surface-2", className)} {...props} />;
}

export function OverviewSkeleton() {
  return (
    <div aria-label="Loading project overview" className="grid gap-4" role="status">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-28" key={index} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-56" />
    </div>
  );
}

export function TablePageSkeleton({ label }: { label: string }) {
  return (
    <div aria-label={label} className="grid gap-2" role="status">
      <div className="hidden grid-cols-[1.4fr_0.8fr_0.8fr_0.6fr] gap-3 px-4 py-3 sm:grid">
        {Array.from({ length: 4 }, (_, index) => <Skeleton className="h-3" key={index} />)}
      </div>
      <div className="hidden gap-2 sm:grid">
        {Array.from({ length: 6 }, (_, row) => (
          <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.6fr] items-center gap-3 rounded-md border border-hairline-soft bg-surface-1 px-4 py-4" key={row}>
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-7 w-16 justify-self-end rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:hidden">
        {Array.from({ length: 5 }, (_, row) => (
          <div className="grid gap-2 rounded-xl border border-hairline-soft bg-surface-1 p-3" key={row}>
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-4/5" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailPageSkeleton({ label, variant = "service" }: { label: string; variant?: "incident" | "service" }) {
  return (
    <div aria-label={label} className="grid gap-4" role="status">
      <div className="grid gap-3 rounded-lg border border-hairline-soft bg-surface-1 p-5">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-3 w-4/5" />
        <div className="flex flex-wrap gap-2 pt-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <Skeleton className={variant === "incident" ? "h-96" : "h-80"} />
        <div className="grid gap-4">
          <Skeleton className={variant === "incident" ? "h-52" : "h-80"} />
          {variant === "incident" ? <Skeleton className="h-64" /> : null}
        </div>
      </div>
    </div>
  );
}
