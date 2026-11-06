import { invoke } from "./platform";
export interface InvestmentPlan {
  id: string;
  name: string;
  accountId: string;
  assetId: string;
  amount: string;
  currency: string;
  startDate: string;
  endDate: string | null;
  dayOfMonth: number;
  paused: boolean;
}
export const getInvestmentPlans = () => invoke<InvestmentPlan[]>("get_investment_plans");
export const saveInvestmentPlans = (plans: InvestmentPlan[]) =>
  invoke<InvestmentPlan[]>("save_investment_plans", { plans });
