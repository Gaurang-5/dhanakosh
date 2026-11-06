import { invoke } from "./platform";
import type { AccountScope } from "@/lib/types";
export interface FundConstituent {
  identifier: string;
  name: string;
  sector?: string;
  weightPercent: string;
}
export interface FundComposition {
  assetId: string;
  source: string;
  asOf: string | null;
  fetchedAt: string;
  imported: boolean;
  constituents: FundConstituent[];
  sectorWeights?: { name: string; weightPercent: string }[];
}
export interface ExposurePosition {
  assetId: string;
  accountId: string;
  identifier: string;
  aliases: string[];
  name: string;
  value: string;
  isFund: boolean;
}
export interface ExposureContribution {
  identifier: string;
  name: string;
  assetId: string;
  accountId: string;
  viaFund: string | null;
  source: string | null;
  asOf: string | null;
  value: string;
}
export interface ExposureView {
  currency: string;
  positions: ExposurePosition[];
  snapshots: FundComposition[];
  report: {
    contributions: ExposureContribution[];
    unexpandedValue: string;
    uncoveredFunds: string[];
  };
}
export interface MemberExposure {
  memberId: string;
  memberName: string;
  view: ExposureView;
}
export const getFundExposure = (currency: string, filter: AccountScope) =>
  invoke<ExposureView>("get_fund_exposure", { currency, filter });
export const saveFundComposition = (snapshot: FundComposition) =>
  invoke<FundComposition>("save_fund_composition", { snapshot });
export const refreshFundComposition = (assetId: string) =>
  invoke<FundComposition>("refresh_fund_composition", { assetId });
export const removeFundComposition = (assetId: string) =>
  invoke<void>("remove_fund_composition", { assetId });
export const previewFundComposition = (
  assetId: string,
  source: string,
  asOf: string,
  csvText: string,
) => invoke<FundComposition>("preview_fund_composition", { assetId, source, asOf, csvText });
