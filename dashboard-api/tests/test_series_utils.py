from datetime import datetime, timedelta, timezone
import unittest

from fastapi import HTTPException

from app.routers.series_utils import (
    MAX_COMPARE_STATIONS,
    compare_points_per_station,
    parse_station_codes,
    resolve_range,
    validate_station_code,
)


class ResolveRangeTest(unittest.TestCase):

    def test_normalizes_naive_datetimes_to_utc(self):
        to = datetime.now(timezone.utc).replace(tzinfo=None)
        from_ = to - timedelta(days=1)

        resolved_from, resolved_to = resolve_range(from_, to)

        self.assertEqual(timezone.utc, resolved_from.tzinfo)
        self.assertEqual(timezone.utc, resolved_to.tzinfo)

    def test_rejects_ranges_longer_than_31_days(self):
        to = datetime.now(timezone.utc)

        with self.assertRaises(HTTPException) as context:
            resolve_range(to - timedelta(days=32), to)

        self.assertEqual(422, context.exception.status_code)

    def test_rejects_future_ranges(self):
        now = datetime.now(timezone.utc)

        with self.assertRaises(HTTPException) as context:
            resolve_range(now, now + timedelta(hours=1))

        self.assertEqual(422, context.exception.status_code)


class StationFilterTest(unittest.TestCase):

    def test_deduplicates_and_validates_station_codes(self):
        self.assertEqual(
            ["ST-ONE-01", "ST_TWO_02"],
            parse_station_codes("ST-ONE-01, ST_TWO_02,ST-ONE-01"),
        )
        self.assertEqual("ST-ONE-01", validate_station_code("ST-ONE-01"))

    def test_rejects_invalid_or_excessive_station_filters(self):
        with self.assertRaises(HTTPException):
            parse_station_codes("ST-OK-01,../../invalid")

        too_many = ",".join(f"ST-{index:02d}" for index in range(MAX_COMPARE_STATIONS + 1))
        with self.assertRaises(HTTPException):
            parse_station_codes(too_many)

    def test_caps_total_comparison_points(self):
        self.assertEqual(480, compare_points_per_station(1500, 25))
        self.assertEqual(1500, compare_points_per_station(1500, 2))


if __name__ == "__main__":
    unittest.main()
