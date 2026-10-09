/*
 * Reference copy. This file is not runnable from this repository: it imports modules from the
 * researched.xyz site repository (`@/lib/...`, `@/utils/...`, `@data/...`) and is run inside that
 * repository with `npx tsx docs/outreach/2026-10/compute-stats.ts`. It is published to show how the
 * CSV files were produced.
 *
 * Differences between this script's output and the published files:
 *  - data/vps-plans.csv is the script's output, unmodified.
 *  - data/proxy-prices.csv is the script's output with the columns `promo_code` and
 *    `promo_discount_text` removed. Those columns are not part of this dataset.
 *  - The script also writes a stats.json, which is not published here.
 *  - v2026.10.1: the published CSVs are a clean-up of this output, not the output itself. Columns were renamed
 *    and reordered, internal ids and helper columns dropped, locations translated to English city names,
 *    true/false turned into Yes/No, proxy rows without a price dropped, and non-matching source URLs replaced.
 *    The column lists below describe the raw output.
 */
/**
 * Outreach data study (2026-10): price statistics from the researched.xyz runtime catalog.
 *
 *   npx tsx docs/outreach/2026-10/compute-stats.ts
 *
 * Reads only committed runtime JSON through the same helpers the site uses, so every
 * number matches what a visitor sees in the tables. Writes:
 *   docs/outreach/2026-10/stats.json
 *   docs/outreach/2026-10/dataset/vps-plans.csv
 *   docs/outreach/2026-10/dataset/proxy-prices.csv
 * Nothing in the site code or data is modified.
 */
import fs from 'node:fs';
import path from 'node:path';
import usdRates from '@data/fx/usd-rates.json';
import staticRu from '@data/static_proxy.json';
import staticEn from '@data/static_proxy_en.json';
import residentialRu from '@data/residential_proxy.json';
import residentialEn from '@data/residential_proxy_en.json';
import mobileRu from '@data/mobileproxy.json';
import mobileEn from '@data/mobileproxy-en.json';
import sharedRu from '@data/sharedproxy.json';
import sharedEn from '@data/sharedproxy-en.json';
import {
  getProxyProviders,
  getProxySlug,
  PROXY_TYPE_ORDER,
  type ProxyType,
} from '@/lib/commercial-data';
import { getPromoViews, percentForType, sortPromoViewsByDiscount, type PromoView } from '@/lib/promo-code-data';
import { paymentSummary } from '@/lib/proxy-payments';
import { displayBrandName, localizedVariantLabel, stripVariantSuffix, variantLabels } from '@/lib/provider-brand';
import {
  countryCodeFromName,
  countryNameFromCode,
  isProxyPriceFrom,
  resolveProxyPrice,
  toUsd,
  USD_RATES_AS_OF,
  type ProxyPriceFrom,
} from '@/utils/proxy-price-from';
import { getVpsCountryCandidates, getVpsDataset, queryVpsOffers, type VpsProvider, type VpsQueryFilters } from '@/lib/vps-data';
import { buildVpsOfferCards, hasVpsCryptoPayment, hasVpsRussiaCardPayment, type VpsOfferCard } from '@/lib/vps-offers';
import { getVpsMonthlyRub, getVpsMonthlyUsd, VPS_FX_AS_OF } from '@/lib/vps-price';

const OUT_DIR = path.join(process.cwd(), 'docs', 'outreach', '2026-10');
const DATASET_DIR = path.join(OUT_DIR, 'dataset');
const ALL = 1_000_000; // page size that returns every card in one page

/* ------------------------------------------------------------------ helpers */

const r2 = (v: number) => Math.round(v * 100) / 100;

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function describe(values: number[]) {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return { n: 0, min: null, p25: null, median: null, p75: null, max: null };
  return { n: s.length, min: r2(s[0]), p25: r2(quantile(s, 0.25)), median: r2(quantile(s, 0.5)), p75: r2(quantile(s, 0.75)), max: r2(s[s.length - 1]) };
}

const share = (count: number, total: number) => ({ count, total, share: total ? r2(count / total) : null });

/** Strict Russian-card signal: the provider explicitly lists Mir, SBP (СБП) or SberPay. Same rule as the VPS "РФ карта" filter. */
const RU_CARD_STRICT = /^(mir|sbp|сбп|sberpay)$/i;
const hasRuCardStrict = (methods: string[]) => methods.some((m) => RU_CARD_STRICT.test(m.trim()));
/** Site label on proxy provider pages ("Карты РФ" / "Крипта"), from src/lib/proxy-payments.ts. */
const siteSaysRuPayment = (methods: string[]) => paymentSummary(methods, true).includes('Карты РФ');
const siteSaysCrypto = (methods: string[]) => paymentSummary(methods, true).includes('Крипта');

