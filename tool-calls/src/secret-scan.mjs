import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const RULES = Object.freeze([
  {
    id: "private-key-block",
    expression: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
    allow: () => false
  },
  {
    id: "key-shaped-token",
    expression: /\bsk-[A-Za-z0-9_-]{16,}\b/g,
    allow: (match) => /(?:synthetic|example|placeholder|not-a-real)/i.test(match)
  },
  {
    id: "bearer-credential",
    expression: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
    allow: (match) => /(?:synthetic|example|placeholder|not-a-real|\[REDACTED\])/i.test(match)
  },
  {
    id: "credential-assignment",
    expression:
      /\b(?:DEEPSEEK_API_KEY|OPENAI_API_KEY|API_KEY)\s*[:=]\s*["']?([^"'\s,;}{#]{8,})["']?/gi,
    allow: (match) =>
      /(?:replace|example|placeholder|your[-_ ]?key|changeme|\[REDACTED\]|os\.environ|process\.env|getenv|Deno\.env|Bun\.env)/i.test(
        match
      )
  }
]);

function locate(text, index) {
  const lines = text.slice(0, index).split(/\r?\n/);
  return {
    line: lines.length,
    column: lines.at(-1).length + 1
  };
}

export function scanText(text, { source = "<memory>" } = {}) {
  if (typeof text !== "string") {
    throw new TypeError("Secret scan input must be text.");
  }
  const findings = [];

  for (const rule of RULES) {
    const expression = new RegExp(rule.expression.source, rule.expression.flags);
    for (const match of text.matchAll(expression)) {
      if (rule.allow(match[0])) continue;
      const position = locate(text, match.index);
      findings.push(
        Object.freeze({
          source,
          ruleId: rule.id,
          line: position.line,
          column: position.column
        })
      );
    }
  }
  return findings;
}

export async function scanFiles(paths) {
  if (!Array.isArray(paths)) {
    throw new TypeError("scanFiles expects an array of file paths.");
  }
  const findings = [];
  for (const filePath of paths) {
    const text = await readFile(filePath, "utf8");
    findings.push(...scanText(text, { source: String(filePath) }));
  }
  return findings;
}

async function main() {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    console.error("Usage: node src/secret-scan.mjs <file> [file...]");
    process.exitCode = 2;
    return;
  }
  const findings = await scanFiles(paths);
  if (findings.length > 0) {
    console.error(
      JSON.stringify({ clean: false, findingCount: findings.length, findings }, null, 2)
    );
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ clean: true, scannedFileCount: paths.length }, null, 2));
}

if (
  typeof process !== "undefined" &&
  process.argv?.[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
