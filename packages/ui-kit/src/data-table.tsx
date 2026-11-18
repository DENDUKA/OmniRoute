"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { TableRowActivateEvent, TableRowFocus } from "./table";
import { Search, X } from "lucide-react";
import { resolveLabels } from "./lib/labels";
import { cn } from "./lib/utils";
import { Input } from "./input";
import { SortableTableHead, type DataTableSortDirection } from "./data-table-shell";
import { PaginationControls } from "./pagination-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, type TableDensity, type TableVariant } from "./table";

export type DataTableValue = string | number | boolean | null | undefined;

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  value: (row: Row) => DataTableValue;
  cell?: (row: Row) => ReactNode;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  searchable?: boolean;
  width?: string;
}

/** Interface text of the search and pagination chrome. */
export interface DataTableLabels {
  /** Clear-search button accessible name. */
  clearSearch: string;
  /** Visible count of the rows that match the search. */
  resultCount: (count: number) => string;
  /** Accessible name of the pagination landmark. */
  navigation: string;
  /** Accessible name of a page button. */
  goToPage: (page: number) => string;
  /** Visible text of the previous/next buttons. */
  previous: string;
  next: string;
  /** Accessible name of the previous/next buttons. */
  previousPage: string;
  nextPage: string;
  /** Text alternative of the ellipsis between page buttons. */
  morePages: string;
}
export const defaultDataTableLabels: DataTableLabels = {
  clearSearch: "Clear search",
  resultCount: (count) => `${count} results`,
  navigation: "Pagination",
  goToPage: (page) => `Go to page ${page}`,
  previous: "Previous",
  next: "Next",
  previousPage: "Go to previous page",
  nextPage: "Go to next page",
  morePages: "More pages",
};

export interface DataTableProps<Row> {
  loading?: boolean;
  loadingLabel?: string;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /**
   * Makes the body rows interactive: each one is a tab stop, and this runs with the row on a
   * click and on Enter or Space, but not from a control inside a cell. See `TableRow`.
   */
  onRowActivate?: (row: Row, event: TableRowActivateEvent) => void;
  /**
   * The `rowKey` of the selected row. Every body row then states `aria-selected`; pass `null`
   * while the rows can be selected and none is.
   */
  selectedRowKey?: string | null;
  /**
   * `"roving"` gives the rows that `onRowActivate` makes interactive one tab stop between them,
   * with the arrow keys moving focus from row to row. Defaults to `"each"`. See `Table`.
   */
  rowFocus?: TableRowFocus;
  ariaLabel?: string;
  searchPlaceholder?: string;
  emptyMessage?: ReactNode;
  pageSize?: number;
  initialSort?: { id: string; direction: "asc" | "desc" };
  note?: ReactNode;
  className?: string;
  /** Caps the table height so the rows scroll under a pinned header. See `Table`. */
  maxHeight?: string | number;
  /** Localized interface text; missing or `undefined` keys fall back to defaultDataTableLabels. */
  labels?: Partial<DataTableLabels>;
  /** Row height, cell padding and text size of the table. See `Table`. */
  density?: TableDensity;
  /** `"plain"` drops the frame around the toolbar, table and pagination, for a host that draws it. */
  variant?: TableVariant;
}

function compare(a: DataTableValue, b: DataTableValue) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function DataTable<Row>({
  loading,
  loadingLabel,
  columns,
  rows,
  rowKey,
  onRowActivate,
  selectedRowKey,
  rowFocus,
  ariaLabel = "Data table",
  searchPlaceholder = "Search rows",
  emptyMessage = "No matching results.",
  pageSize = 5,
  initialSort,
  note,
  className,
  maxHeight,
  labels: labelOverrides,
  density,
  variant,
}: DataTableProps<Row>) {
  const labels = resolveLabels(defaultDataTableLabels, labelOverrides);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(initialSort);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const searchable = columns.filter((column) => column.searchable !== false);
    const next = term
      ? rows.filter((row) => searchable.some((column) => String(column.value(row) ?? "").toLocaleLowerCase().includes(term)))
      : [...rows];
    if (!sort) return next;
    const column = columns.find((item) => item.id === sort.id);
    if (!column) return next;
    return next.sort((a, b) => compare(column.value(a), column.value(b)) * (sort.direction === "asc" ? 1 : -1));
  }, [columns, query, rows, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const activePage = Math.min(page, pageCount);
  const visible = filtered.slice((activePage - 1) * pageSize, activePage * pageSize);

  function changeSort(column: DataTableColumn<Row>, direction: DataTableSortDirection) {
    if (column.sortable === false) return;
    setSort({ id: column.id, direction });
    setPage(1);
  }

  return (
    <div data-variant={variant === "plain" ? variant : undefined} className={cn("ci-data-table", className)}>
      <div className="ci-data-table__frame">
        <div className="ci-data-table__toolbar">
          <div className="ci-data-table__search">
            <Search aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
            {query ? <button type="button" onClick={() => setQuery("")} aria-label={labels.clearSearch}><X /></button> : null}
          </div>
          <span className="ci-data-table__count" aria-live="polite">{labels.resultCount(filtered.length)}</span>
        </div>
        <Table aria-label={ariaLabel} loading={loading} loadingLabel={loadingLabel} maxHeight={maxHeight} density={density} rowFocus={rowFocus}>
          <TableHeader>
            <TableRow>
              {columns.map((column) => {
                const active = sort?.id === column.id;
                return column.sortable === false ? (
                  <TableHead
                    key={column.id}
                    style={{ width: column.width }}
                    className={cn(column.align === "right" && "ci-table__head--numeric", column.align === "center" && "ci-table__head--center")}
                  >
                    {column.header}
                  </TableHead>
                ) : (
                  <SortableTableHead
                    key={column.id}
                    style={{ width: column.width }}
                    direction={active ? sort.direction : undefined}
                    defaultDirection="asc"
                    align={column.align === "right" ? "right" : "left"}
                    className={column.align === "center" ? "ci-table__head--center" : undefined}
                    onDirectionChange={(direction) => changeSort(column, direction)}
                  >
                    {column.header}
                  </SortableTableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length ? visible.map((row) => (
              <TableRow
                key={rowKey(row)}
                onActivate={onRowActivate ? (event) => onRowActivate(row, event) : undefined}
                selected={selectedRowKey === undefined ? undefined : rowKey(row) === selectedRowKey}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    className={cn(column.align === "right" && "ci-table__cell--numeric", column.align === "center" && "ci-table__cell--center")}
                  >
                    {column.cell ? column.cell(row) : String(column.value(row) ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={columns.length}><div className="ci-data-table__empty">{emptyMessage}</div></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        {pageCount > 1 ? (
          <div className="ci-data-table__pagination" inert={loading || undefined} aria-hidden={loading || undefined}>
            <PaginationControls
              page={activePage}
              pageCount={pageCount}
              onPageChange={setPage}
              disabled={loading}
              labels={{ navigation: labels.navigation, previous: labels.previous, next: labels.next, previousPage: labels.previousPage, nextPage: labels.nextPage, goToPage: labels.goToPage, morePages: labels.morePages }}
            />
          </div>
        ) : null}
      </div>
      {note ? <p className="ci-data-table__note">{note}</p> : null}
    </div>
  );
}