/** Trial text → kind. Text is the provider's own wording from the catalog (RU). */
function trialKind(text: string | null | undefined): 'none' | 'paid' | 'public_free_list' | 'free_on_request' | 'free' {
  const t = (text || '').trim();
  if (!t || /^(no|нет|none|n\/a|0|-|—)$/i.test(t)) return 'none';
  if (/публичный список/i.test(t)) return 'public_free_list';
  if (/за \$|(^|\s)платн/i.test(t)) return 'paid'; // must not match "бесплатн"
  if (/по запросу|тикет|на почту|в поддержку/i.test(t)) return 'free_on_request';
  return 'free';
}

const AFFILIATE_PARAMS = /^(partner|ref|ref_id|refid|referral|referrer|aff|aff_id|affiliate|from|i|utm_.*|promo|coupon|via|r)$/i;
function cleanUrl(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (/aff\.php$/i.test(u.pathname)) return `${u.origin}/`;
    for (const key of [...u.searchParams.keys()]) if (AFFILIATE_PARAMS.test(key)) u.searchParams.delete(key);
    return u.toString();
  } catch {
    return '';
  }
}

function csv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((row) => columns.map((c) => cell(row[c])).join(','))].join('\n') + '\n';
}

/* -------------------------------------------------------------- proxy rows */

const CATEGORY: Record<ProxyType, { ru: any; en: any; key: string; page: string }> = {
  static: { ru: staticRu, en: staticEn, key: 'staticProxy', page: '/proxy-static' },
  residential: { ru: residentialRu, en: residentialEn, key: 'residentialProxy', page: '/proxy-residential' },
  mobile: { ru: mobileRu, en: mobileEn, key: 'mobileProxy', page: '/proxy-mobile' },
  shared: { ru: sharedRu, en: sharedEn, key: 'sharedProxy', page: '/proxy-shared' },
};

type ProxyRow = {
  type: ProxyType;
  row: string; // catalog key, e.g. "IPRoyal (ISP)"
  brand: string;
  slug: string;
  variant: string | null; // English variant label
  pf: ProxyPriceFrom | null;
  usd: number | null; // base entry price in USD (site conversion)
  countryCodes: string[];
  payments: string[];
  trialRu: string | null;
  trialEn: string | null;
  officialUrl: string;
};

const parityIssues: string[] = [];

function proxyRows(type: ProxyType): ProxyRow[] {
  const cfg = CATEGORY[type];
  const ru = cfg.ru.Data.proxy[cfg.key].tools as Record<string, any>;
  const en = cfg.en.Data.proxy[cfg.key].tools as Record<string, any>;
  return Object.entries(ru).map(([row, tool]) => {
    const toolEn = en[row];
    if (!toolEn) parityIssues.push(`${type}/${row}: missing in EN`);
    else if (JSON.stringify(toolEn.priceFrom) !== JSON.stringify(tool.priceFrom)) parityIssues.push(`${type}/${row}: RU/EN priceFrom differ`);
    const pf = isProxyPriceFrom(tool.priceFrom) ? tool.priceFrom : null;
    const labels = variantLabels(row);
    return {
      type,
      row,
      brand: displayBrandName(stripVariantSuffix(row)),
      slug: getProxySlug(row),
      variant: labels.length ? labels.map((l) => localizedVariantLabel(l, 'en')).join(' ') : null,
      pf,
      usd: resolveProxyPrice(pf, { locale: 'en' }).sortValue,
      countryCodes: ((tool.countries || []) as any[])
        .map((c) => (typeof c === 'string' ? countryCodeFromName(c) : c?.code || countryCodeFromName(c?.name)))
        .filter(Boolean) as string[],
      payments: ((tool.payment || []) as any[]).map((p) => p?.name).filter(Boolean),
      trialRu: tool.demo || null,
      trialEn: toolEn?.demo || null,
      officialUrl: cleanUrl(pf?.sourceUrl || tool.sourceUrls?.[0]),
    };
  });
}

const ROWS: Record<ProxyType, ProxyRow[]> = Object.fromEntries(PROXY_TYPE_ORDER.map((t) => [t, proxyRows(t)])) as any;

const rowView = (r: ProxyRow, usd = r.usd) => ({
  row: r.row,
  brand: r.brand,
  priceUsd: usd === null ? null : r2(usd),
  native: r.pf?.amount != null ? { amount: r.pf.amount, currency: r.pf.currency } : null,
  unit: r.pf?.unit ?? null,
  minQty: r.pf?.minQty ?? null,
  referenceCountry: r.pf?.country ?? null,
  checkedAt: r.pf?.checkedAt ?? null,
});

