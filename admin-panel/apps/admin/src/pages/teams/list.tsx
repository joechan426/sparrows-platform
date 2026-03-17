import React from "react";
import { List, useDataGrid, EditButton } from "@refinedev/mui";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";

export const TeamList = () => {
  const { dataGridProps } = useDataGrid();

  const columns = React.useMemo<GridColDef[]>(
    () => [
      {
        field: "name",
        headerName: "Team Name",
        flex: 1,
        minWidth: 180,
      },
      {
        field: "createdAt",
        headerName: "Created at",
        width: 180,
        valueGetter: (value: unknown) =>
          value != null && value !== ""
            ? new Date(value as string).toLocaleString()
            : "—",
      },
      {
        field: "actions",
        headerName: "Actions",
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => (
          <EditButton hideText recordItemId={row.id} />
        ),
        width: 80,
      },
    ],
    []
  );

  return (
    <List title="Teams">
      <DataGrid {...dataGridProps} columns={columns} autoHeight />
    </List>
  );
};
