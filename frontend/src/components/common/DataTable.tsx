import type { ReactNode } from "react";

export function DataTable({ heads, children }: { heads: string[]; children: ReactNode }) {
  return (
    <div className="admin-table-wrap data-table-wrap">
      <table className="admin-table data-table">
        <thead>
          <tr>{heads.map((head) => <th key={head}>{head}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