/** Per-country prices exactly as the category table shows them with the country filter on. */
function countryTable(type: ProxyType, unit: string) {
  const rows = ROWS[type].filter((r) => r.pf?.unit === unit);
  const codes = Array.from(new Set(rows.flatMap((r) => r.countryCodes)));
  return codes.map((code) => {
    const priced = rows
      .filter((r) => r.countryCodes.includes(code))
      .map((r) => {
        const resolved = resolveProxyPrice(r.pf, { locale: 'en', country: code });
        if (resolved.sortValue === null) return null;
        const countrySpecific = typeof r.pf?.byCountry?.[code] === 'number' || r.pf?.country === code;
        return { ...rowView(r, resolved.sortValue), countrySpecific };
      })
      .filter(Boolean) as Array<ReturnType<typeof rowView> & { countrySpecific: boolean }>;
    const listedWithoutPrice = rows.filter((r) => r.countryCodes.includes(code)).length - priced.length;
    priced.sort((a, b) => (a.priceUsd ?? 0) - (b.priceUsd ?? 0));
    const specific = priced.filter((p) => p.countrySpecific);
    return {
      code,
      nameRu: countryNameFromCode(code, 'ru'),
      nameEn: countryNameFromCode(code, 'en'),
      providersListingCountry: priced.length + listedWithoutPrice,
      providersWithPriceShown: priced.length,
      priceUsd: describe(priced.map((p) => p.priceUsd as number)),
      countrySpecificOnly: describe(specific.map((p) => p.priceUsd as number)),
      maxToMinRatio: priced.length > 1 ? r2((priced[priced.length - 1].priceUsd as number) / (priced[0].priceUsd as number)) : null,
      rows: priced,
    };
  }).sort((a, b) => b.providersWithPriceShown - a.providersWithPriceShown || (a.code < b.code ? -1 : 1));
}

/* ------------------------------------------------------------------ promos */

const promoRu = sortPromoViewsByDiscount(getPromoViews('ru').filter((v) => v.category === 'proxy' && v.verified));
const promoEn = new Map(getPromoViews('en').filter((v) => v.category === 'proxy' && v.verified).map((v) => [v.slug, v]));
const promoBySlug = new Map(promoRu.map((v) => [v.slug, v]));

function promoEntry(v: PromoView) {
  const en = promoEn.get(v.slug);
  return {
    slug: v.slug,
    brand: v.brand,
    code: v.code,
    headlineRu: v.discount.headline,
    headlineEn: en?.discount.headline ?? null,
    textRu: v.discount.text,
    textEn: en?.discount.text ?? null,
    percentMax: v.discount.percentMax,
    flatPercent: v.discount.flatPercent,
    segments: v.discount.segments.map((s) => ({ percent: s.percent, scope: s.scope, types: s.types })),
    audience: v.discount.audience,
    proxyTypes: v.proxyTypes,
    verifiedAt: v.verifiedAt,
    expiresAt: v.expiresAt,
    pageRu: `https://researched.xyz/ru/promo/${v.slug}`,
    pageEn: `https://researched.xyz/en/promo/${v.slug}`,
  };
}

/* ------------------------------------------------------- proxy statistics */

