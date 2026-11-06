import { invoke } from "./platform";

export async function convertCasPdf(file: File, password: string): Promise<File> {
  if (file.size > 10 * 1024 * 1024) throw new Error("PDF exceeds the 10 MB limit");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  const result = await invoke<{ csv: string; rows: number }>("parse_cas", {
    content: btoa(binary),
    password,
  });
  return new File([result.csv], "cas-transactions.csv", { type: "text/csv" });
}

export async function previewBrokerTrades(
  provider: "kite" | "upstox",
  apiKey: string,
  accessToken: string,
): Promise<File> {
  const result = await invoke<{ csv: string; rows: number }>("preview_broker", {
    provider,
    apiKey,
    accessToken,
  });
  return new File([result.csv], `${provider}-trades.csv`, { type: "text/csv" });
}
