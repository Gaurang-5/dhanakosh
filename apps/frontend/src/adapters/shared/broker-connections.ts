import { invoke } from "./platform";

export type DirectBroker = "zerodha" | "icici";
export type BrokerOperation =
  | { action: "status" | "holdings" | "disconnect" }
  | { action: "connect"; apiKey: string; apiSecret: string; loginToken: string };
export interface BrokerConnectionResult {
  configured: boolean;
  holdings: { identifier: string; brokerSymbol: string; quantity: string }[] | null;
  fetchedAt: string | null;
}
export function brokerConnection(
  accountId: string,
  provider: DirectBroker,
  operation: BrokerOperation,
) {
  return invoke<BrokerConnectionResult>("broker_connection", {
    request: { accountId, provider, operation },
  });
}