function typeStats(type: ProxyType) {
  const rows = ROWS[type];
  const providersRu = getProxyProviders('ru', type);
  const providersEn = new Map(getProxyProviders('en', type).map((p) => [p.slug, p]));
  const units = Array.from(new Set(rows.map((r) => r.pf?.unit).filter(Boolean))) as string[];

  const byUnit = Object.fromEntries(units.map((unit) => {
    const priced = rows.filter((r) => r.pf?.unit === unit && r.usd !== null).sort((a, b) => (a.usd as number) - (b.usd as number));
    // Cheapest row per brand: one number per provider, so ISP/DC twins do not double-count a brand.
    const perBrand = new Map<string, ProxyRow>();
    for (const r of priced) if (!perBrand.has(r.slug)) perBrand.set(r.slug, r);
    const single = priced.filter((r) => (r.pf?.minQty ?? 1) <= 1);
    return [unit, {
      rows: describe(priced.map((r) => r.usd as number)),
      providersCheapestRow: describe([...perBrand.values()].map((r) => r.usd as number)),
      rowsWithoutQuantityMinimum: describe(single.map((r) => r.usd as number)),
      quantityMinimumRows: priced.filter((r) => (r.pf?.minQty ?? 1) > 1).map((r) => rowView(r)),
      cheapest: priced.slice(0, 5).map((r) => rowView(r)),
      mostExpensive: priced.slice(-3).reverse().map((r) => rowView(r)),
      all: priced.map((r) => rowView(r)),
    }];
  }));

  const payments = providersRu.map((p) => ({ slug: p.slug, name: p.name, methods: p.payments }));
  const trials = providersRu.map((p) => ({
    provider: displayBrandName(stripVariantSuffix(p.name)),
    kind: trialKind(p.trial),
    textRu: p.trial,
    textEn: providersEn.get(p.slug)?.trial ?? null,
  }));
  const kinds = trials.reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.kind]: (acc[t.kind] || 0) + 1 }), {});
  const withCode = providersRu.filter((p) => promoBySlug.has(p.slug));
  const typePercents = withCode
    .map((p) => percentForType(promoBySlug.get(p.slug)!.discount, type))
    .filter((v): v is number => v !== null);

  return {
    sitePage: { ru: `https://researched.xyz/ru${CATEGORY[type].page}`, en: `https://researched.xyz/en${CATEGORY[type].page}` },
    catalogRows: rows.length,
    providers: providersRu.length,
    rowsWithPrice: rows.filter((r) => r.usd !== null).length,
    rowsWithoutPrice: rows.filter((r) => r.usd === null).map((r) => ({ row: r.row, status: r.pf?.status ?? 'missing' })),
    units,
    priceUsdByUnit: byUnit,
    payments: {
      crypto: { ...share(payments.filter((p) => siteSaysCrypto(p.methods)).length, payments.length), providers: payments.filter((p) => siteSaysCrypto(p.methods)).map((p) => p.name) },
      ruCardsStrict: { ...share(payments.filter((p) => hasRuCardStrict(p.methods)).length, payments.length), providers: payments.filter((p) => hasRuCardStrict(p.methods)).map((p) => p.name) },
      ruPaymentSiteLabel: share(payments.filter((p) => siteSaysRuPayment(p.methods)).length, payments.length),
      visaMastercard: share(payments.filter((p) => p.methods.some((m) => /^(visa|mastercard)$/i.test(m))).length, payments.length),
      paypal: share(payments.filter((p) => p.methods.some((m) => /^paypal$/i.test(m))).length, payments.length),
    },
    trials: {
      anyTrialListed: share(trials.filter((t) => t.kind !== 'none').length, trials.length),
      freeTrial: share(trials.filter((t) => t.kind === 'free' || t.kind === 'free_on_request').length, trials.length),
      byKind: kinds,
      list: trials,
    },
    promo: {
      providersWithConfirmedCode: share(withCode.length, providersRu.length),
      providers: withCode.map((p) => ({ provider: displayBrandName(stripVariantSuffix(p.name)), code: promoBySlug.get(p.slug)!.code, percentForThisType: percentForType(promoBySlug.get(p.slug)!.discount, type), headline: promoBySlug.get(p.slug)!.discount.headline })),
      percentForThisType: describe(typePercents),
    },
  };
}

/* ---------------------------------------------------------------- VPS data */

const vpsRu = getVpsDataset('ru');
const vpsProvidersById = new Map((vpsRu.providers || []).map((p) => [p.id, p]));
const vpsPayment = (id: string) => vpsProvidersById.get(id)?.paymentMethods || [];

function cardView(c: VpsOfferCard) {
  return {
    provider: c.providerName,
    providerId: c.providerId,
    plan: c.name,
    promoNamedPlan: /promo/i.test(c.name),
    foldedVariants: c.variants.length,
    cpu: c.cpu,
    cpuSharePct: c.cpuShare,
    ramGb: c.ram,
    storage: c.storage,
    traffic: c.traffic,
    bandwidth: c.bandwidth,
    countries: c.countries,
    os: c.os,
    native: c.price,
    priceUsdMonth: c.priceUsd === null ? null : r2(c.priceUsd),
    priceRubMonth: (() => { const v = getVpsMonthlyRub(c.price); return v === null ? null : Math.round(v); })(),
  };
}

const byPrice = (a: VpsOfferCard, b: VpsOfferCard) => (a.priceUsd ?? Infinity) - (b.priceUsd ?? Infinity);
/** Entry config: 1–2 full vCPU and 1–2 GB RAM. Plans sold as a fraction of a core (cpuShare) are excluded. */
const isEntry = (c: VpsOfferCard) => c.cpu >= 1 && c.cpu <= 2 && c.ram >= 1 && c.ram <= 2 && c.cpuShare === null;

function cardSetStats(cards: VpsOfferCard[], providerIds: string[]) {
  const sorted = [...cards].sort(byPrice);
  const entry = sorted.filter(isEntry);
  const ids = Array.from(new Set(providerIds));
  return {
    cards: cards.length,
    providers: ids.length,
    priceUsdMonth: describe(sorted.map((c) => c.priceUsd).filter((v): v is number => v !== null)),
    cheapest: sorted.slice(0, 3).map(cardView),
    entryConfig: {
      definition: '1–2 vCPU (full cores), 1–2 GB RAM',
      priceUsdMonth: describe(entry.map((c) => c.priceUsd).filter((v): v is number => v !== null)),
      providers: new Set(entry.map((c) => c.providerId)).size,
      cheapest: entry.slice(0, 3).map(cardView),
    },
    usdPerGbRam: describe(sorted.filter((c) => c.priceUsd !== null && c.ram > 0).map((c) => (c.priceUsd as number) / c.ram)),
    payments: {
      crypto: share(ids.filter((id) => hasVpsCryptoPayment(vpsPayment(id))).length, ids.length),
      ruCards: share(ids.filter((id) => hasVpsRussiaCardPayment(vpsPayment(id))).length, ids.length),
      paymentsUnknown: ids.filter((id) => vpsPayment(id).length === 0),
    },
  };
}

