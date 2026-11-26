"use strict";

// 決定的(AI不使用)な収集オーケストレーター。
// sources.json の collectMethod に応じて:
//   - "parser"     : scripts/parsers/<source.id>.js があれば実行(サイト専用パーサー)
//   - "structured" : ページのJSON-LD(schema.org Product)を取得・抽出
//   - "rss"        : フィード本文から記事リンクを取得(商品抽出はAI側に委ねる)
//   - "api"        : 現時点では未実装(ログに記録してAI側待ちにはしない=明示的に失敗扱い)
//   - "ai-webfetch": ここでは処理せず ai_queue.json に積んで、後続のAIステップに渡す
//
// 取得0件の場合でも「商品が実在しない(empty_confirmed)」と「取得処理自体が失敗(fetch_failed)」
// を必ず区別して collection_log.json に記録する。

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCES_PATH = path.join(ROOT, "sources.json");
const PRODUCTS_PATH = path.join(ROOT, "products.json");
const LOG_PATH = path.join(ROOT, "collection_log.json");
const AI_QUEUE_PATH = path.join(ROOT, "ai_queue.json");

const { extractProductsFromUrl } = require("./lib/structured");
const { fetchFeedEntries } = require("./lib/rss");

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (e) {
    return fallback;
  }
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function nowIso() {
  return new Date().toISOString();
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9ぁ-んァ-ヶ一-龥]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function field(value, source) {
  return { value: value === undefined ? null : value, source: source || null };
}

function makeSourceRef(siteName, url) {
  return { siteName, url, fetchedAt: nowIso() };
}

function upsertProductFromStructured(products, source, rawItem) {
  if (!rawItem.name) return null; // 商品名なしは創作防止のため登録しない
  const id = "p-" + slugify(source.id) + "-" + slugify(rawItem.model || rawItem.name);
  const srcRef = makeSourceRef(source.note || source.id, rawItem.url || source.value);

  let product = products.items.find((p) => p.id === id);
  const isNew = !product;
  if (!product) {
    product = {
      id,
      name: rawItem.name,
      model: rawItem.model || null,
      jan: rawItem.jan || null,
      images: rawItem.image ? [rawItem.image] : [],
      definitivePrice: field(null, null),
      purchasePrice: field(rawItem.price, srcRef),
      buybackPrice: field(null, null),
      recentSoldPrice: field(null, null),
      estimatedResalePrice: field(null, null),
      platformFee: field(null, null),
      shippingFee: field(null, null),
      estimatedNetProfit: field(null, null),
      profitMarginPct: field(null, null),
      anaMiles: field(null, null),
      reservationStart: field(null, null),
      applicationDeadline: field(null, null),
      winnerAnnounceDate: field(null, null),
      paymentDate: field(null, null),
      shipDate: field(null, null),
      purchasableQty: field(null, null),
      visaPayment: field(null, null),
      homeDelivery: field(null, null),
      officialUrl: rawItem.url || source.value,
      status: "unknown",
      priceHistory: [],
      firstSeenAt: nowIso(),
      lastSeenAt: nowIso(),
    };
    products.items.push(product);
  } else {
    product.lastSeenAt = nowIso();
    if (rawItem.price !== null && rawItem.price !== product.purchasePrice.value) {
      product.purchasePrice = field(rawItem.price, srcRef);
      product.priceHistory.push({ date: nowIso(), field: "purchasePrice", value: rawItem.price, source: srcRef });
    }
  }
  return { id, isNew };
}

async function processStructuredSource(source, products) {
  const { items, jsonLdBlockCount } = await extractProductsFromUrl(source.value);
  let newCount = 0;
  items.forEach((raw) => {
    const r = upsertProductFromStructured(products, source, raw);
    if (r && r.isNew) newCount++;
  });
  return {
    resultType: items.length > 0 ? "ok" : jsonLdBlockCount > 0 ? "empty_confirmed" : "empty_confirmed",
    fetchedCount: items.length,
    newItemCount: newCount,
    failedCount: 0,
    errorDetail: items.length === 0 ? "JSON-LD Product が見つからなかった(" + jsonLdBlockCount + "個のJSON-LDブロック中)" : null,
  };
}

async function processRssSource(source, aiQueue) {
  const entries = await fetchFeedEntries(source.value);
  if (entries.length > 0) {
    aiQueue.push({
      sourceId: source.id,
      note: source.note,
      collectMethod: "rss-leads",
      leads: entries.slice(0, 20).map((e) => ({ title: e.title, link: e.link })),
    });
  }
  return {
    resultType: entries.length > 0 ? "ok" : "empty_confirmed",
    fetchedCount: entries.length,
    newItemCount: 0, // 商品化はAIステップで判断するため、ここでは新規件数0
    failedCount: 0,
    errorDetail: null,
  };
}

async function run() {
  const sources = readJson(SOURCES_PATH, []);
  const products = readJson(PRODUCTS_PATH, { generatedAt: null, schemaVersion: 1, items: [] });
  const log = readJson(LOG_PATH, { lastRunAt: null, entries: [] });
  const aiQueue = [];

  const activeSources = sources.filter((s) => (s.status || "active") === "active");

  for (const source of activeSources) {
    const method = source.collectMethod || "ai-webfetch";
    let result;
    try {
      if (method === "parser") {
        const parserPath = path.join(ROOT, "scripts", "parsers", source.id + ".js");
        if (fs.existsSync(parserPath)) {
          const parserMod = require(parserPath);
          result = await parserMod.collect(source, products);
        } else {
          result = {
            resultType: "fetch_failed",
            fetchedCount: 0,
            newItemCount: 0,
            failedCount: 1,
            errorDetail: "collectMethod=parser だが scripts/parsers/" + source.id + ".js が未実装",
          };
        }
      } else if (method === "structured") {
        result = await processStructuredSource(source, products);
      } else if (method === "rss") {
        result = await processRssSource(source, aiQueue);
      } else if (method === "api") {
        result = {
          resultType: "fetch_failed",
          fetchedCount: 0,
          newItemCount: 0,
          failedCount: 1,
          errorDetail: "collectMethod=api の専用コネクタは未実装",
        };
      } else {
        // ai-webfetch: ここでは処理せず、AIステップに委ねる
        aiQueue.push({ sourceId: source.id, note: source.note, url: source.value, collectMethod: "ai-webfetch" });
        result = {
          resultType: "pending_ai",
          fetchedCount: 0,
          newItemCount: 0,
          failedCount: 0,
          errorDetail: null,
        };
      }
    } catch (e) {
      result = {
        resultType: "fetch_failed",
        fetchedCount: 0,
        newItemCount: 0,
        failedCount: 1,
        errorDetail: String(e && e.message ? e.message : e),
      };
    }

    const existingIdx = log.entries.findIndex((en) => en.sourceId === source.id);
    const entry = {
      sourceId: source.id,
      siteName: source.note || source.value,
      collectMethod: method,
      lastRunAt: nowIso(),
      ...result,
    };
    if (existingIdx >= 0) log.entries[existingIdx] = entry;
    else log.entries.push(entry);
  }

  log.lastRunAt = nowIso();
  products.generatedAt = nowIso().slice(0, 10);

  writeJson(PRODUCTS_PATH, products);
  writeJson(LOG_PATH, log);
  writeJson(AI_QUEUE_PATH, aiQueue);

  console.log(
    "collect.js done: " +
      activeSources.length +
      " sources processed, " +
      aiQueue.length +
      " queued for AI step, " +
      products.items.length +
      " products in products.json"
  );
}

run().catch((e) => {
  console.error("collect.js failed:", e);
  process.exit(1);
});
