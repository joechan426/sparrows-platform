import React from "react";
import {
  DataGrid,
  type DataGridProps,
  type GridValidRowModel,
} from "@mui/x-data-grid";

type SaasDataGridProps<R extends GridValidRowModel = GridValidRowModel> = DataGridProps<R>;

function SaasDataGridInner<R extends GridValidRowModel = GridValidRowModel>(
  props: SaasDataGridProps<R>,
) {
  const { sx, slotProps, ...rest } = props;

  return (
    <DataGrid
      {...rest}
      disableVirtualization={false}
      rowBufferPx={240}
      columnBufferPx={160}
      slotProps={{
        ...slotProps,
        baseTooltip: { enterDelay: 300, ...(slotProps as any)?.baseTooltip },
      }}
      sx={[
        {
          border: 0,
          borderRadius: 2,
          bgcolor: "background.paper",
          "& .MuiDataGrid-columnHeaders": {
            position: "sticky",
            top: 0,
            zIndex: 2,
            bgcolor: "background.paper",
            borderBottom: "1px solid",
            borderColor: "divider",
          },
          "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within": {
            outline: "none",
          },
          "& .MuiDataGrid-row:hover": {
            bgcolor: "action.hover",
            transition: "background-color 120ms ease-out",
          },
          "& .MuiDataGrid-virtualScroller": {
            scrollBehavior: "smooth",
          },
          "& .MuiDataGrid-footerContainer": {
            borderTop: "1px solid",
            borderColor: "divider",
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}

export const SaasDataGrid = React.memo(
  SaasDataGridInner,
) as typeof SaasDataGridInner;

