import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("converter", Path(__file__).with_name("convert-value-research.py"))
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


class ConversionTests(unittest.TestCase):
    def test_redemption_preserves_amount_and_fractional_units(self):
        row = {"Transaction Date": "06-Feb-26", "Scheme Name": "Example Direct Growth",
               "Folio Number": 12345.0, "Transaction Type": "Sell/Redemption",
               "Amount": -123.45, "Units": -1.2345, "NAV": 100, "ISIN": "TEST"}
        result, warning = converter.convert_row(row, "Mutual Funds & SIFs", 14)
        self.assertEqual(result["activityType"], "SELL")
        self.assertEqual(result["quantity"], "1.2345")
        self.assertEqual(result["amount"], "123.45")
        self.assertEqual(result["date"], "2026-02-06")
        self.assertEqual(warning, "")
        self.assertNotIn("account", result)

    def test_missing_ppf_interest_is_not_zero(self):
        row = {"Transaction Type": "Interest Accrued", "Amount": "-"}
        result, reason = converter.convert_row(row, "PPF", 14)
        self.assertIsNone(result)
        self.assertEqual(reason, "Missing transaction amount")

    def test_dividend_does_not_invent_units_or_nav(self):
        row = {"Transaction Date": "06-Feb-26", "Stock/ETF Name": "Example",
               "Demat A/c": "00123", "Transaction Type": "Dividend", "Amount": -50,
               "Quantity": "-", "Price": "-", "Brokerage": "-", "ISIN": "TEST"}
        result, _ = converter.convert_row(row, "Stocks & ETFs", 14)
        self.assertEqual(result["activityType"], "DIVIDEND")
        self.assertEqual(result["quantity"], "")
        self.assertEqual(result["amount"], "50")
        self.assertEqual(result["fee"], "")
        self.assertIn("00123", result["comment"])

    def test_bad_trade_is_rejected(self):
        row = {"Transaction Type": "Purchase", "Amount": 10, "Quantity": 0, "Price": 10}
        with self.assertRaises(ValueError):
            converter.convert_row(row, "Stocks & ETFs", 14)


if __name__ == "__main__":
    unittest.main()
