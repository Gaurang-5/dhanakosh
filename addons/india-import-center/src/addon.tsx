import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AddonContext, AddonEnableFunction } from "@wealthfolio/addon-sdk";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wealthfolio/ui";
import { FileUp, Globe2, Landmark, ShieldCheck } from "lucide-react";
import { useState } from "react";

// The host owns a single React root per addon and mounts the route `component`
// itself (`createElement(Component, { location })`) with no access to the addon
// context. Capture it at enable time so the route wrapper can hand it down.
// (Do NOT call createRoot yourself — the host manages the lifecycle.)
let addonCtx: AddonContext | undefined;

const sources = [
  {
    name: "Zerodha",
    detail: "Equity tradebook CSV preset in the native importer",
    status: "CSV preset",
  },
  {
    name: "Groww",
    detail: "Stocks and mutual-fund exports",
    status: "Planned",
  },
  {
    name: "CAMS / KFintech",
    detail: "Consolidated mutual-fund statements",
    status: "Planned",
  },
] as const;

function IndiaImportCenter({ ctx }: { ctx: AddonContext }) {
  const [error, setError] = useState<string>();
  const [isSelecting, setIsSelecting] = useState(false);

  const openImporter = async () => {
    setError(undefined);
    setIsSelecting(true);
    try {
      await ctx.api.navigation.navigate("/import");
    } catch {
      setError("Could not open the importer. Open Import from the main navigation.");
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">CSV import</Badge>
          <span className="text-muted-foreground text-sm">Local-first import workflow</span>
        </div>
        <div className="max-w-3xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">India Import Center</h1>
          <p className="text-muted-foreground text-base">
            Use the built-in importer for Indian and global investment CSVs, with field mapping,
            asset review and duplicate checks before confirmation.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="size-5" />
              Import investment CSV
            </CardTitle>
            <CardDescription>
              Choose the owning member and investment account, then select the Zerodha equity, India
              CSV or global CSV preset. Files are processed by your Wealthfolio installation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={openImporter} disabled={isSelecting}>
              {isSelecting ? "Opening…" : "Open import wizard"}
            </Button>

            <Alert>
              <ShieldCheck className="size-4" />
              <AlertDescription>
                Review the exchange, currency and fees before importing. Completed SIP installments
                are BUY transactions. CAMS/KFintech PDF statements are not supported yet.
              </AlertDescription>
            </Alert>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe2 className="size-5" />
              Coverage target
            </CardTitle>
            <CardDescription>
              India imports on top of Dhanakosh's global and multi-currency portfolio.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {["India stocks and mutual funds", "US stocks and ETFs", "UCITS ETF listings"].map(
              (label) => (
                <div key={label} className="bg-muted/50 flex items-center gap-3 rounded-lg p-3">
                  <Landmark className="text-muted-foreground size-4 shrink-0" />
                  <span>{label}</span>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {sources.map((source) => (
          <Card key={source.name}>
            <CardHeader className="gap-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">{source.name}</CardTitle>
                <Badge variant={source.status === "CSV preset" ? "default" : "outline"}>
                  {source.status}
                </Badge>
              </div>
              <CardDescription>{source.detail}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Route component. The sidebar entry + route are declared in manifest.json
// (`contributes.routes` + `contributes.links`), so the host renders navigation
// without booting the addon; this component only runs when the route is first
// visited. The QueryClientProvider reuses this addon's isolated cache across
// route navigations; invalidations/refetches are bridged to the host.
const AddonRoute = () => (
  <QueryClientProvider client={addonCtx!.api.query.getClient() as QueryClient}>
    <IndiaImportCenter ctx={addonCtx!} />
  </QueryClientProvider>
);

const enable: AddonEnableFunction = (ctx) => {
  addonCtx = ctx;

  // The route `id` MUST match `contributes.routes[].id` in manifest.json.
  // The host derives this root path from the manifest addon id.
  ctx.router.add({
    id: "india-import-center",
    path: "/addons/india-import-center",
    component: AddonRoute,
  });

  // The host owns the React root, so there is nothing to unmount here.
  ctx.onDisable(() => {
    addonCtx = undefined;
  });
};

export default enable;
