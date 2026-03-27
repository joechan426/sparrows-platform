import React from "react";
import type {
  GridColDef,
  GridColumnResizeParams,
  GridColumnVisibilityModel,
} from "@mui/x-data-grid";
import { getStoredAdmin } from "./admin-auth";

type PersistedGridPrefs = {
  visibility: GridColumnVisibilityModel;
  widths: Record<string, number>;
};

const EMPTY_PREFS: PersistedGridPrefs = { visibility: {}, widths: {} };

function keyForPage(pageKey: string): string {
  const admin = getStoredAdmin();
  const userId = admin?.id ?? "anonymous";
  return `sparrows_admin_grid_prefs:${userId}:${pageKey}`;
}

function readPrefs(pageKey: string): PersistedGridPrefs {
  try {
    const raw = localStorage.getItem(keyForPage(pageKey));
    if (!raw) return EMPTY_PREFS;
    const parsed = JSON.parse(raw) as PersistedGridPrefs;
    return {
      visibility: parsed?.visibility ?? {},
      widths: parsed?.widths ?? {},
    };
  } catch {
    return EMPTY_PREFS;
  }
}

function writePrefs(pageKey: string, prefs: PersistedGridPrefs): void {
  try {
    localStorage.setItem(keyForPage(pageKey), JSON.stringify(prefs));
  } catch {
    // Ignore storage quota/privacy mode errors.
  }
}

export function useGridPreferences(pageKey: string, columns: GridColDef[]) {
  const [prefs, setPrefs] = React.useState<PersistedGridPrefs>(() =>
    typeof window === "undefined" ? EMPTY_PREFS : readPrefs(pageKey),
  );

  const setAndPersist = React.useCallback(
    (updater: (prev: PersistedGridPrefs) => PersistedGridPrefs) => {
      setPrefs((prev) => {
        const next = updater(prev);
        writePrefs(pageKey, next);
        return next;
      });
    },
    [pageKey],
  );

  const onColumnVisibilityModelChange = React.useCallback(
    (model: GridColumnVisibilityModel) => {
      setAndPersist((prev) => ({ ...prev, visibility: model }));
    },
    [setAndPersist],
  );

  const onColumnWidthChange = React.useCallback(
    (params: GridColumnResizeParams) => {
      const width = Math.round(params.width ?? 0);
      if (!Number.isFinite(width) || width <= 0) return;
      setAndPersist((prev) => ({
        ...prev,
        widths: { ...prev.widths, [params.colDef.field]: width },
      }));
    },
    [setAndPersist],
  );

  const resolvedColumns = React.useMemo(
    () =>
      columns.map((col) => {
        const persistedWidth = prefs.widths[col.field];
        if (!persistedWidth) return col;
        const next: GridColDef = {
          ...col,
          width: persistedWidth,
        };
        // When user manually resizes a flex column, width should win for future visits.
        if ("flex" in next) {
          const { flex: _removedFlex, ...rest } = next as GridColDef & { flex?: number };
          return rest as GridColDef;
        }
        return next;
      }),
    [columns, prefs.widths],
  );

  return {
    columnVisibilityModel: prefs.visibility,
    onColumnVisibilityModelChange,
    onColumnWidthChange,
    columns: resolvedColumns,
  };
}

