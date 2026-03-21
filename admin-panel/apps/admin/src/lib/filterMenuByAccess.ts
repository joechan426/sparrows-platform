import type { TreeMenuItem } from "@refinedev/core";
import { canAccessResource } from "./authProvider";

/**
 * Removes menu branches the current admin cannot access (matches Admin users → Modules).
 */
export function filterMenuItemsByModuleAccess(items: TreeMenuItem[]): TreeMenuItem[] {
  const result: TreeMenuItem[] = [];
  for (const item of items) {
    const name = typeof item.name === "string" ? item.name : "";
    const children = item.children ?? [];
    const hasBranch = children.length > 0;

    if (hasBranch) {
      if (!name || !canAccessResource(name)) continue;
      const filteredKids = filterMenuItemsByModuleAccess(children);
      result.push({ ...item, children: filteredKids });
    } else {
      if (!name || !canAccessResource(name)) continue;
      result.push(item);
    }
  }
  return result;
}