function vpsCountry(nameRu: string) {
  const q = queryVpsOffers('ru', { country: nameRu }, { page: 1, pageSize: ALL });
  const code = countryCodeFromName(nameRu);
  return { country: nameRu, code, nameEn: code ? countryNameFromCode(code, 'en') : null, ...cardSetStats(q.cards, q.providers.map((p) => p.id)) };
}

function vpsRegion(namesRu: string[]) {
  const candidates = new Set(namesRu.flatMap((n) => getVpsCountryCandidates(n)).map((n) => n.toLowerCase()));
  const providers = (vpsRu.providers || [])
    .map((p) => ({ ...p, plans: p.plans.filter((pl) => pl.countries.some((c) => candidates.has(c.toLowerCase()))) }))
    .filter((p) => p.plans.length) as VpsProvider[];
  const cards = buildVpsOfferCards(providers, [...candidates]);
  return { countries: namesRu, ...cardSetStats(cards, providers.map((p) => p.id)) };
}

/** Task presets copied from src/components/vds-client.tsx (VPS_TASKS); perProvider = cheapest matching plan per provider. */
const VPS_TASKS: Record<string, VpsQueryFilters> = {
  vpn: { minCpu: '1', minRam: '1', minDisk: '10', outsideRu: true },
  telegramBot: { minCpu: '1', minRam: '1', minDisk: '20' },
  website: { minCpu: '2', minRam: '2', minDisk: '40' },
};

function vpsTask(preset: VpsQueryFilters) {
  const q = queryVpsOffers('ru', { ...preset, perProvider: true }, { page: 1, pageSize: ALL, sort: 'price', direction: 'asc' });
  return {
    preset,
    providersMatching: q.cards.length,
    perProviderCheapestUsdMonth: describe(q.cards.map((c) => c.priceUsd).filter((v): v is number => v !== null)),
    cheapest: q.cards.slice(0, 5).map(cardView),
  };
}

function vpsStats() {
  const all = queryVpsOffers('ru', {}, { page: 1, pageSize: ALL });
  const planCountries = Array.from(new Set((vpsRu.providers || []).flatMap((p) => p.plans.flatMap((pl) => pl.countries))));
  const byCountry = planCountries.map(vpsCountry).sort((a, b) => b.cards - a.cards);
  const ids = (vpsRu.providers || []).map((p) => p.id);
  const dates = (vpsRu.providers || []).reduce<Record<string, string[]>>((acc, p) => {
    const d = p.pricingLastSeenAt || p.lastCheckedAt || 'unknown';
    (acc[d] ||= []).push(p.name);
    return acc;
  }, {});
  return {
    sitePage: { ru: 'https://researched.xyz/ru/vps', en: 'https://researched.xyz/en/vps' },
    rawPlans: all.totalPlans,
    visibleCards: all.totalCards,
    providers: all.totalProviders,
    whyFewerCardsThanPlans: 'The /vps list folds plans with the same provider, CPU, RAM, disk, traffic, port and price into one card (regional copies and Linux/Windows twins), see buildVpsOfferCards in src/lib/vps-offers.ts. No plan is hidden by a filter by default.',
    pricingCheckedAt: dates,
    payments: {
      crypto: { ...share(ids.filter((id) => hasVpsCryptoPayment(vpsPayment(id))).length, ids.length), providers: ids.filter((id) => hasVpsCryptoPayment(vpsPayment(id))).map((id) => vpsProvidersById.get(id)!.name) },
      ruCards: { ...share(ids.filter((id) => hasVpsRussiaCardPayment(vpsPayment(id))).length, ids.length), providers: ids.filter((id) => hasVpsRussiaCardPayment(vpsPayment(id))).map((id) => vpsProvidersById.get(id)!.name) },
      both: share(ids.filter((id) => hasVpsCryptoPayment(vpsPayment(id)) && hasVpsRussiaCardPayment(vpsPayment(id))).length, ids.length),
      paymentsUnknown: ids.filter((id) => vpsPayment(id).length === 0).map((id) => vpsProvidersById.get(id)!.name),
    },
    overall: cardSetStats(all.cards, all.providers.map((p) => p.id)),
    // Shown on the site as-is, but $/GB RAM is far outside the catalog range for a small plan: re-check before citing.
    outliersToCheck: all.cards.filter((c) => c.priceUsd !== null && c.ram > 0 && c.ram <= 4 && c.priceUsd / c.ram > 20).map(cardView),
    regions: {
      russia: vpsRegion(['Россия']),
      europe: vpsRegion(['Нидерланды', 'Германия', 'Польша', 'Франция', 'Швеция', 'Финляндия', 'Испания', 'Чехия', 'Великобритания', 'Австрия', 'Италия', 'Швейцария', 'Болгария', 'Латвия', 'Литва', 'Эстония']),
      usa: vpsRegion(['США']),
      asia: vpsRegion(['Сингапур', 'Япония', 'Южная Корея', 'Индия']),
    },
    tasks: Object.fromEntries(Object.entries(VPS_TASKS).map(([k, v]) => [k, vpsTask(v)])),
    byCountry,
  };
}

