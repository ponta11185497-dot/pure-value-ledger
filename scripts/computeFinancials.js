"use strict";

// 売却利益・利益率・ANAマイルの決定的な自動計算(AIには計算させない)。
// products.json の purchasePrice(仕入れ可能価格) と、売却見込みの基準値
// (recentSoldPrice直近成約価格 > buybackPrice買取価格 > estimatedResalePrice予想売却価格 の優先順)
// から計算する。元データが未取得(null)の場合は計算せず null のままにする(推測で埋めない)。

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PRODUCTS_PATH = path.join(ROOT, "products.json");

// 既定値(商品ごとに実際の手数料率が判明していれば、そちらを優先して上書きしてよい)。
const DEFAULT_PLATFORM_FEE_RATE = 0.10; // 主要フリマ/オークションの一般的な販売手数料の目安
const ANA_MILES_PER_100YEN = 1.5;

function nowIso() {
  return new Date().toISOString();
}

function field(value, source) {
  return { value: value === undefined ? null : value, source: source || null };
}

function val(f) {
  return f && typeof f === "object" ? f.value : f ?? null;
}

function pickResaleBasis(product) {
  // 価格種別の優先順位: 直近成約価格 > 買取価格 > 予想売却価格
  if (val(product.recentSoldPrice) !== null) return { price: val(product.recentSoldPrice), basisField: "recentSoldPrice" };
  if (val(product.buybackPrice) !== null) return { price: val(product.buybackPrice), basisField: "buybackPrice" };
  if (val(product.estimatedResalePrice) !== null) return { price: val(product.estimatedResalePrice), basisField: "estimatedResalePrice" };
  return null;
}

function computeOne(product) {
  const purchasePrice = val(product.purchasePrice);
  const computedSrc = { siteName: "自動計算(computeFinancials.js)", url: null, fetchedAt: nowIso() };

  // ANAマイル: 仕入れ価格(実際の支払額)から100円=1.5マイルで算出
  if (purchasePrice !== null) {
    const miles = Math.floor((purchasePrice / 100) * ANA_MILES_PER_100YEN);
    if (val(product.anaMiles) !== miles) product.anaMiles = field(miles, computedSrc);
  }

  const resale = pickResaleBasis(product);
  if (purchasePrice === null || !resale) {
    return; // 元データ不足のため利益計算はしない(推測で埋めない)
  }

  const platformFeeValue = val(product.platformFee) !== null
    ? val(product.platformFee)
    : Math.round(resale.price * DEFAULT_PLATFORM_FEE_RATE);
  if (val(product.platformFee) === null) {
    product.platformFee = field(platformFeeValue, { ...computedSrc, siteName: computedSrc.siteName + "(既定手数料率10%を仮定)" });
  }

  const shippingFeeValue = val(product.shippingFee) !== null ? val(product.shippingFee) : 0;
  if (val(product.shippingFee) === null && shippingFeeValue === 0) {
    // 送料が未取得の場合は0円と仮定せず、未取得のままにする(純利益計算には0円仮定を使うが、
    // フィールド自体は「未取得」として残す= 推測値で上書きしない)。
  }

  const netProfit = resale.price - purchasePrice - platformFeeValue - (val(product.shippingFee) || 0);
  const marginPct = purchasePrice > 0 ? Math.round((netProfit / purchasePrice) * 1000) / 10 : null;

  product.estimatedNetProfit = field(netProfit, { ...computedSrc, siteName: computedSrc.siteName + "(基準: " + resale.basisField + ")" });
  product.profitMarginPct = field(marginPct, { ...computedSrc, siteName: computedSrc.siteName + "(基準: " + resale.basisField + ")" });
}

function run() {
  const products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, "utf-8"));
  products.items.forEach(computeOne);
  fs.writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2) + "\n", "utf-8");
  console.log("computeFinancials.js done: " + products.items.length + " items processed");
}

run();
