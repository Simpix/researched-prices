# VPS and Proxy List Prices by Country

![researched.xyz price dataset](assets/cover.png)

Open dataset of public list prices for VPS/VDS hosting and paid proxies: 603 VPS offers from 25 providers in 32 countries, and 458 proxy price rows (89 catalog rows, 31 brands, 4 proxy types). Prices are as published on each provider's own pricing page between 2026-08-30 and 2026-09-24. Two CSV files, CC BY 4.0.

The always-current version lives at [researched.xyz/en/vps](https://researched.xyz/en/vps) and the proxy pages on the same site ([static](https://researched.xyz/en/proxy-static), [residential](https://researched.xyz/en/proxy-residential), [mobile](https://researched.xyz/en/proxy-mobile), [shared](https://researched.xyz/en/proxy-shared)). This repository is the downloadable, citable, dated snapshot of the same data (release `v2026.10`).

[![License: CC BY 4.0](https://img.shields.io/badge/license-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)
<!-- TODO after the first Zenodo release: add the DOI badge here and `doi:` to CITATION.cff -->

This is a curated list, not the whole market. Providers were selected mostly for relevance to Russian-speaking buyers. Hetzner, DigitalOcean, Contabo and RackNerd are not included (see [Caveats](#caveats)).

## Headline numbers

VPS figures can be reproduced from `data/vps-plans.csv` to within 0.01 USD (CSV prices are rounded to cents): filter to the countries of the region, then remove duplicate `card_id` values.

- 603 distinct VPS offers; median list price 25.16 USD/month (25th percentile 10.31, 75th percentile 66.41).
- Entry-size offers (1-2 full vCPU and 1-2 GB RAM): 146 offers from 22 providers, median 8.35 USD/month (25th to 75th percentile 5.12 to 14.74), lowest 1.77.
- Median entry-size price by region. An offer sold in several regions counts in each.

| Region | Offers | Entry-size offers | Median entry-size, USD/month |
| --- | --- | --- | --- |
| Russia | 281 | 66 | 7.39 |
| Europe (16 countries) | 301 | 64 | 7.02 |
| USA | 115 | 26 | 10.16 |
| Asia (Singapore, Japan, South Korea, India) | 54 | 18 | 10.16 |

- Proxies: 11 of 31 brands publish prices per country (388 country-level rows, 99 countries); the other brands have one price for all countries.

## Grab the data

| If you want | Use |
| --- | --- |
| VPS offers, one row per offer and country | [`data/vps-plans.csv`](data/vps-plans.csv) |
| Proxy entry prices, one row per catalog row and country | [`data/proxy-prices.csv`](data/proxy-prices.csv) |
| Column types for validation or loading | [`datapackage.json`](datapackage.json) (Frictionless Data Package) |
| How the files were generated | [`scripts/compute-stats.ts`](scripts/compute-stats.ts) |
| Citation metadata | [`CITATION.cff`](CITATION.cff), [`.zenodo.json`](.zenodo.json) |
| Kaggle upload metadata | [`kaggle/`](kaggle/) |

```python
import pandas as pd
base = "https://raw.githubusercontent.com/Simpix/researched-prices/main/data/"
vps = pd.read_csv(base + "vps-plans.csv")        # 1,686 rows = offer x country
offers = vps.drop_duplicates("card_id")           # 603 distinct offers
entry = offers[offers.vcpu.between(1, 2) & offers.ram_gb.between(1, 2) & offers.cpu_share_pct.isna()]
print(entry.price_usd_month.median())             # about 8.345 (8.35 on unrounded prices)
```

| File | Rows | Grain |
| --- | --- | --- |
| `vps-plans.csv` | 1,686 | one VPS offer x country (603 offers, 25 providers, 32 countries) |
| `proxy-prices.csv` | 458 | one catalog row x country where per-country prices exist (89 catalog rows, 31 brands) |

## Columns

<details>
<summary><code>vps-plans.csv</code>: 24 columns</summary>

| Column | Type | Meaning |
| --- | --- | --- |
| `card_id` | string | Offer id: provider id and the id of the first merged plan. Repeats across countries. |
| `provider` | string | Provider name. |
| `plan` | string | Plan name as published. |
| `plan_variants` | string, may be empty | Other plan names merged into this offer in this country, joined by "; ". |
| `country` | string | Hosting country (English name). |
| `country_code` | string | ISO 3166-1 alpha-2 code. |
| `location` | string, may be empty | City or datacenter as published, joined by "; ". Free text: city names, airport codes, country codes; 370 rows in Russian. |
| `os` | string, may be empty | OS, only when sold as a separate plan: "Linux", "Linux; Windows". |
| `vcpu` | integer | Number of vCPU. |
| `cpu_share_pct` | integer, may be empty | Guaranteed share of one core, only for fractional-core plans (5 Selectel rows, 10). Empty = full vCPU. |
| `ram_gb` | number | RAM in GB. |
| `storage_gb` | number | Disk size in GB. |
| `storage_type` | string, may be empty | Disk type. Empty when not stated. |
| `traffic_tb` | string, may be empty | TB per month, "unlimited", or empty when not stated. Text type because of "unlimited". |
| `port_mbps` | integer, may be empty | Port speed in Mbit/s. Empty when not published. |
| `price` | number | Price as published, in the provider currency, for price_period. |
| `currency` | string | Currency of price. |
| `price_period` | string | "month", or "day" (11 Beget rows). |
| `price_usd_month` | number | Monthly USD price: daily price x 30, RUB and EUR converted at the fixed 2026-09-24 snapshot, USD as is. |
| `payment_crypto` | boolean, may be empty | Provider lists a cryptocurrency. Empty = methods unknown (WAICORE, 1cent.host), not "no". |
| `payment_ru_cards` | boolean, may be empty | Provider lists Mir, SBP or SberPay (a generic "Bank card" is not counted). Empty = unknown. |
| `payment_methods` | string, may be empty | Provider-level list, joined by "; ". Not checked per plan. |
| `source_url` | string | Official page recorded as the source of the price, no referral parameters. May be a provider or product-family page. |
| `checked_at` | date | Date the price was observed (YYYY-MM-DD). Earliest date if merged plans differ. |

</details>

<details>
<summary><code>proxy-prices.csv</code>: 20 columns</summary>

Each row carries one entry price in a fixed unit: static and shared static, 1 IP for 30 days; mobile, 1 port for 30 days, or 1 GB for traffic-billed products; residential, 1 GB on the cheapest public retail package. Wholesale, enterprise and bulk tiers are not used.

| Column | Type | Meaning |
| --- | --- | --- |
| `provider` | string | Brand name. |
| `catalog_row` | string | Row name in the site catalog with variant suffix, e.g. "IPRoyal (ISP)". Suffixes of shared rows are in Russian. |
| `variant` | string, may be empty | ISP or DC (static rows); static, mobile or residential (shared rows). |
| `type` | string | Catalog table of the row. |
| `country` | string, may be empty | ISO 3166-1 alpha-2 code when the price is tied to a country; empty for all_countries and base rows without one. |
| `country_name` | string, may be empty | English country name. |
| `price_scope` | string | country = exact price published for this country; reference_country = the single published price is for this country; all_countries = one price for all; base = no usable price. |
| `price_from` | number, may be empty | Entry price in the provider currency. Empty when none is published. |
| `unit` | string | What price_from buys: 1 IP, 1 port or 1 GB. Do not compare across units. |
| `currency` | string | Currency of price_from. |
| `period_days` | integer, may be empty | Billing period: 30 for per-IP and per-port prices; mostly empty for per-GB prices. |
| `min_qty` | integer | Minimum quantity for this per-piece price (1 = none), e.g. 100 IPs. |
| `price_usd` | number, may be empty | price_from in USD (RUB at the fixed 2026-09-24 snapshot). Empty when price_from is empty. |
| `price_status` | string | verified = observed on the provider site; manual_review = a price exists but waits for re-check, not given; unavailable = no public price. |
| `trial` | string, may be empty | Trial terms as recorded in the catalog (English); "No" if none. |
| `payment_crypto` | boolean | A cryptocurrency or crypto processor is listed. |
| `payment_ru_cards` | boolean | Mir, SBP or SberPay is listed. |
| `payment_methods` | string | Provider-level list, joined by "; ". Not checked per row. |
| `official_url` | string | Official provider page the price was taken from, no referral parameters. |
| `checked_at` | date, may be empty | Date the price was observed (YYYY-MM-DD). Empty for 2 rows without a usable price. |

</details>

## Methodology

1. **Source.** Each price comes from the provider's public pricing page (Vultr: its public plans API) and is stored with the page URL and the date it was seen. Only publicly priced, spec-complete, fixed VPS plans are kept. Configurable (slider) products, incomplete records, GPU plans and dedicated servers are excluded.
2. **Proxy entry price.** One price per catalog row, in the unit above, on the cheapest public retail plan. If that price needs a minimum quantity, it is in `min_qty`.
3. **Billing period.** VPS prices are monthly except 11 Beget rows billed per day, multiplied by 30 in `price_usd_month`. `price` and `price_period` keep the published figure.
4. **Currency.** `price` and `currency` keep the provider's figure. RUB and EUR are converted to USD at one fixed Bank of Russia snapshot dated 2026-09-24: 84.3969 RUB per USD and 1.1463 USD per EUR ([source](https://www.cbr.ru/scripts/XML_daily.asp)). USD prices are unchanged. It is not a live rate: USD figures for RUB- and EUR-priced plans move with the exchange rate, the published prices do not.
5. **Tax.** No tax adjustment. Whether a displayed price includes VAT depends on the provider's page and is not recorded.
6. **Deduplication of VPS offers.** Plans that are the same product are merged into one offer: same provider, vCPU, CPU share, CPU frequency, RAM, disk, traffic, port speed and price. Typical merges are one SKU sold in several cities, or a Linux and Windows pair at one price. 984 raw plans become 603 offers. `card_id` identifies the offer; `plan_variants` lists the merged names. CPU frequency and traffic notes are not exported, so 33 groups of distinct `card_id` values look identical in the exported columns.
7. **Country split.** Each offer is split by country, giving 1,686 rows. Count offers with `card_id`, not rows.
8. **URLs.** `source_url` and `official_url` point to provider pages. Parameters that look like referral or tracking parameters (`partner`, `ref`, `aff`, `utm_*` and similar) are removed by the script. The ones that remain select a view of the page (`location`, `region`, `billing`, `currency`, `group`, `price_max`, `id`, `tab`, `cat_id`).
9. **Checks.** The generator stops if its offer count differs from the number of cards the site shows (603) and records whether the Russian and English catalogs carry identical prices.

## Caveats

> [!WARNING]
> These are list prices, not offers. Each price is the figure shown on the provider's page on `checked_at`. No discounts, coupons or tax adjustments are applied, and introductory and renewal prices are not separated: the source records hold one price per plan. Check `source_url` before relying on a number.

- **Russian-market skew.** 13 of the 25 VPS providers sell in Russia, which has 281 of the 603 offers. Non-Russian providers in the file are Vultr, netcup, HOSTKEY, Cherry Servers and four OVHcloud NL plans. Not included: Hetzner (its public cloud pages showed every plan as unavailable when checked on 2026-09-22), DigitalOcean, Contabo, RackNerd, Linode/Akamai, AWS, Google Cloud, Azure and the rest of OVHcloud.
- **Flat-price providers inflate country coverage.** Vultr sells the same plan at the same price in up to 19 countries: 647 rows (38%) but 64 of 603 offers. Eight of the 32 countries (Australia, Brazil, Canada, Chile, India, Mexico, South Africa, South Korea) are covered by Vultr alone; 15 countries have exactly one provider. Rows per country show how many places a provider sells in, not market depth.
- **Data dates.** VPS: 23 providers on 2026-08-30, Selectel on 2026-09-22, HOSTKEY on 2026-09-24. Proxies: 79 catalog rows on 2026-09-24, 8 on 2026-08-30, 2 without a date (no usable price). See `checked_at`.
- **Plans named PROMO.** 12 rows (10 offers) are named PROMO by the provider and may be time-limited. They set some of the lowest figures: the 1.77 USD entry-size minimum is a plan named `DE-PROMO`.
- **Prices out of line.** Three VPS offers cost more than 20 USD per GB of RAM at 4 GB or less (TimeWEB `US-15-1000` and `KZ-40`; Firstbyte `MSK-highhdd-KVM-SAS-6`; the TimeWEB `KZ-40` price of 4,230 RUB was confirmed on the official calculator on 2026-10-09). They are kept as recorded and may be errors or special configurations. Re-check at the source.
- **Payment fields.** Payment methods are provider-level, have no per-row source or date and were not re-checked with the prices. An empty cell means unknown, not "no" (WAICORE and 1cent.host: 46 rows).
- **Source page.** `source_url` is the first source page recorded for the plan; for some providers it is a home page or a product-family page.
- **Proxy coverage.** Only Proxy-Sale (Geonix) and ProxySoxy have complete per-country price matrices in the source files. For most brands there is a starting price and, for some, a per-country list; the two do not always match. Three proxy rows have no usable price (Proxy.Market mobile, Proxy.Market shared mobile, Frigate-Proxy shared mobile).
- **Not measured.** Performance, uptime, support quality and top-up fees.

## Cite this dataset

> researched.xyz (2026). *VPS and proxy list prices by country, 2026-10 snapshot* [Data set]. https://github.com/Simpix/researched-prices

```bibtex
@dataset{researched_prices_2026_10,
  author    = {{researched.xyz}},
  title     = {VPS and proxy list prices by country, 2026-10 snapshot},
  year      = {2026},
  version   = {v2026.10},
  publisher = {researched.xyz},
  url       = {https://github.com/Simpix/researched-prices},
  license   = {CC-BY-4.0}
}
```

## License

Data: [CC BY 4.0](LICENSE). You may copy, modify and redistribute it, including commercially, if you credit researched.xyz with a link to https://researched.xyz. Credit line: `Source: researched.xyz, VPS and proxy list prices, 2026-10 snapshot (CC BY 4.0)`.

Code: `scripts/compute-stats.ts` is MIT-licensed ([scripts/LICENSE](scripts/LICENSE)). It is a reference copy; it imports modules from the researched.xyz site repository and does not run on its own.

Compiled by researched.xyz from providers' public pricing pages at the retrieval dates listed in each row. List prices only. This dataset contains no referral links, promo codes or commission fields. researched.xyz may earn referral commission from some providers elsewhere on the site.

## Versions and corrections

Releases are tagged `vYYYY.MM` and listed in [CHANGELOG.md](CHANGELOG.md). There is no fixed update schedule; a new snapshot is published when the catalog is re-checked. Published files are not edited silently: a correction ships as a new release with a changelog entry. To report a wrong price or a missing provider, open an issue with the `card_id` or `catalog_row` and the source page.

## About

[researched.xyz](https://researched.xyz) is a comparison site for VPS and proxy providers.

## Кратко по-русски

Два CSV с публичными ценами на VPS/VDS (1 686 строк: 603 тариф × страна, 25 провайдеров, 32 страны) и прокси (458 строк: 89 строк каталога, 31 бренд). Те же данные показывают таблицы researched.xyz.

- Даты проверки: прокси 24.09.2026 и 30.08.2026, VPS в основном 30.08.2026 (Selectel 22.09, HOSTKEY 24.09). Дата каждой строки в `checked_at`.
- Доллары: фиксированный курс ЦБ РФ на 24.09.2026, 84,3969 ₽ за $1 и 1,1463 $ за €1. Это не текущий курс.
- Входная цена прокси: статические за 1 IP на 30 дней, мобильные за 1 порт на 30 дней (или за 1 ГБ), резидентские за 1 ГБ. Оптовые тарифы не используются.
- `payment_ru_cards`: провайдер явно указывает «Мир», СБП или SberPay. Пустая ячейка значит «неизвестно», а не «нет».
- Ссылки ведут на официальные страницы цен, без реферальных параметров; промокодов в файлах нет.
- Это цены по прайс-листу: цена первого периода и цена продления не разделены.
- Ограничения: каталог отобранный, в основном для русскоязычных покупателей; нет Hetzner, DigitalOcean, Contabo, RackNerd. Vultr даёт 38% строк, потому что один тариф указан сразу в 19 странах, поэтому считайте тарифы по `card_id`. Цены по странам у прокси полные только у Proxy-Sale (Geonix) и ProxySoxy. Часть дешёвых VPS названа PROMO и может быть временной. Три тарифа (два TimeWEB и один Firstbyte) стоят слишком дорого за ГБ памяти и записаны как есть: перепроверьте их у источника.

Лицензия CC BY 4.0, указание источника: researched.xyz со ссылкой на https://researched.xyz.