/* ---------------------------------------------------------------- datasets */

/** Same identity as groupKey in src/lib/vps-offers.ts (not exported there): one visible card. */
function cardKey(providerId: string, plan: any): string {
  const s = plan.specs;
  return JSON.stringify([providerId, s.cpu, s.cpuShare ?? null, s.frequency || '', s.ram, s.storage, s.traffic, s.trafficNote ?? null, s.bandwidth, plan.price.amount, plan.price.currency, plan.price.period ?? 'month']);
}

function vpsCsv(): { csv: string; rows: number; cards: number } {
  const providers = getVpsDataset('en').providers || [];
  const cardIds = new Map<string, string>();
  const groups = new Map<string, any>();
  for (const p of providers) {
    for (const plan of p.plans) {
      const key = cardKey(p.id, plan);
      if (!cardIds.has(key)) cardIds.set(key, `${p.id}:${plan.id}`);
      for (const country of plan.countries) {
        const gk = `${key}|${country}`;
        const checked = plan.pricingLastSeenAt || plan.lastCheckedAt || p.pricingLastSeenAt || null;
        const g = groups.get(gk);
        if (g) {
          if (plan.location && !g.locations.includes(plan.location)) g.locations.push(plan.location);
          if (plan.name !== g.plan && !g.variants.includes(plan.name)) g.variants.push(plan.name);
          if (plan.os && !g.os.includes(plan.os)) g.os.push(plan.os);
          if (checked && (!g.checked_at || checked < g.checked_at)) g.checked_at = checked;
          continue;
        }
        const usd = getVpsMonthlyUsd(plan.price);
        const s = plan.specs;
        groups.set(gk, {
          card_id: cardIds.get(key),
          provider: p.name,
          plan: plan.name,
          variants: [] as string[],
          country,
          country_code: countryCodeFromName(country) || '',
          locations: plan.location ? [plan.location] : [],
          os: plan.os ? [plan.os] : [],
          vcpu: s.cpu,
          cpu_share_pct: s.cpuShare ?? '',
          ram_gb: s.ram,
          storage_gb: s.storageGb ?? '',
          storage_type: s.storageType ?? '',
          traffic_tb: s.unlimitedTraffic ? 'unlimited' : (s.trafficTb ?? ''),
          port_mbps: s.portMbps ?? '',
          price: plan.price.amount,
          currency: plan.price.currency,
          price_period: plan.price.period || 'month',
          price_usd_month: usd === null ? '' : r2(usd),
          payment_crypto: p.paymentMethods.length ? hasVpsCryptoPayment(p.paymentMethods) : '',
          payment_ru_cards: p.paymentMethods.length ? hasVpsRussiaCardPayment(p.paymentMethods) : '',
          payment_methods: p.paymentMethods.join('; '),
          source_url: cleanUrl(plan.sourceUrls?.[0] || (p as any).sourceUrls?.[0]),
          checked_at: checked,
        });
      }
    }
  }
  const rows = [...groups.values()]
    .map((g) => ({ ...g, plan_variants: g.variants.join('; '), location: g.locations.join('; '), os: g.os.join('; ') }))
    .sort((a, b) => (a.price_usd_month || Infinity) - (b.price_usd_month || Infinity) || a.provider.localeCompare(b.provider) || a.country.localeCompare(b.country));
  const columns = ['card_id', 'provider', 'plan', 'plan_variants', 'country', 'country_code', 'location', 'os', 'vcpu', 'cpu_share_pct', 'ram_gb', 'storage_gb', 'storage_type', 'traffic_tb', 'port_mbps', 'price', 'currency', 'price_period', 'price_usd_month', 'payment_crypto', 'payment_ru_cards', 'payment_methods', 'source_url', 'checked_at'];
  return { csv: csv(rows, columns), rows: rows.length, cards: cardIds.size };
}

