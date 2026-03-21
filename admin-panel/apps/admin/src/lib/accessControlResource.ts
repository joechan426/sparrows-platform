/**
 * Refine may pass `resource` as a string or as a resource object with `name`.
 */
export function normalizeAccessControlResource(resource: unknown): string {
  if (resource == null) return "";
  if (typeof resource === "string") return resource;
  if (typeof resource === "object" && "name" in resource) {
    const n = (resource as { name?: unknown }).name;
    if (typeof n === "string") return n;
  }
  return "";
}
