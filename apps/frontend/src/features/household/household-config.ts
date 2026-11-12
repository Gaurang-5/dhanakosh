import { isWeb } from "@/adapters";

/** Local installation mode keeps hosted Connect and spending disabled.
 * Portfolios and accounts share one workspace; this flag does not select owners.
 */
export function resolveHouseholdMode(webRuntime: boolean, configured?: string): boolean {
  return configured === "true" || (webRuntime && configured !== "false");
}

export const HOUSEHOLD_MODE = resolveHouseholdMode(
  isWeb,
  import.meta.env.VITE_HOUSEHOLD_MODE as string | undefined,
);

export const HOUSEHOLD_NAME = "My wealth";
