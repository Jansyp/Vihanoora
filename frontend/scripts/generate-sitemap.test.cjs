const assert = require("node:assert/strict");
const fs = require("node:fs");
const { escapeXml, safeSlug, STATIC_PATHS, ORIGIN } = require("./generate-sitemap.cjs");

assert.equal(escapeXml(`<>&'\"`), "&lt;&gt;&amp;&apos;&quot;");
{
  assert.equal(safeSlug("rose-gold-chain-2"), true);
  assert.equal(safeSlug("../admin"), false);
  assert.equal(safeSlug("http://localhost"), false);
}
{
  const xml = fs.readFileSync(require("path").join(__dirname, "../public/sitemap.xml"), "utf8");
  assert.match(xml, /^<\?xml[^>]+\?>\s*<urlset/m);
  assert.match(xml, /<loc>https:\/\/vihaanora\.com\//);
  assert.doesNotMatch(xml, /localhost|127\.0\.0\.1|\/admin|\/login|\/account|\/cart|\/checkout|\/api\//i);
  assert.equal((xml.match(/<loc>/g) || []).length, new Set(xml.match(/<loc>(.*?)<\/loc>/g)).size);
  for (const route of STATIC_PATHS) assert.ok(xml.includes(`${ORIGIN}${route}`));
}
{
  const robots = fs.readFileSync(require("path").join(__dirname, "../public/robots.txt"), "utf8");
  assert.match(robots, /User-agent:\s*\*/i);
  assert.match(robots, /Allow:\s*\//i);
  assert.match(robots, /Sitemap:\s*https:\/\/vihaanora\.com\/sitemap\.xml/);
}
console.log("Sitemap and robots checks passed");
