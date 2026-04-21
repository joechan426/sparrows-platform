import { useEffect, useMemo, useRef, useState } from "react";

type RowAnimState = "add" | "update" | "delete" | null;
type RowId = string | number;
type AnimatedRow<T> = T & { __rowAnim?: RowAnimState };

const ADD_MS = 300;
const UPDATE_MS = 1200;
const DELETE_MS = 350;

function animationClass(state: RowAnimState | undefined): string {
  if (state === "add") return "grid-row-anim-add";
  if (state === "update") return "grid-row-anim-update";
  if (state === "delete") return "grid-row-anim-delete";
  return "";
}

function stableSignature<T>(row: T): string {
  return JSON.stringify(row);
}

export function getRowAnimationClass(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const anim = (row as { __rowAnim?: RowAnimState }).__rowAnim ?? null;
  return animationClass(anim);
}

export function useAnimatedGridRows<T>(
  sourceRows: T[],
  getRowId: (row: T) => RowId,
): AnimatedRow<T>[] {
  const [rows, setRows] = useState<AnimatedRow<T>[]>([]);
  const hasInitializedRef = useRef(false);
  const prevSignatureRef = useRef<Map<RowId, string>>(new Map());
  const timeoutsRef = useRef<number[]>([]);

  const sourceRowsMemo = useMemo(() => sourceRows, [sourceRows]);

  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
      timeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    const nextSignature = new Map<RowId, string>();
    const nextById = new Map<RowId, T>();
    for (const row of sourceRowsMemo) {
      const id = getRowId(row);
      nextById.set(id, row);
      nextSignature.set(id, stableSignature(row));
    }

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      prevSignatureRef.current = nextSignature;
      setRows(sourceRowsMemo.map((row) => ({ ...row, __rowAnim: null })));
      return;
    }

    const prevSignature = prevSignatureRef.current;
    const signaturesUnchanged =
      prevSignature.size === nextSignature.size &&
      [...nextSignature.entries()].every(([id, sig]) => prevSignature.get(id) === sig);
    if (signaturesUnchanged) {
      return;
    }

    const addedIds = new Set<RowId>();
    const updatedIds = new Set<RowId>();
    const deletedIds = new Set<RowId>();

    for (const [id, sig] of nextSignature.entries()) {
      if (!prevSignature.has(id)) {
        addedIds.add(id);
      } else if (prevSignature.get(id) !== sig) {
        updatedIds.add(id);
      }
    }
    for (const id of prevSignature.keys()) {
      if (!nextSignature.has(id)) deletedIds.add(id);
    }

    setRows((previousRows) => {
      const previousOrder = previousRows.map((row) => getRowId(row as unknown as T));
      const previousById = new Map<RowId, AnimatedRow<T>>();
      for (const row of previousRows) {
        previousById.set(getRowId(row as unknown as T), row);
      }

      const result: AnimatedRow<T>[] = [];
      const consumed = new Set<RowId>();

      for (const id of previousOrder) {
        if (deletedIds.has(id)) {
          const oldRow = previousById.get(id);
          if (oldRow) {
            result.push({ ...oldRow, __rowAnim: "delete" });
            consumed.add(id);
          }
          continue;
        }
        const nextRow = nextById.get(id);
        if (!nextRow) continue;
        const anim: RowAnimState = addedIds.has(id)
          ? "add"
          : updatedIds.has(id)
            ? "update"
            : null;
        result.push({ ...nextRow, __rowAnim: anim });
        consumed.add(id);
      }

      for (const row of sourceRowsMemo) {
        const id = getRowId(row);
        if (consumed.has(id)) continue;
        const anim: RowAnimState = addedIds.has(id)
          ? "add"
          : updatedIds.has(id)
            ? "update"
            : null;
        result.push({ ...row, __rowAnim: anim });
      }

      return result;
    });

    if (addedIds.size > 0 || updatedIds.size > 0) {
      const clearAnimId = window.setTimeout(() => {
        setRows((current) =>
          current.map((row) => {
            const id = getRowId(row as unknown as T);
            if (row.__rowAnim === "delete") return row;
            if (!addedIds.has(id) && !updatedIds.has(id)) return row;
            return { ...row, __rowAnim: null };
          }),
        );
      }, Math.max(ADD_MS, UPDATE_MS) + 30);
      timeoutsRef.current.push(clearAnimId);
    }

    if (deletedIds.size > 0) {
      const removeId = window.setTimeout(() => {
        setRows((current) =>
          current.filter((row) => !deletedIds.has(getRowId(row as unknown as T))),
        );
      }, DELETE_MS + 20);
      timeoutsRef.current.push(removeId);
    }

    prevSignatureRef.current = nextSignature;
  }, [sourceRowsMemo, getRowId]);

  return rows;
}