function proxyCsv(): { csv: string; rows: number } {
  const out: Array<Record<string, unknown>> = [];
  for (const type of PROXY_TYPE_ORDER) {
    for (const r of ROWS[type]) {
      const promo = promoEn.get(r.slug);
      const base = {
        provider: r.brand,
        catalog_row: r.row,
        variant: r.variant ?? '',
        type,
        unit: r.pf?.unit ?? '',
        currency: r.pf?.currency ?? '',
        period_days: r.pf?.periodDays ?? '',
        min_qty: r.pf?.minQty ?? '',
        price_status: r.pf?.status ?? 'missing',
        trial: r.trialEn ?? '',
        payment_crypto: siteSaysCrypto(r.payments),
        payment_ru_cards: hasRuCardStrict(r.payments),
        payment_methods: r.payments.join('; '),
        promo_code: promo?.code ?? '',
        promo_discount_text: promo?.discount.text ?? '',
        official_url: r.officialUrl,
        checked_at: r.pf?.checkedAt ?? '',
      };
      const priceRow = (country: string | null, amount: number | null, scope: string) => ({
        ...base,
        country: country ?? '',
        country_name: country ? countryNameFromCode(country, 'en') ?? '' : '',
        price_scope: scope,
        price_from: amount ?? '',
        price_usd: amount !== null && r.pf?.currency ? r2(toUsd(amount, r.pf.currency)) : '',
      });
      const usable = r.pf && r.pf.status !== 'unavailable' && r.pf.amount !== null ? r.pf : null;
      const byCountry = usable?.byCountry && Object.keys(usable.byCountry).length ? usable.byCountry : null;
      if (!usable) out.push(priceRow(r.pf?.country ?? null, null, 'base'));
      else if (!byCountry) out.push(priceRow(usable.country, usable.amount, usable.country ? 'reference_country' : 'all_countries'));
      else {
        if (usable.country && byCountry[usable.country] === undefined) out.push(priceRow(usable.country, usable.amount, 'reference_country'));
        for (const [code, amount] of Object.entries(byCountry).sort()) out.push(priceRow(code, amount, 'country'));
      }
    }
  }
  const columns = ['provider', 'catalog_row', 'variant', 'type', 'country', 'country_name', 'price_scope', 'price_from', 'unit', 'currency', 'period_days', 'min_qty', 'price_usd', 'price_status', 'trial', 'payment_crypto', 'payment_ru_cards', 'payment_methods', 'promo_code', 'promo_discount_text', 'official_url', 'checked_at'];
  return { csv: csv(out, columns), rows: out.length };
}

/* -------------------------------------------------------------------- main */

