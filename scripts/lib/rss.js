"use strict";

// 簡易 RSS 2.0 / Atom パーサー(外部依存なし、正規表現ベース)。
// タイトル・リンク・公開日のみを決定的に抽出する。商品の価格等はここでは扱わない
// (RSSは新着記事の検知用。詳細はこの後 structured.js 等で商品ページ自体を取得して補う)。

const { fetchHtml } = require("./structured");

function stripCdata(s) {
  if (!s) return s;
  const m = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(s.trim());
  return (m ? m[1] : s).trim();
}

function tagText(block, tag) {
  const re = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i");
  const m = re.exec(block);
  return m ? stripCdata(m[1]) : null;
}

function atomLink(block) {
  const m = /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i.exec(block);
  return m ? m[1] : null;
}

async function fetchFeedEntries(feedUrl) {
  const xml = await fetchHtml(feedUrl);
  const entries = [];

  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    entries.push({
      title: tagText(m[1], "title"),
      link: tagText(m[1], "link"),
      pubDate: tagText(m[1], "pubDate"),
    });
  }
  if (entries.length) return entries;

  const entryRe = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  while ((m = entryRe.exec(xml)) !== null) {
    entries.push({
      title: tagText(m[1], "title"),
      link: atomLink(m[1]),
      pubDate: tagText(m[1], "updated") || tagText(m[1], "published"),
    });
  }
  return entries;
}

module.exports = { fetchFeedEntries };
