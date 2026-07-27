import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(sourceDir, "..");
const inputPath = path.join(rootDir, "article-gutenberg-preupload.html");
const outputPath = path.join(rootDir, "article-gutenberg.html");
const mapPath = path.join(rootDir, "media-map.json");

let article = await readFile(inputPath, "utf8");
const media = JSON.parse(await readFile(mapPath, "utf8"));

for (const [token, item] of Object.entries(media)) {
  article = article
    .replaceAll(`{{${token}_ID}}`, String(item.id))
    .replaceAll(`{{${token}_URL}}`, item.url);
}

const unresolved = [...article.matchAll(/\{\{[A-Z0-9_]+\}\}/g)].map(
  (match) => match[0],
);
if (unresolved.length > 0) {
  throw new Error(`Unresolved placeholders: ${[...new Set(unresolved)].join(", ")}`);
}

await writeFile(outputPath, article, "utf8");
console.log(`Wrote ${outputPath}`);
