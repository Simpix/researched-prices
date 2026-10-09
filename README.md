# VPS and Proxy List Prices by Country

![researched.xyz price dataset](assets/cover.png)

Open dataset of public list prices for VPS/VDS hosting and paid proxies: 603 VPS offers from 25 providers in 32 countries, and 455 proxy price rows (86 product lines, 31 brands, 4 proxy types). Prices are as published on each provider's own pricing page between 2026-08-30 and 2026-09-24. Two CSV files, CC BY 4.0.

The always-current version lives at [researched.xyz/en/vps](https://researched.xyz/en/vps) and the proxy pages on the same site ([static](https://researched.xyz/en/proxy-static), [residential](https://researched.xyz/en/proxy-residential), [mobile](https://researched.xyz/en/proxy-mobile), [shared](https://researched.xyz/en/proxy-shared)). This repository is the downloadable, citable, dated snapshot of the same data (release `v2026.10.1`: the prices are those of `v2026.10`; columns, locations and a few source links were cleaned, see [CHANGELOG.md](CHANGELOG.md)).

[![License: CC BY 4.0](https://img.shields.io/badge/license-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23266602.svg)](https://doi.org/10.5281/zenodo.23266602)

This is a curated list, not the whole market. Providers were selected mostly for relevance to Russian-speaking buyers. Hetzner, DigitalOcean, Contabo and RackNerd are not included (see [Caveats](#caveats)).

## Headline numbers

The VPS figures below count the 603 offers of the source list (the site's `/vps` cards: plans with the same provider, vCPU, CPU share, CPU frequency, RAM, disk, traffic, port speed and price are one offer). The CSV has one row per plan and country and no offer id, and it does not export CPU frequency or traffic notes. Collapsing its rows on provider, specs and price gives 569 combinations, so medians computed from the CSV differ slightly from the ones below (snippet in the next section).

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
| VPS plans, one row per plan and country | [`data/vps-plans.csv`](data/vps-plans.csv) |
| Proxy entry prices, one row per product line and country | [`data/proxy-prices.csv`](data/proxy-prices.csv) |
| Column types for validation or loading | [`datapackage.json`](datapackage.json) (Frictionless Data Package) |
| How the files were generated | [`scripts/compute-stats.ts`](scripts/compute-stats.ts) (its output was reshaped into the current columns in v2026.10.1) |
| Citation metadata | [`CITATION.cff`](CITATION.cff), [`.zenodo.json`](.zenodo.json) |
| Kaggle upload metadata | [`kaggle/`](kaggle/) |

```python
import pandas as pd
base = "https://raw.githubusercontent.com/Simpix/researched-prices/main/data/"
vps = pd.read_csv(base + "vps-plans.csv")         # 1,686 rows = plan x country
spec = ["Provider", "vCPU", "RAM (GB)", "Disk (GB)", "Disk type", "Traffic (TB/month)",
        "Port (Mbps)", "Price (original)", "Currency"]
offers = vps.drop_duplicates(spec)                 # 569 distinct provider/spec/price combinations
entry = offers[offers["vCPU"].between(1, 2) & offers["RAM (GB)"].between(1, 2)
               & ~offers["Plan"].str.contains("% vCPU")]   # skip Selectel's 10% shared-core plans
print(entry["Price (USD/month)"].median())         # 8.4 on these 135 combinations (8.35 on the 146 offers)
```

| File | Rows | Grain |
| --- | --- | --- |
| `vps-plans.csv` | 1,686 | one VPS plan x country (603 offers, 25 providers, 32 countries) |
| `proxy-prices.csv` | 455 | one proxy product line x country where per-country prices exist (86 product lines, 31 brands) |

## Columns

<details>
<summary><code>vps-plans.csv</code>: 17 columns</summary>

One row per VPS plan and country. Sorted by `Price (USD/month)`, then provider.

| Column | Type | Meaning |
| --- | --- | --- |
| `Provider` | string | Provider name. |
| `Plan` | string | Plan name as published. When identical plans were merged in one country, the first name is shown. Selectel plans named "Shared ... (10% vCPU)" guarantee 10% of a core. |
| `Country` | string | Hosting country (English name). |
| `City` | string, may be empty | Hosting city in English; several cities are joined by "; ". Empty when the provider names only a country, a country code or a datacenter without a city. For Vultr: the cities in this country from the plan's location list. |
| `vCPU` | integer | Number of vCPU as published. |
| `RAM (GB)` | number | RAM in GB. |
| `Disk (GB)` | number | Disk size in GB. |
| `Disk type` | string, may be empty | NVMe, SSD, HDD, SAS, SAS+SSD or Network SSD. Empty when not stated. |
| `Traffic (TB/month)` | string, may be empty | TB per month as a number, "Unlimited", or empty when not stated. Text type because of "Unlimited". |
| `Port (Mbps)` | integer, may be empty | Port speed in Mbit/s. Empty when not published. |
| `Price (USD/month)` | number | Monthly price in USD, 2 decimals. RUB and EUR are converted at the fixed 2026-09-24 snapshot, USD is as published, Beget's daily price is multiplied by 30. |
| `Price (original)` | number | Monthly price in the provider's currency, as published. Beget publishes a daily price; its 11 rows show 30 times that price. |
| `Currency` | string | Currency of `Price (original)`: RUB, EUR or USD. |
| `Crypto payment` | Yes / No, may be empty | Provider lists a cryptocurrency. Empty = payment methods unknown (WAICORE, 1cent.host), not "No". |
| `Russian cards (Mir/SBP)` | Yes / No, may be empty | Provider lists Mir, SBP or SberPay (a generic "Bank card" is not counted). Empty = unknown. |
| `Pricing page` | string | Official page recorded as the source of the price, no referral parameters. May be a provider or product-family page. |
| `Checked on` | date | Date the price was observed (YYYY-MM-DD). Earliest date if merged plans differ. |

</details>

<details>
<summary><code>proxy-prices.csv</code>: 14 columns</summary>

Each row is one entry price in a fixed unit: static and shared static, 1 IP for 30 days; mobile, 1 port for 30 days, or 1 GB for traffic-billed products; residential, 1 GB on the cheapest public retail package. Wholesale, enterprise and bulk tiers are not used. Sorted by proxy type (Static, Residential, Mobile, Shared), then `Price (USD)`. Prices in different units are not comparable, and Mobile and Shared mix units.

| Column | Type | Meaning |
| --- | --- | --- |
| `Provider` | string | Brand name; the product variant is in brackets, e.g. "IPRoyal (ISP)", "Proxywing (DC)". For Shared proxies the bracket is the kind of proxy: static, mobile or residential. |
| `Proxy type` | string | Static, Residential, Mobile or Shared. |
| `Country` | string | English country name, or "All countries" when the provider has one price for every location. When the provider gives a single price tied to one country, that country is shown. |
| `Price from` | number | Entry price in the provider's currency, as published. |
| `Unit` | string | What the price buys: "per IP", "per port" or "per GB". |
| `Period (days)` | integer, may be empty | Billing period: 30 for per-IP and per-port prices; mostly empty for per-GB prices. |
| `Min. quantity` | integer | Minimum quantity for this per-piece price (1 = none), e.g. 100 IPs. |
| `Price (USD)` | number | `Price from` in USD, 2 decimals (RUB at the fixed 2026-09-24 snapshot). |
| `Currency` | string | Currency of `Price from`: RUB or USD. |
| `Free trial` | string | "No"; "Yes (...)" free trial with its size; "On request (...)" free trial on request; "Paid test (...)" paid trial with its price; "Free proxy list only" = the provider publishes a free proxy list, not a trial of the paid product. |
| `Crypto payment` | Yes / No | A cryptocurrency or crypto processor is listed. |
| `Russian cards (Mir/SBP)` | Yes / No | Mir, SBP or SberPay is listed. |
| `Pricing page` | string | Official provider page the price was taken from, no referral parameters. |
| `Checked on` | date | Date the price was observed (YYYY-MM-DD). |

</details>

## Methodology

1. **Source.** Each price comes from the provider's public pricing page (Vultr: its public plans API) and is stored with the page URL and the date it was seen. Only publicly priced, spec-complete, fixed VPS plans are kept. Configurable (slider) products, incomplete records, GPU plans and dedicated servers are excluded.
2. **Proxy entry price.** One price per product line, in the unit above, on the cheapest public retail plan. If that price needs a minimum quantity, it is in `Min. quantity`.
3. **Billing period.** VPS prices are monthly except 11 Beget rows billed per day, multiplied by 30 in both `Price (USD/month)` and `Price (original)`, so every price in the file is monthly. Beget's published figure is the daily one.
4. **Currency.** `price` and `currency` keep the provider's figure. RUB and EUR are converted to USD at one fixed Bank of Russia snapshot dated 2026-09-24: 84.3969 RUB per USD and 1.1463 USD per EUR ([source](https://www.cbr.ru/scripts/XML_daily.asp)). USD prices are unchanged. It is not a live rate: USD figures for RUB- and EUR-priced plans move with the exchange rate, the published prices do not.
5. **Tax.** No tax adjustment. Whether a displayed price includes VAT depends on the provider's page and is not recorded.
6. **Deduplication of VPS offers.** Plans that are the same product are merged into one offer: same provider, vCPU, CPU share, CPU frequency, RAM, disk, traffic, port speed and price. Typical merges are one SKU sold in several cities, or a Linux and Windows pair at one price. 984 raw plans become 603 offers. CPU frequency and traffic notes are not exported, so 34 of these offers look identical to another one in the exported columns, and the CSV shows 569 distinct provider/spec/price combinations.
7. **Country split.** Each offer is split by country, giving 1,686 rows (plan x country). Rows are not offers: use the 603 above, or the 569 combinations from the snippet.
8. **URLs.** `Pricing page` points to provider pages. Parameters that look like referral or tracking parameters (`partner`, `ref`, `aff`, `utm_*` and similar) are removed by the script. The ones that remain select a view of the page (`location`, `region`, `billing`, `currency`, `group`, `price_max`, `id`, `tab`, `cat_id`). A country-specific page is used only for the country it is about: the Proxy-Seller static price list was recorded with its German page for 7 countries, and in v2026.10.1 the 6 non-German rows point to the Proxy-Seller home page instead.
9. **Readable columns (v2026.10.1).** Internal ids and helper columns of v2026.10 (`card_id`, `plan_variants`, `os`, `cpu_share_pct`, `price_period`, `catalog_row`, `price_scope`, `price_status`, `payment_methods`) are dropped; locations are translated to English city names; Yes/No replaces true/false; proxy rows without a published price (3 product lines) are dropped.
10. **Checks.** The generator stops if its offer count differs from the number of cards the site shows (603) and records whether the Russian and English catalogs carry identical prices.

## Caveats

> [!WARNING]
> These are list prices, not offers. Each price is the figure shown on the provider's page on `Checked on`. No discounts, coupons or tax adjustments are applied, and introductory and renewal prices are not separated: the source records hold one price per plan. Check `Pricing page` before relying on a number.

- **Russian-market skew.** 13 of the 25 VPS providers sell in Russia, which has 281 of the 603 offers. Non-Russian providers in the file are Vultr, netcup, HOSTKEY, Cherry Servers and four OVHcloud NL plans. Not included: Hetzner (its public cloud pages showed every plan as unavailable when checked on 2026-09-22), DigitalOcean, Contabo, RackNerd, Linode/Akamai, AWS, Google Cloud, Azure and the rest of OVHcloud.
- **Flat-price providers inflate country coverage.** Vultr sells the same plan at the same price in up to 19 countries: 647 rows (38%) but 64 of 603 offers. Eight of the 32 countries (Australia, Brazil, Canada, Chile, India, Mexico, South Africa, South Korea) are covered by Vultr alone; 15 countries have exactly one provider. Rows per country show how many places a provider sells in, not market depth.
- **Data dates.** VPS: 23 providers on 2026-08-30, Selectel on 2026-09-22, HOSTKEY on 2026-09-24. Proxies: 78 product lines on 2026-09-24 and 8 on 2026-08-30. See `Checked on`.
- **Plans named PROMO.** 12 rows (10 offers) are named PROMO by the provider and may be time-limited. They set some of the lowest figures: the 1.77 USD entry-size minimum is a plan named `DE-PROMO`.
- **Prices out of line.** Three VPS offers cost more than 20 USD per GB of RAM at 4 GB or less (TimeWEB `US-15-1000` and `KZ-40`; Firstbyte `MSK-highhdd-KVM-SAS-6`; the TimeWEB `KZ-40` price of 4,230 RUB was confirmed on the official calculator on 2026-10-09). They are kept as recorded and may be errors or special configurations. Re-check at the source.
- **Payment fields.** Payment methods are provider-level, have no per-row source or date and were not re-checked with the prices. An empty cell means unknown, not "no" (WAICORE and 1cent.host: 46 rows).
- **Source page.** `Pricing page` is the first source page recorded for the plan; for some providers it is a home page or a product-family page. Many Russian-market providers publish prices only on Russian-language pages.
- **Cities.** `City` is translated from the provider's wording. Vultr's location list is per plan, not per country, so its cities are those of the plan's list that lie in the row's country. Plans without a city in the source (country or country-code lists only, 418 rows) have it empty.
- **Proxy coverage.** Only Proxy-Sale (Geonix) and ProxySoxy have complete per-country price matrices in the source files. For most brands there is a starting price and, for some, a per-country list; the two do not always match. Three product lines have no usable public price and are not in the file (Proxy.Market mobile, Proxy.Market shared mobile, Frigate-Proxy shared mobile).
- **Free trial.** The wording is the catalog's, shortened. "Yes (3 GB)" (Asocks and SX.org, 4 rows) is not open to everyone: the catalog records it as available only with a code from the provider, and no code is given in this dataset.
- **Not measured.** Performance, uptime, support quality and top-up fees.

## Cite this dataset

> researched.xyz (2026). *VPS and proxy list prices by country, 2026-10 snapshot* [Data set]. https://github.com/Simpix/researched-prices

```bibtex
@dataset{researched_prices_2026_10,
  author    = {{researched.xyz}},
  title     = {VPS and proxy list prices by country, 2026-10 snapshot},
  year      = {2026},
  version   = {v2026.10.1},
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

Releases are tagged `vYYYY.MM` (`vYYYY.MM.N` for a correction to a month's release) and listed in [CHANGELOG.md](CHANGELOG.md). There is no fixed update schedule; a new snapshot is published when the catalog is re-checked. Published files are not edited silently: a correction ships as a new release with a changelog entry. To report a wrong price or a missing provider, open an issue with the provider, plan (or proxy type), country and the pricing page.

## About

[researched.xyz](https://researched.xyz) is a comparison site for VPS and proxy providers.

## Кратко по-русски

Два CSV с публичными ценами на VPS/VDS (1 686 строк: 603 тариф × страна, 25 провайдеров, 32 страны) и прокси (455 строк: 86 линеек продуктов, 31 бренд). Те же данные показывают таблицы researched.xyz. Версия v2026.10.1: понятные названия колонок, города по-английски, исправлены ссылки на источники.

- Даты проверки: прокси 24.09.2026 и 30.08.2026, VPS в основном 30.08.2026 (Selectel 22.09, HOSTKEY 24.09). Дата каждой строки в колонке `Checked on`.
- Доллары: фиксированный курс ЦБ РФ на 24.09.2026, 84,3969 ₽ за $1 и 1,1463 $ за €1. Это не текущий курс.
- Входная цена прокси: статические за 1 IP на 30 дней, мобильные за 1 порт на 30 дней (или за 1 ГБ), резидентские за 1 ГБ. Оптовые тарифы не используются.
- `Russian cards (Mir/SBP)`: провайдер явно указывает «Мир», СБП или SberPay. Пустая ячейка значит «неизвестно», а не «нет».
- Ссылки ведут на официальные страницы цен, без реферальных параметров; промокодов в файлах нет.
- Это цены по прайс-листу: цена первого периода и цена продления не разделены.
- Ограничения: каталог отобранный, в основном для русскоязычных покупателей; нет Hetzner, DigitalOcean, Contabo, RackNerd. Vultr даёт 38% строк, потому что один тариф указан сразу в 19 странах; строка в CSV это тариф × страна, а не отдельный тариф (на сайте 603 тарифа, в CSV 569 различных сочетаний провайдера, характеристик и цены). Цены по странам у прокси полные только у Proxy-Sale (Geonix) и ProxySoxy. Часть дешёвых VPS названа PROMO и может быть временной. Три тарифа (два TimeWEB и один Firstbyte) стоят слишком дорого за ГБ памяти и записаны как есть: перепроверьте их у источника.

Лицензия CC BY 4.0, указание источника: researched.xyz со ссылкой на https://researched.xyz.
