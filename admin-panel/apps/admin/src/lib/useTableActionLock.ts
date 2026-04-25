import React from "react";

type RowId = string | number;

const DEFAULT_ANIMATION_WAIT_MS = 1250;
const ERROR_HIGHLIGHT_MS = 2200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useTableActionLock(animationWaitMs: number = DEFAULT_ANIMATION_WAIT_MS) {
  const [isLocked, setIsLocked] = React.useState(false);
  const [activeActionKey, setActiveActionKey] = React.useState<string | null>(null);
  const [processingRowId, setProcessingRowId] = React.useState<RowId | null>(null);
  const [errorRowId, setErrorRowId] = React.useState<RowId | null>(null);

  const begin = React.useCallback((actionKey: string, rowId?: RowId | null) => {
    setErrorRowId(null);
    setIsLocked(true);
    setActiveActionKey(actionKey);
    setProcessingRowId(rowId ?? null);
  }, []);

  const finishSuccess = React.useCallback(async () => {
    await sleep(animationWaitMs);
    setIsLocked(false);
    setActiveActionKey(null);
    setProcessingRowId(null);
  }, [animationWaitMs]);

  const finishError = React.useCallback((rowId?: RowId | null) => {
    setIsLocked(false);
    setActiveActionKey(null);
    setProcessingRowId(null);
    if (rowId != null) {
      setErrorRowId(rowId);
      window.setTimeout(() => setErrorRowId((prev) => (prev === rowId ? null : prev)), ERROR_HIGHLIGHT_MS);
    }
  }, []);

  const runWithLock = React.useCallback(
    async <T,>(actionKey: string, rowId: RowId | null, action: () => Promise<T>): Promise<T | undefined> => {
      if (isLocked) return undefined;
      begin(actionKey, rowId);
      try {
        const result = await action();
        await finishSuccess();
        return result;
      } catch (error) {
        finishError(rowId);
        throw error;
      }
    },
    [begin, finishError, finishSuccess, isLocked],
  );

  const isActionRunning = React.useCallback(
    (actionKey: string) => isLocked && activeActionKey === actionKey,
    [activeActionKey, isLocked],
  );

  const getRowStateClass = React.useCallback(
    (rowId?: RowId | null) => {
      if (rowId == null) return "";
      if (processingRowId === rowId) return "grid-row-processing";
      if (errorRowId === rowId) return "grid-row-error";
      return "";
    },
    [errorRowId, processingRowId],
  );

  return {
    isLocked,
    activeActionKey,
    processingRowId,
    errorRowId,
    begin,
    finishSuccess,
    finishError,
    runWithLock,
    isActionRunning,
    getRowStateClass,
  };
}

