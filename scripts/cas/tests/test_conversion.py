import copy
import csv
import importlib.util
import io
import pathlib
import unittest

path = pathlib.Path(__file__).resolve().parents[3] / 'crates/core/src/activities/cas_bridge.py'
spec = importlib.util.spec_from_file_location('cas_bridge', path)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


def statement():
    return {'file_type': 'CAMS', 'cas_type': 'DETAILED', 'folios': [
        {'PAN': 'DEMO', 'folio': '123', 'schemes': [{'amfi': '120503', 'isin': 'TEST',
            'open': '0', 'close': '10', 'close_calculated': '10', 'transactions': [
                {'date': '2026-01-01', 'type': 'PURCHASE_SIP', 'units': '10',
                 'amount': '1000', 'nav': '100', 'balance': '10'}]}]}]}


class ConversionTests(unittest.TestCase):
    def test_native_csv_preserves_identity_and_decimal(self):
        result = bridge.convert(statement())
        row = list(csv.DictReader(io.StringIO(result['csv'])))[0]
        self.assertEqual((result['rows'], row['symbol'], row['activityType'], row['amount']),
                         (1, 'AMFI-120503', 'BUY', '1000'))
        self.assertEqual(result, bridge.convert(statement()))

    def test_bad_candidate_rejects_entire_statement(self):
        for change in ('opening', 'balance', 'closing', 'unknown', 'identity', 'warnings', 'owner'):
            data = statement()
            scheme = data['folios'][0]['schemes'][0]
            if change == 'opening': scheme['open'] = '2'
            if change == 'balance': scheme['transactions'][0]['balance'] = '11'
            if change == 'closing': scheme['close_calculated'] = '11'
            if change == 'unknown': scheme['transactions'][0]['type'] = 'MERGER'
            if change == 'identity': scheme['amfi'] = None
            if change == 'warnings': data['parse_warnings'] = ['bad']
            if change == 'owner':
                second = copy.deepcopy(data['folios'][0]); second['PAN'] = 'OTHER'
                data['folios'].append(second)
            with self.subTest(change=change), self.assertRaises(ValueError):
                bridge.convert(data)

    def test_opening_units_keep_their_quantity_and_no_cost(self):
        data = statement()
        scheme = data['folios'][0]['schemes'][0]
        scheme['open'] = '2'
        scheme['close'] = '10'
        scheme['close_calculated'] = '10'
        scheme['transactions'][0]['units'] = '8'
        scheme['transactions'][0]['balance'] = '10'
        rows = list(csv.DictReader(io.StringIO(bridge.convert(data)['csv'])))
        self.assertEqual(rows[0]['activityType'], 'BUY')
        self.assertEqual(rows[0]['quantity'], '2')
        self.assertEqual(rows[0]['unitPrice'], '')
        self.assertIn('cost unknown', rows[0]['comment'])
        self.assertEqual(rows[1]['quantity'], '8')

    def test_reinvestment_has_income_and_purchase(self):
        data = statement()
        data['folios'][0]['schemes'][0]['transactions'][0]['type'] = 'DIVIDEND_REINVEST'
        rows = list(csv.DictReader(io.StringIO(bridge.convert(data)['csv'])))
        self.assertEqual([r['activityType'] for r in rows], ['DIVIDEND', 'BUY'])

if __name__ == '__main__': unittest.main()
