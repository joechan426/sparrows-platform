import React from "react";
import Box from "@mui/material/Box";
import {
  List as RefineList,
  Create as RefineCreate,
  Edit as RefineEdit,
  Show as RefineShow,
} from "@refinedev/mui";

export * from "@refinedev/mui";

const pageCardSx = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 2,
  boxShadow: "none",
};

const pageContentSx = {
  p: { xs: 1.5, md: 2 },
};

function mergeSx(base: any, extra: any) {
  if (!extra) return base;
  if (Array.isArray(extra)) return [base, ...extra];
  return [base, extra];
}

export const List: typeof RefineList = (props: React.ComponentProps<typeof RefineList>) => {
  return (
    <RefineList
      {...props}
      wrapperProps={{
        ...props.wrapperProps,
        sx: mergeSx(pageCardSx, props.wrapperProps?.sx),
      }}
      contentProps={{
        ...props.contentProps,
        sx: mergeSx(pageContentSx, props.contentProps?.sx),
      }}
    />
  );
};

export const Create: typeof RefineCreate = (props: React.ComponentProps<typeof RefineCreate>) => {
  return (
    <RefineCreate
      {...props}
      wrapperProps={{
        ...props.wrapperProps,
        sx: mergeSx(pageCardSx, props.wrapperProps?.sx),
      }}
      contentProps={{
        ...props.contentProps,
        sx: mergeSx(pageContentSx, props.contentProps?.sx),
      }}
    />
  );
};

export const Edit: typeof RefineEdit = (props: React.ComponentProps<typeof RefineEdit>) => {
  return (
    <RefineEdit
      {...props}
      wrapperProps={{
        ...props.wrapperProps,
        sx: mergeSx(pageCardSx, props.wrapperProps?.sx),
      }}
      contentProps={{
        ...props.contentProps,
        sx: mergeSx(pageContentSx, props.contentProps?.sx),
      }}
    />
  );
};

export const Show: typeof RefineShow = (props: React.ComponentProps<typeof RefineShow>) => {
  return (
    <RefineShow
      {...props}
      wrapperProps={{
        ...props.wrapperProps,
        sx: mergeSx(pageCardSx, props.wrapperProps?.sx),
      }}
      contentProps={{
        ...props.contentProps,
        sx: mergeSx(pageContentSx, props.contentProps?.sx),
      }}
    />
  );
};

export const SaasFormStack: React.FC<React.PropsWithChildren<{ compact?: boolean }>> = ({
  children,
  compact = false,
}) => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: compact ? 1.25 : 2,
      }}
    >
      {children}
    </Box>
  );
};

