import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Label } from "@wealthfolio/ui";
import { convertCasPdf } from "@/adapters";

export function CasImport({ onConverted }: { onConverted: (file: File) => void }) {
  const { t } = useTranslation("activity");
  const [file, setFile] = useState<File>();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function convert() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const csv = await convertCasPdf(file, password);
      setPassword("");
      onConverted(csv);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("import.cas.failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">{t("import.cas.title")}</summary>
      <div className="mt-4 space-y-3">
        <p className="text-muted-foreground text-sm">{t("import.cas.help")}</p>
        <Label htmlFor="cas-pdf">{t("import.cas.file")}</Label>
        <Input
          id="cas-pdf"
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0]);
            setError("");
          }}
        />
        <Label htmlFor="cas-password">{t("import.cas.password")}</Label>
        <Input
          id="cas-password"
          type="password"
          autoComplete="off"
          value={password}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="button" disabled={!file || busy} onClick={() => void convert()}>
          {busy ? t("import.cas.working") : t("import.cas.convert")}
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
