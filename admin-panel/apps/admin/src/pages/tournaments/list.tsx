import React from "react";
import { List, useDataGrid, EditButton } from "@refinedev/mui";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { Link } from "react-router-dom";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

export const TournamentList = () => {
  const { dataGridProps } = useDataGrid();

  const columns = React.useMemo<GridColDef[]>(
    () => [
      {
        field: "name",
        headerName: "Tournament Name",
        flex: 1,
        headerAlign: "left",
        align: "left",
        renderCell: ({ row }) => (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              height: "100%",
            }}
          >
            <Link
              to={`/tournaments/${row.id}`}
              style={{ textDecoration: "none", width: "100%" }}
            >
              <Typography
                color="primary"
                sx={{ fontWeight: 500, textAlign: "left", width: "100%" }}
              >
                {row.name ?? "-"}
              </Typography>
            </Link>
          </Box>
        ),
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
    <List>
      <DataGrid {...dataGridProps} columns={columns} autoHeight />
    </List>
  );
};

