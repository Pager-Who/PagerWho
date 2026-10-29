import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../utils";

type CodeBlockProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

export function CodeBlock({ children, className, ...props }: CodeBlockProps) {
  return (
    <code
      className={cn(
        "block bg-surface-2 border border-hairline-soft rounded-md text-ink text-xs leading-[1.45] min-w-0 overflow-wrap-anywhere p-2.5",
        className,
      )}
      {...props}
    >
      {children}
    </code>
  );
}
