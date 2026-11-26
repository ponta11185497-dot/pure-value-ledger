"use strict";

// 構造化データ(schema.org JSON-LD の Product/Offer)からの決定的な商品抽出。
// AIを使わず、ページに実際に書かれている値のみを読む。見つからなければ空配列を返す
// (「商品が存在しない」と「取得失敗」はこのモジュールの戻り値では区別しない。
//  呼び出し側の collect.js が HTTP ステータス/例外で判定する)。

const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT = "PureValueLedgerBot/1.0 (+https://github.com/ponta11185497-dot/pure-value-ledger)";

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.8" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " " + res.statusText);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractJsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch (e) {
      // 不正なJSON-LDはスキップ(創作で埋めない)
    }
  }
  return blocks;
}

function flattenNodes(node, out) {
  if (!node) return out;
  if (Array.isArray(node)) {
    node.forEach((n) => flattenNodes(n, out));
    return out;
  }
  if (typeof node === "object") {
    out.push(node);
    if (node["@graph"]) flattenNodes(node["@graph"], out);
  }
  return out;
}

function typeMatches(node, typeName) {
  const t = node["@type"];
  if (!t) return false;
  if (Array.isArray(t)) return t.includes(typeName);
  return t === typeName;
}

function normalizeProductNode(node, pageUrl) {
  const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  const price = offer && (offer.price || (offer.priceSpecification && offer.priceSpecification.price));
  const priceNum = price !== undefined && price !== null && price !== "" ? Number(price) : null;
  return {
    name: node.name || null,
    model: node.model || node.sku || null,
    jan: node.gtin13 || node.gtin || null,
    price: Number.isFinite(priceNum) ? priceNum : null,
    availability: offer && offer.availability ? String(offer.availability) : null,
    url: node.url || (offer && offer.url) || pageUrl,
    image: Array.isArray(node.image) ? node.image[0] : node.image || null,
  };
}

// pageUrl を1件取得し、JSON-LD の Product を正規化して返す。
// 戻り値: {items: [...], raw: 取得したJSON-LDブロック数}
async function extractProductsFromUrl(pageUrl) {
  const html = await fetchHtml(pageUrl);
  const blocks = extractJsonLdBlocks(html);
  const nodes = [];
  blocks.forEach((b) => flattenNodes(b, nodes));
  const products = nodes
    .filter((n) => typeMatches(n, "Product"))
    .map((n) => normalizeProductNode(n, pageUrl));
  return { items: products, jsonLdBlockCount: blocks.length };
}

module.exports = { fetchHtml, extractJsonLdBlocks, extractProductsFromUrl };
