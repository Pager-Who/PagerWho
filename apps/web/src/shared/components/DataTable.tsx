import type { CSSProperties, ReactNode } from "react";

import { useTranslateNode } from "../i18n";
import { cn } from "../utils";

export type DataTableColumn<TRow> = {
  align?: "left" | "center" | "right";
  header: ReactNode;
  key: string;
  render: (row: TRow) => ReactNode;
  width?: CSSProperties["width"];
};

type DataTableProps<TRow> = {
  columns: Array<DataTableColumn<TRow>>;
  emptyState?: ReactNode;
  getRowKey: (row: TRow) => string;
  onRowClick?: (row: TRow) => void;
  rows: TRow[];
  tableMinWidth?: CSSProperties["minWidth"];
};

const alignClass = {
  center: "text-center",
  left: "text-left",
  right: "text-right",
};

export function DataTable<TRow>({
  columns,
  emptyState,
  getRowKey,
  onRowClick,
  rows,
  tableMinWidth,
}: DataTableProps<TRow>) {
  const translateNode = useTranslateNode();

  if (rows.length === 0) {
    return <div className="bg-surface-1 border border-hairline rounded-md p-4.5">{emptyState}</div>;
  }

  return (
    <div className="bg-surface-1 border border-hairline rounded-md min-w-0 max-w-full overflow-x-auto">
      <table
        className={cn("border-collapse table-auto w-full", !tableMinWidth && "min-w-180")}
        style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                className={cn(
                  "border-b border-hairline-soft px-3.5 py-3 text-left align-top text-ink-subtle text-xs font-[650] uppercase",
                  column.align && alignClass[column.align],
                )}
                key={column.key}
                style={column.width ? { width: column.width } : undefined}
              >
                {translateNode(column.header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className={cn(onRowClick && "group cursor-pointer focus-visible:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent")}
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                  return;
                }

                event.preventDefault();
                onRowClick(row);
              } : undefined}
              tabIndex={onRowClick ? 0 : undefined}
            >
              {columns.map((column) => (
                <td
                  className={cn(
                    "border-b border-hairline-soft px-3.5 py-3 text-left align-middle text-ink text-[13px] leading-[1.45] overflow-wrap-anywhere last:border-b-0",
                    onRowClick && "group-hover:bg-white/3.5",
                    column.align && alignClass[column.align],
                  )}
                  key={column.key}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
