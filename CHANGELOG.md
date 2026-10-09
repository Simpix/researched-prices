# Changelog

Published files are not edited after release. A correction ships as a new release and is listed here.

## v2026.10.1 - 2026-10-09

Readable columns, English locations, source URL fixes. No price, date or provider changed.

- Both CSVs: human-readable headers (`Provider`, `Price (USD/month)`, `Pricing page`, `Checked on`, ...). Internal ids and helper columns dropped: `card_id`, `plan_variants`, `os`, `cpu_share_pct`, `price_period`, `catalog_row`, `price_scope`, `price_status`, `payment_methods`, `country_code`. true/false became Yes/No, empty still means unknown.
- `data/vps-plans.csv`: 1,686 rows, 17 columns. `City` replaces the free-text `location`: English city names only (Russian place names translated, country prefixes, port speeds and airport or country-code lists removed). Beget's 11 daily prices are shown as monthly in `Price (original)` (30 times the daily price), matching the USD column. Without `card_id`, offers can no longer be counted from the CSV (603 offers on the site, 569 distinct provider/spec/price combinations in the file).
- `data/proxy-prices.csv`: 455 rows, 14 columns (3 rows without a published price dropped: Proxy.Market mobile, Proxy.Market shared mobile, Frigate-Proxy shared mobile). Variant is part of `Provider` ("Proxywing (ISP)"), `Country` is "All countries" when one price covers every location, `Unit` reads "per IP", "per GB" or "per port", and `Free trial` is shortened plain English.
- Source URL fixes: 6 Proxy-Seller static rows (France, Netherlands, Russia, Ukraine, United Kingdom, United States) pointed to the German page `proxy-seller.com/german-proxy/`; they now link the Proxy-Seller home page. The German row keeps its page. A scan of all proxy and VPS rows found no other page that names a different country.
- `datapackage.json`, `kaggle/` metadata, `README.md`: column dictionary, counts, examples and checksums updated.

## v2026.10 - 2026-10-09

First release.

- `data/vps-plans.csv`: 1,686 rows (603 offers, 25 providers, 32 countries). Prices observed 2026-08-30 (23 providers), 2026-09-22 (Selectel), 2026-09-24 (HOSTKEY).
- `data/proxy-prices.csv`: 458 rows (89 catalog rows, 31 brands, 4 proxy types). Prices observed 2026-09-24 (79 catalog rows) and 2026-08-30 (8 catalog rows).
- RUB and EUR converted to USD at the Bank of Russia snapshot of 2026-09-24 (84.3969 RUB per USD, 1.1463 USD per EUR).
