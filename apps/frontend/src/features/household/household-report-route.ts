/** Reporting selections do not switch the active database or reload the app. */
export function isHouseholdReportingRoute(pathname: string, search: string): boolean {
  return (
    [
      "/",
      "/dashboard",
      "/insights",
      "/holdings",
      "/activities",
      "/goals",
      "/investment-plans",
    ].includes(pathname.replace(/\/$/, "") || "/") &&
    new URLSearchParams(search).get("memberEdit") !== "1"
  );
}