function main() {
  const proxy = Object.fromEntries(PROXY_TYPE_ORDER.map((t) => [t, typeStats(t)]));
  const allRows = PROXY_TYPE_ORDER.flatMap((t) => ROWS[t]);
  const checkedDates = allRows.map((r) => r.pf?.checkedAt).filter(Boolean) as string[];
  const dateCounts = checkedDates.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d]: (acc[d] || 0) + 1 }), {});
  const promoList = promoRu.map(promoEntry);
  const percents = promoList.map((p) => p.percentMax).filter((v): v is number => v !== null);
  const vps = vpsStats();
  const mobileTable = countryTable('mobile', 'port');
  const vpsData = vpsCsv();
  const proxyData = proxyCsv();
  if (vpsData.cards !== vps.visibleCards) throw new Error(`card count mismatch: csv ${vpsData.cards} vs site ${vps.visibleCards}`);

  const stats = {
    meta: {
      generatedAt: new Date().toISOString().slice(0, 10),
      script: 'docs/outreach/2026-10/compute-stats.ts',
      source: 'Committed runtime catalog of researched.xyz (data/*.json), read through the site helpers in src/lib and src/utils.',
      fx: { asOf: usdRates.asOf, source: usdRates.source, rubPerUsd: usdRates.rubPerUnit.USD, usdPerEur: usdRates.usdPerUnit.EUR, note: 'Every USD figure uses this fixed Bank of Russia snapshot, exactly like the site.' },
      proxyPriceCheckedAt: { min: checkedDates.sort()[0], max: checkedDates.sort().at(-1), rowsByDate: dateCounts },
      vpsMetadata: { lastCheckedAt: vpsRu.metadata?.lastCheckedAt ?? null, verificationNotes: vpsRu.metadata?.verificationNotes ?? null, fxAsOf: VPS_FX_AS_OF },
      promoConfirmedAt: Array.from(new Set(promoList.map((p) => p.verifiedAt))),
      ruEnPriceParity: parityIssues.length ? parityIssues : 'RU and EN proxy catalogs carry identical priceFrom objects; VPS plan prices are identical across locales.',
      definitions: {
        proxyEntryPrice: 'priceFrom: price of 1 IP (static/shared) or 1 port (mobile) for 30 days, or 1 GB (residential and traffic-billed mobile), on the cheapest public retail plan; "minQty" > 1 means the per-piece price needs that quantity. Wholesale/enterprise tiers are excluded by the catalog.',
        proxyCountryPrice: 'What the category table shows with a country filter: the provider must list the country; a per-country price is used when published, otherwise the flat price applies; providers with per-country pricing but no price for that country show "on website" and are not counted.',
        countrySpecific: 'true when the provider publishes a price for exactly that country (byCountry or its reference country); false when its single flat price is applied.',
        ruCardsStrict: 'Provider explicitly lists Mir, SBP (СБП) or SberPay. Same rule as the site VPS "РФ карта" filter.',
        ruPaymentSiteLabel: 'Proxy provider pages show "Карты РФ" for a wider set (Mir, SBP, T-Bank, YooMoney, YandexPay, Russian payment aggregators such as Freekassa/Robokassa/Interkassa).',
        crypto: 'Proxy: site label "Крипта" (BTC, ETH, USDT, USDC, TON, TRX, LTC, SOL, BNB, Dash, POL, Cryptomus, Cryptobot...). VPS: hasVpsCryptoPayment.',
        trialKinds: 'Derived from the provider\'s own trial text: paid (costs money), public_free_list (provider publishes a free public proxy list, not a trial of the paid product), free_on_request (via ticket/email/support), free (bot, balance credit, promo traffic), none.',
        vpsEntryConfig: '1–2 full vCPU and 1–2 GB RAM; fractional-core plans (cpuShare) excluded.',
        median: 'Linear-interpolated median; p25/p75 the same way.',
      },
    },
    proxy: {
      catalogRowsTotal: allRows.length,
      rowsWithPrice: allRows.filter((r) => r.usd !== null).length,
      uniqueBrands: new Set(allRows.map((r) => r.slug)).size,
      types: proxy,
      mobilePortByCountry: mobileTable,
      mobilePortCountryRanking: mobileTable
        .filter((c) => c.countrySpecificOnly.n >= 4)
        .map((c) => ({ code: c.code, nameRu: c.nameRu, nameEn: c.nameEn, countrySpecificPrices: c.countrySpecificOnly, allShownPrices: c.priceUsd }))
        .sort((a, b) => (a.countrySpecificPrices.median as number) - (b.countrySpecificPrices.median as number)),
      staticIpByCountry: countryTable('static', 'ip').map(({ rows, ...rest }) => ({ ...rest, cheapest: rows.slice(0, 3) })),
      residentialGbByCountry: countryTable('residential', 'gb').map(({ rows, ...rest }) => ({ ...rest, cheapest: rows.slice(0, 3) })),
    },
    promo: {
      hub: { ru: 'https://researched.xyz/ru/promo', en: 'https://researched.xyz/en/promo' },
      confirmedProxyCodes: promoList.length,
      percentMax: describe(percents),
      percentCodes: percents.length,
      // The /promo hub's own rule (bestPercentView): a percentage counts only when the headline is a percentage.
      // This drops volume-price offers such as MangoProxy "$2/GB from 100 GB (-60% off base rate)".
      percentHeadlineCodes: describe(promoList.filter((p) => p.percentMax !== null && /%/.test(p.headlineRu)).map((p) => p.percentMax as number)),
      volumePriceOffers: promoList.filter((p) => p.percentMax !== null && !/%/.test(p.headlineRu)).map((p) => ({ brand: p.brand, code: p.code, textRu: p.textRu, textEn: p.textEn })),
      nonPercentOffers: promoList.filter((p) => p.percentMax === null).map((p) => ({ brand: p.brand, code: p.code, headlineRu: p.headlineRu, headlineEn: p.headlineEn })),
      firstPaymentOnly: promoList.filter((p) => p.audience).map((p) => p.brand),
      list: promoList,
      antidetectCodes: {
        listed: getPromoViews('ru').filter((v) => v.category === 'antidetect').length,
        confirmed: getPromoViews('ru').filter((v) => v.category === 'antidetect' && v.verified).length,
        note: 'Antidetect codes are not owner-confirmed; do not present them as working.',
      },
    },
    vps,
    dataset: {
      dir: 'docs/outreach/2026-10/dataset',
      vpsPlansCsv: { rows: vpsData.rows, distinctCards: vpsData.cards, grain: 'one row per visible /vps card × country' },
      proxyPricesCsv: { rows: proxyData.rows, grain: 'one row per catalog row × country where per-country prices exist' },
    },
  };

  fs.mkdirSync(DATASET_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'stats.json'), `${JSON.stringify(stats, null, 2)}\n`);
  fs.writeFileSync(path.join(DATASET_DIR, 'vps-plans.csv'), vpsData.csv);
  fs.writeFileSync(path.join(DATASET_DIR, 'proxy-prices.csv'), proxyData.csv);
  console.log(`stats.json written; vps-plans.csv ${vpsData.rows} rows (${vpsData.cards} cards); proxy-prices.csv ${proxyData.rows} rows`);
  if (parityIssues.length) console.warn('RU/EN parity issues:', parityIssues);
}

main();
