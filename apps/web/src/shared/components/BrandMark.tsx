import { cn } from "../utils";

type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-8 shrink-0 items-center justify-center", className)}
    >
      <img alt="" className="brand-mark-image block size-full object-contain" src="/pager-who-mark.png" />
    </span>
  );
}
