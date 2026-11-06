import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Label } from "@wealthfolio/ui";
import { previewBrokerTrades } from "@/adapters";

export function BrokerImport({ onConverted }: { onConverted: (file: File) => void }) {
  const { t } = useTranslation("activity");
  const [provider, setProvider] = useState<"kite" | "upstox">("kite");
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function preview() {
    setBusy(true);
    setError("");
    try {
      onConverted(await previewBrokerTrades(provider, apiKey, token));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("import.broker.failed"));
    } finally {
      setApiKey("");
      setToken("");
      setBusy(false);
    }
  }
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">{t("import.broker.title")}</summary>
      <div className="mt-4 space-y-3">
        <p className="text-muted-foreground text-sm">{t("import.broker.help")}</p>
        <Label htmlFor="broker-provider">{t("import.broker.provider")}</Label>
        <select
          id="broker-provider"
          className="bg-background w-full rounded-md border p-2"
          disabled={busy}
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as "kite" | "upstox");
            setApiKey("");
            setToken("");
            setError("");
          }}
        >
          <option value="kite">Zerodha Kite</option>
          <option value="upstox">Upstox</option>
        </select>
        {provider === "kite" && (
          <>
            <Label htmlFor="kite-key">{t("import.broker.key")}</Label>
            <Input
              id="kite-key"
              type="password"
              autoComplete="off"
              disabled={busy}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </>
        )}
        <Label htmlFor="kite-token">{t("import.broker.token")}</Label>
        <Input
          id="kite-token"
          type="password"
          autoComplete="off"
          disabled={busy}
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <Button
          type="button"
          disabled={(provider === "kite" && !apiKey) || !token || busy}
          onClick={() => void preview()}
        >
          {busy ? t("import.broker.working") : t("import.broker.preview")}
        </Button>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
