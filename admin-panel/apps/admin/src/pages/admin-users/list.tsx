import React from "react";
import { List, useDataGrid, EditButton } from "@refinedev/mui";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import { Link } from "react-router-dom";

type AdminUserRow = {
  id: string;
  userName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: string[];
};

export const AdminUserList: React.FC = () => {
  const { dataGridProps } = useDataGrid<AdminUserRow>({
    resource: "admin-users",
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
  });

  const columns = React.useMemo<GridColDef[]>(
    () => [
      {
        field: "userName",
        headerName: "User name",
        flex: 1,
        minWidth: 200,
        renderCell: ({ row, value }) => (
          <Box sx={{ position: "relative", width: "100%", height: "100%", minHeight: 52 }}>
            <Box
              component={Link}
              to={`/admin-users/${row.id}/edit`}
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                pl: 1,
                fontWeight: 500,
                textDecoration: "none",
                color: "inherit",
                "&:hover": { backgroundColor: "action.hover" },
              }}
            >
              {value ?? "—"}
            </Box>
          </Box>
        ),
      },
      {
        field: "role",
        headerName: "Role",
        width: 110,
        renderCell: ({ value }) => (
          <Chip label={value} size="small" color={value === "ADMIN" ? "primary" : "default"} />
        ),
      },
      {
        field: "isActive",
        headerName: "Active",
        width: 90,
        type: "boolean",
      },
      {
        field: "permissions",
        headerName: "Modules",
        flex: 1,
        minWidth: 200,
        valueGetter: (value: unknown) =>
          Array.isArray(value) ? (value as string[]).join(", ") : "—",
      },
      {
        field: "createdAt",
        headerName: "Created",
        width: 160,
        valueGetter: (value: unknown) =>
          value != null ? new Date(value as string).toLocaleString() : "—",
      },
      {
        field: "actions",
        headerName: "Actions",
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => <EditButton hideText recordItemId={row.id} />,
        width: 80,
      },
    ],
    []
  );

  return (
    <List title="Admin users">
      <DataGrid {...dataGridProps} columns={columns} autoHeight />
    </List>
  );
};
