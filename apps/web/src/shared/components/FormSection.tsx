import type { ReactNode } from "react";

import { Panel } from "./Panel";
import { SectionHeader } from "./SectionHeader";

type FormSectionProps = {
  action?: ReactNode;
  children: ReactNode;
  description?: string;
  title: string;
};

export function FormSection({ action, children, description, title }: FormSectionProps) {
  return (
    <Panel className="grid gap-3" padding="sm" tone="secondary">
      <SectionHeader action={action} description={description} title={title} />
      {children}
    </Panel>
  );
}
