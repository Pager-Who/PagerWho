import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Children, cloneElement, forwardRef, isValidElement } from "react";

import { useStaticText, useTranslateNode } from "../i18n";
import { cn } from "../utils";

type FieldProps = {
  children: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
  required?: boolean;
};

type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  description?: ReactNode;
  label: ReactNode;
};

const inputBase = "bg-surface-1 border border-hairline rounded-lg text-ink min-h-10 min-w-0 px-3 py-2.5 w-full placeholder:text-ink-subtle focus:border-accent/50 focus:shadow-[0_0_0_3px_rgba(0,153,255,0.12)] focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60";

export function Field({ children, error, hint, label, required = false }: FieldProps) {
  const translateNode = useTranslateNode();

  return (
    <label className="grid gap-1.75 min-w-0">
      <span className="inline-flex text-ink-muted text-[13px] font-semibold gap-0.5 leading-[1.2]">
        {translateNode(label)}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-ink-subtle text-xs leading-[1.35]">{translateNode(hint)}</span> : null}
      {error ? <span className="text-[#ff98ad] text-xs leading-[1.35]">{translateNode(error)}</span> : null}
    </label>
  );
}

export function FieldLabel({ children, className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label {...props} className={cn("inline-flex text-ink-muted text-[13px] font-semibold gap-0.5 leading-[1.2]", className)}>
      {children}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const t = useStaticText();

  return <input {...translateInputTextProps(props, t)} className={cn(inputBase, className)} />;
}

export function NumberInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const t = useStaticText();

  return <input {...translateInputTextProps(props, t)} className={cn(inputBase, className)} inputMode="numeric" type="number" />;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...props }, ref) {
  const t = useStaticText();

  return <textarea {...translateInputTextProps(props, t)} className={cn(inputBase, "leading-[1.45] min-h-24 resize-y", className)} ref={ref} />;
});

export function Select({ children, className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const t = useStaticText();
  const translateNode = useTranslateNode();

  return (
    <select {...translateInputTextProps(props, t)} className={cn(inputBase, "appearance-none", className)}>
      {translateOptionChildren(children, translateNode)}
    </select>
  );
}

export function CheckboxField({ className, description, label, ...props }: CheckboxFieldProps) {
  const translateNode = useTranslateNode();

  return (
    <label className={cn("flex items-start text-ink gap-2.5 leading-[1.35]", className)}>
      <input {...props} className="accent-accent mt-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60" type="checkbox" />
      <span>
        <span className="block text-sm font-semibold">{translateNode(label)}</span>
        {description ? <span className="block text-ink-muted text-xs mt-0.5">{translateNode(description)}</span> : null}
      </span>
    </label>
  );
}

function translateInputTextProps<TProps extends {
  "aria-label"?: string | undefined;
  placeholder?: string | undefined;
  title?: string | undefined;
}>(props: TProps, t: (value: string) => string): TProps {
  const translatedProps = { ...props };

  if (typeof translatedProps.placeholder === "string") {
    translatedProps.placeholder = t(translatedProps.placeholder);
  }

  if (typeof translatedProps.title === "string") {
    translatedProps.title = t(translatedProps.title);
  }

  if (typeof translatedProps["aria-label"] === "string") {
    translatedProps["aria-label"] = t(translatedProps["aria-label"]);
  }

  return translatedProps;
}

function translateOptionChildren(
  children: ReactNode,
  translateNode: (value: ReactNode) => ReactNode,
) {
  return Children.map(children, (child) => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number | readonly string[] }>(child) || child.type !== "option") {
      return child;
    }

    const optionValue = child.props.value;
    const optionLabel = child.props.children;
    const shouldTranslate =
      typeof optionLabel === "string"
      && (optionValue === undefined || optionValue === "" || optionValue === optionLabel);

    return shouldTranslate
      ? cloneElement(child, undefined, translateNode(optionLabel))
      : child;
  });
}
