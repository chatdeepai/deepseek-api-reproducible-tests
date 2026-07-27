/**
 * Render Visual 08 from privacy-audited live evidence.
 *
 * The renderer fails closed. Missing, malformed, unreconciled, or unsafe
 * evidence removes any stale Visual 08 SVG/PNG plus its manifest entry.
 *
 * Runtime dependency: sharp.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const visualsDir = path.dirname(sourceDir);
const rootDir = path.dirname(visualsDir);
const resultsDir = path.join(rootDir, "results");
const fixturesDir = path.join(rootDir, "fixtures");

const basename = "08-deepseek-v4-live-evaluation-dashboard";
const pngPath = path.join(visualsDir, `${basename}.png`);
const svgPath = path.join(visualsDir, `${basename}.svg`);
const manifestPath = path.join(visualsDir, "manifest.json");

const summaryPath = path.join(resultsDir, "live-summary.json");
const privacyPath = path.join(resultsDir, "live-privacy-audit.json");
const planPath = path.join(fixturesDir, "live-plan.json");
const planHashPath = path.join(resultsDir, "live-plan-hash.json");
const pricingPath = path.join(fixturesDir, "pricing-snapshot.json");

const width = 1600;
const height = 900;

const colors = {
  bg0: "#071524",
  bg1: "#0a1b2c",
  panel: "#10283f",
  panelDark: "#0b2034",
  band: "#0d2633",
  line: "#284d68",
  teal: "#2dd4c6",
  blue: "#5ea8ff",
  purple: "#a78bfa",
  green: "#43df88",
  amber: "#ffbd22",
  coral: "#ff6b81",
  white: "#f7f9fc",
  muted: "#afc0d5",
  softBlue: "#112e4b",
  softPurple: "#252545",
  softAmber: "#332b16",
};

const altText =
  "Sanitized DeepSeek V4 application evaluation dashboard showing the " +
  "bounded case set, contract checks, RAG and tool results, run count and " +
  "single-observation limitations, token usage, estimated cost, release " +
  "decision, and privacy audit";

class GateError extends Error {}

function requireGate(condition, message) {
  if (!condition) throw new GateError(message);
}

function readJson(filePath) {
  requireGate(fs.existsSync(filePath), `Required evidence file is missing: ${path.basename(filePath)}`);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new GateError(`Required evidence file is malformed: ${path.basename(filePath)}`);
  }
  requireGate(value && typeof value === "object" && !Array.isArray(value), "JSON root must be an object");
  return value;
}

function nested(value, ...keys) {
  let current = value;
  for (const key of keys) {
    requireGate(
      current && typeof current === "object" && Object.hasOwn(current, key),
      `Missing required evidence field: ${keys.join(".")}`,
    );
    current = current[key];
  }
  return current;
}

function exactUtcDisplay(value) {
  requireGate(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value),
    "Study timestamp is not exact UTC",
  );
  return value.replace("T", " ").replace("Z", " UTC");
}

function grouped(value) {
  requireGate(Number.isInteger(value), "Expected an integer display value");
  return new Intl.NumberFormat("en-US").format(value);
}

function endpoint(value) {
  requireGate(typeof value === "number" && Number.isFinite(value), "Invalid interval endpoint");
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function labelFromIdentifier(value) {
  requireGate(typeof value === "string" && value.length > 0, "Expected a non-empty identifier");
  return value.replaceAll("_", " ").replaceAll("-", " ").toUpperCase();
}

function scaledInteger(value, decimalPlaces) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  requireGate(Boolean(match), `Invalid exact decimal: ${value}`);
  const sign = match[1] === "-" ? -1n : 1n;
  const fraction = match[3] ?? "";
  requireGate(fraction.length <= decimalPlaces, `Decimal exceeds ${decimalPlaces} places: ${value}`);
  const digits = `${match[2]}${fraction.padEnd(decimalPlaces, "0")}`;
  return sign * BigInt(digits);
}

function reconcile(summary, privacy, plan, planHash, pricing) {
  requireGate(summary.status === "complete", "Live study is not complete");
  for (const flag of [
    "not_a_general_model_benchmark",
    "not_a_reliability_measurement",
    "not_an_sla",
  ]) {
    requireGate(summary[flag] === true, `Missing publication boundary: ${flag}`);
  }

  requireGate(privacy.passed === true, "Privacy audit did not pass");
  requireGate(privacy.issue_count === 0, "Privacy audit reports issues");
  requireGate(
    privacy.issue_code_counts &&
      typeof privacy.issue_code_counts === "object" &&
      Object.keys(privacy.issue_code_counts).length === 0,
    "Privacy issue-code counts are not empty",
  );
  for (const [key, value] of Object.entries(privacy)) {
    if (key.endsWith("_published")) {
      requireGate(value === false, `Privacy publication gate failed: ${key}`);
    }
  }

  const retention = nested(summary, "retention");
  requireGate(retention.synthetic_fixture_inputs_public === true, "Fixture policy mismatch");
  for (const [key, value] of Object.entries(retention)) {
    if (key !== "synthetic_fixture_inputs_public") {
      requireGate(value === false, `Unsafe retention flag: ${key}`);
    }
  }

  const models = summary.exact_models_tested;
  requireGate(
    Array.isArray(models) &&
      models.length === new Set(models).size &&
      models.every((model) => typeof model === "string" && model.length > 0),
    "Exact model inventory is invalid",
  );
  requireGate(
    JSON.stringify(models) === JSON.stringify([plan.baseline_model, plan.candidate_model]),
    "Tested models do not match the frozen plan",
  );

  const method = nested(summary, "method");
  const cases = plan.cases;
  const observations = summary.observations;
  requireGate(Array.isArray(cases) && cases.length > 0, "Frozen plan has no cases");
  requireGate(Array.isArray(observations) && observations.length > 0, "Summary has no observations");
  requireGate(
    method.planned_provider_requests === plan.planned_provider_requests,
    "Planned request count does not match the frozen plan",
  );
  requireGate(
    plan.planned_provider_requests === plan.provider_request_cap,
    "Frozen request reservation does not equal its cap",
  );
  requireGate(
    method.observed_provider_requests === observations.length,
    "Observed request count does not match observation count",
  );
  requireGate(
    method.observed_provider_requests <= plan.provider_request_cap,
    "Provider request cap was exceeded",
  );
  for (const key of ["concurrency", "automatic_retries", "timeout_ms"]) {
    requireGate(method[key] === plan[key], `Method drift detected: ${key}`);
  }
  requireGate(
    summary.plan_sha256 === planHash.digest_hex,
    "Summary plan digest does not match the frozen-plan digest",
  );
  requireGate(cases.length === observations.length, "Frozen and observed case counts differ");
  cases.forEach((planned, index) => {
    const observed = observations[index];
    for (const key of ["sequence", "task_id", "variant", "model"]) {
      requireGate(
        planned[key] === observed[key],
        `Observed case order differs from frozen plan at ${key}`,
      );
    }
    requireGate(observed.provider_payload_retained === false, "Raw payload retained");
    requireGate(observed.provider_identifiers_retained === false, "Provider identifier retained");
    requireGate(observed.raw_error_retained === false, "Raw error retained");
  });

  const variants = nested(summary, "variants");
  for (const variantName of ["baseline", "candidate"]) {
    const variant = nested(variants, variantName);
    const rows = observations.filter((item) => item.variant === variantName);
    requireGate(variant.case_count === rows.length, `${variantName} case count does not reconcile`);
    requireGate(
      variant.pass_count === rows.filter((item) => item.passed === true).length,
      `${variantName} pass count does not reconcile`,
    );
    requireGate(
      variant.fail_count === rows.filter((item) => item.passed !== true).length,
      `${variantName} fail count does not reconcile`,
    );
  }

  const paired = nested(summary, "paired_regression");
  const pairTaskIds = [...new Set(cases.map((item) => item.task_id))];
  requireGate(Array.isArray(paired.pairs), "Paired regression records are missing");
  requireGate(paired.pair_count === pairTaskIds.length, "Pair count does not reconcile");
  requireGate(
    JSON.stringify([...new Set(paired.pairs.map((item) => item.task_id))].sort()) ===
      JSON.stringify([...pairTaskIds].sort()),
    "Paired task inventory does not match the frozen plan",
  );
  requireGate(
    paired.wins + paired.losses + paired.ties === paired.pair_count,
    "Paired outcomes do not reconcile",
  );

  const usage = nested(summary, "usage_and_estimated_cost");
  const overall = nested(usage, "overall");
  for (const field of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
    const observedTotal = observations.reduce(
      (sum, item) => sum + nested(item, "usage")[field],
      0,
    );
    requireGate(overall[field] === observedTotal, `Overall ${field} does not reconcile`);
  }
  requireGate(
    overall.prompt_tokens + overall.completion_tokens === overall.total_tokens,
    "Overall token arithmetic does not reconcile",
  );

  requireGate(usage.snapshot_id === pricing.snapshot_id, "Price snapshot mismatch");
  requireGate(usage.currency === pricing.currency, "Pricing currency mismatch");
  requireGate(pricing.models && typeof pricing.models === "object", "Pricing model table missing");
  let calculatedCostPicoUsd = 0n;
  for (const item of observations) {
    const rates = pricing.models[item.model];
    requireGate(rates && typeof rates === "object", `Missing dated price for ${item.model}`);
    const itemUsage = nested(item, "usage");
    calculatedCostPicoUsd +=
      BigInt(itemUsage.prompt_cache_hit_tokens) *
        scaledInteger(rates.input_cache_hit_per_million_usd, 6) +
      BigInt(itemUsage.prompt_cache_miss_tokens) *
        scaledInteger(rates.input_cache_miss_per_million_usd, 6) +
      BigInt(itemUsage.completion_tokens) * scaledInteger(rates.output_per_million_usd, 6);
  }
  requireGate(
    calculatedCostPicoUsd === scaledInteger(overall.estimated_cost_usd, 12),
    "Estimated cost does not reconcile to the dated price snapshot",
  );
  const variantCostPicoUsd = Object.values(nested(usage, "variants")).reduce(
    (sum, value) => sum + scaledInteger(value.estimated_cost_usd, 12),
    0n,
  );
  requireGate(
    variantCostPicoUsd === scaledInteger(overall.estimated_cost_usd, 12),
    "Variant costs do not reconcile to overall estimated cost",
  );
  requireGate(usage.estimate_not_bill === true, "Cost boundary is missing");

  const baselineInterval = nested(paired, "baseline_rate_interval");
  const candidateInterval = nested(paired, "candidate_rate_interval");
  requireGate(paired.small_sample === true, "Small-sample flag is missing");
  requireGate(
    baselineInterval.interpretation === "small_sample_wide_interval" &&
      candidateInterval.interpretation === "small_sample_wide_interval",
    "Small-sample interval interpretation is missing",
  );
  requireGate(
    baselineInterval.low === candidateInterval.low &&
      baselineInterval.high === candidateInterval.high,
    "Model Wilson intervals differ and need separate display",
  );

  const releaseGate = nested(summary, "release_gate");
  requireGate(
    releaseGate.policy_class === "illustrative_local_policy",
    "Release decision is not labeled as illustrative local policy",
  );

  const timeoutSeconds = method.timeout_ms / 1000;
  requireGate(Number.isFinite(timeoutSeconds), "Timeout cannot be converted to seconds");
  const timestamp = exactUtcDisplay(summary.completed_at_utc);
  const caption =
    `Sanitized live evidence from ${timestamp}. Values are bounded observations ` +
    "from the frozen application test plan, not a general DeepSeek benchmark, " +
    "reliability measurement, or SLA.";

  return {
    timestamp,
    models,
    baseline: variants.baseline,
    candidate: variants.candidate,
    paired,
    pairTaskIds,
    overall,
    currency: usage.currency,
    snapshotId: usage.snapshot_id,
    method,
    timeoutSeconds,
    privacyIssues: privacy.issue_count,
    releaseDecision: labelFromIdentifier(releaseGate.decision),
    caption,
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildSvg(values) {
  const svg = [];
  const add = (value) => svg.push(value);
  const rect = (x, y, w, h, fill, stroke = null, radius = 0, strokeWidth = 1) => {
    add(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}"` +
        (stroke ? ` stroke="${stroke}" stroke-width="${strokeWidth}"` : "") +
        "/>",
    );
  };
  const line = (x1, y1, x2, y2, color, strokeWidth = 2) => {
    add(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ` +
        `stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    );
  };
  const circle = (cx, cy, radius, fill) => {
    add(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}"/>`);
  };
  const text = (
    x,
    y,
    value,
    size,
    color,
    { bold = false, anchor = "start", mono = false, letterSpacing = 0 } = {},
  ) => {
    const family = mono
      ? "Cascadia Mono, Consolas, monospace"
      : "Inter, Segoe UI, Arial, sans-serif";
    add(
      `<text x="${x}" y="${y}" fill="${color}" font-family="${family}" ` +
        `font-size="${size}" font-weight="${bold ? 800 : 500}" text-anchor="${anchor}" ` +
        `letter-spacing="${letterSpacing}">${escapeXml(value)}</text>`,
    );
  };
  const pill = (x, y, w, h, value, color, size = 14, fill = colors.panelDark) => {
    rect(x, y, w, h, fill, color, h / 2, 2);
    text(x + w / 2, y + h / 2 + size * 0.34, value, size, color, {
      bold: true,
      anchor: "middle",
    });
  };
  const modelCard = (x, title, model, cases, passes, color) => {
    rect(x, 330, 350, 180, colors.panel, color, 22, 2);
    pill(x + 24, 350, 122, 34, title, color, 14);
    text(x + 24, 420, model, 24, colors.white, { bold: true, mono: true });
    line(x + 24, 444, x + 326, 444, colors.line);
    text(x + 24, 482, `${grouped(cases)} CASES`, 15, colors.muted, { bold: true });
    text(x + 326, 482, `${grouped(passes)} / ${grouped(cases)} PASSES`, 17, colors.green, {
      bold: true,
      anchor: "end",
    });
  };

  const title = "DeepSeek V4 Bounded Evaluation Study";
  const description =
    "Privacy-audited live evidence from a frozen application acceptance test, " +
    "including models, contract passes, paired outcomes, token usage, cost, " +
    "method controls, and publication boundaries.";

  add(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" role="img" ` +
      'aria-labelledby="visual-title visual-description">',
  );
  add(`<title id="visual-title">${escapeXml(title)}</title>`);
  add(`<desc id="visual-description">${escapeXml(description)}</desc>`);
  add("<defs>");
  add('<linearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">');
  add(`<stop offset="0%" stop-color="${colors.bg0}"/>`);
  add(`<stop offset="100%" stop-color="${colors.bg1}"/>`);
  add("</linearGradient>");
  add("</defs>");
  rect(0, 0, width, height, "url(#bgGradient)");
  add('<circle cx="1460" cy="-30" r="340" fill="#142d49" opacity="0.55"/>');
  add('<circle cx="25" cy="930" r="340" fill="#0b303c" opacity="0.55"/>');

  rect(72, 52, 790, 44, "#0b2b35", "#20707b", 22, 2);
  text(96, 81, "CHAT-DEEP.AI  |  LIVE EVIDENCE  |  PRIVACY-AUDITED", 20, colors.teal, {
    bold: true,
  });
  text(72, 168, title, 48, colors.white, { bold: true });
  text(72, 211, `Sanitized live evidence completed ${values.timestamp}`, 24, colors.muted);
  rect(72, 227, 1456, 4, colors.teal, null, 2);

  rect(72, 250, 1456, 58, colors.softAmber, colors.amber, 18, 2);
  text(
    800,
    286,
    "BOUNDED OBSERVATION ONLY  |  NOT A GENERAL BENCHMARK  |  NOT A RELIABILITY MEASUREMENT  |  NOT AN SLA",
    18,
    colors.amber,
    { bold: true, anchor: "middle" },
  );

  modelCard(
    72,
    "BASELINE",
    values.models[0],
    values.baseline.case_count,
    values.baseline.pass_count,
    colors.blue,
  );
  modelCard(
    442,
    "CANDIDATE",
    values.models[1],
    values.candidate.case_count,
    values.candidate.pass_count,
    colors.purple,
  );

  rect(812, 330, 716, 180, colors.band, colors.teal, 22, 2);
  text(840, 363, "REQUEST CONTROL + PAIRED REGRESSION", 17, colors.teal, { bold: true });
  text(
    840,
    418,
    `${grouped(values.method.observed_provider_requests)} / ${grouped(values.method.planned_provider_requests)}`,
    36,
    colors.white,
    { bold: true },
  );
  text(840, 450, "OBSERVED / PLANNED REQUESTS", 13, colors.muted, { bold: true });
  line(1108, 382, 1108, 460, colors.line);
  text(
    1140,
    418,
    `${grouped(values.paired.wins)} / ${grouped(values.paired.losses)} / ${grouped(values.paired.ties)}`,
    36,
    colors.white,
    { bold: true },
  );
  text(1140, 450, "WINS / LOSSES / TIES", 13, colors.muted, { bold: true });
  const interval = values.paired.baseline_rate_interval;
  pill(
    840,
    466,
    660,
    30,
    `SMALL-SAMPLE WILSON INTERVAL  ${endpoint(interval.low)} - ${endpoint(interval.high)}`,
    colors.amber,
    13,
  );

  rect(72, 532, 710, 170, colors.softBlue, colors.blue, 22, 2);
  text(100, 565, "PROVIDER-REPORTED USAGE + DATED COST", 17, colors.blue, { bold: true });
  text(
    100,
    620,
    `${grouped(values.overall.prompt_tokens)} + ${grouped(values.overall.completion_tokens)} = ` +
      `${grouped(values.overall.total_tokens)} tokens`,
    30,
    colors.white,
    { bold: true },
  );
  text(
    100,
    662,
    `$${values.overall.estimated_cost_usd} ${values.currency} estimated`,
    24,
    colors.green,
    { bold: true },
  );
  text(
    100,
    690,
    `Price snapshot: ${values.snapshotId}  |  estimate, not a bill`,
    14,
    colors.muted,
  );

  rect(802, 532, 726, 170, colors.softPurple, colors.purple, 22, 2);
  text(
    830,
    565,
    `${grouped(values.paired.pair_count)} FROZEN CONTRACTS PER MODEL`,
    17,
    colors.purple,
    { bold: true },
  );
  values.pairTaskIds.map(labelFromIdentifier).forEach((label, index) => {
    const x = 830 + (index % 3) * 222;
    const y = 603 + Math.floor(index / 3) * 37;
    circle(x, y - 5, 6, colors.green);
    text(x + 15, y, label, 13, colors.muted, { bold: true });
  });
  line(830, 650, 1500, 650, colors.line);
  text(830, 682, "POST-RUN AUDITED GATE", 13, colors.amber, { bold: true });
  const releaseColor =
    values.releaseDecision === "HUMAN REVIEW REQUIRED"
      ? colors.amber
      : colors.green;
  text(1035, 682, values.releaseDecision, 15, releaseColor, { bold: true });

  rect(72, 724, 1456, 80, colors.panelDark, colors.line, 20, 2);
  text(96, 771, "METHOD", 16, colors.white, { bold: true });
  pill(
    204,
    744,
    214,
    40,
    `CONCURRENCY  ${grouped(values.method.concurrency)}`,
    colors.teal,
    14,
  );
  pill(
    438,
    744,
    188,
    40,
    `RETRIES  ${grouped(values.method.automatic_retries)}`,
    colors.coral,
    14,
  );
  pill(646, 744, 200, 40, `TIMEOUT  ${values.timeoutSeconds} s`, colors.blue, 14);
  pill(
    866,
    744,
    280,
    40,
    `REQUESTS  ${grouped(values.method.observed_provider_requests)} / ` +
      `${grouped(values.method.planned_provider_requests)}`,
    colors.purple,
    14,
  );
  pill(
    1166,
    744,
    338,
    40,
    `PRIVACY PASSED  |  ${grouped(values.privacyIssues)} ISSUES`,
    colors.green,
    14,
  );

  line(72, 828, 1528, 828, colors.line);
  text(72, 873, values.caption, 15, colors.muted);
  text(1528, 873, "chat-deep.ai", 20, colors.teal, { bold: true, anchor: "end" });
  add("</svg>");
  return `${svg.join("\n")}\n`;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function updateManifest(values) {
  const manifest = readJson(manifestPath);
  requireGate(Array.isArray(manifest.assets), "Visual manifest asset list is malformed");
  const assets = manifest.assets.filter((asset) => asset.basename !== basename);
  assets.push({
    basename,
    evidence: "live_evidence_fail_closed",
    source_summary: path.basename(summaryPath),
    source_privacy_audit: path.basename(privacyPath),
    alt: altText,
    caption: values.caption,
    png: {
      file: path.basename(pngPath),
      width,
      height,
      sha256: sha256(pngPath),
    },
    svg: {
      file: path.basename(svgPath),
      editable_text_and_shapes: true,
      sha256: sha256(svgPath),
    },
  });
  delete manifest.generator;
  Object.assign(manifest, {
    schema_version: "1.0.0",
    generators: [
      "visuals/source/render_conceptual_visuals.py",
      "visuals/source/render_live_visual.mjs",
    ],
    status: "visuals_01_08_complete",
    asset_count: assets.reduce(
      (count, asset) => count + Number(Boolean(asset.png)) + Number(Boolean(asset.svg)),
      0,
    ),
    visual_08_generated: true,
    assets,
  });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function removeStaleManifestEntry() {
  if (!fs.existsSync(manifestPath)) return;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!Array.isArray(manifest.assets)) return;
    manifest.assets = manifest.assets.filter((asset) => asset.basename !== basename);
    manifest.asset_count = manifest.assets.reduce(
      (count, asset) => count + Number(Boolean(asset.png)) + Number(Boolean(asset.svg)),
      0,
    );
    manifest.visual_08_generated = false;
    manifest.status = "conceptual_visuals_01_07_complete";
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  } catch {
    // A malformed manifest cannot be safely rewritten.
  }
}

function failClosed(message) {
  for (const filePath of [pngPath, svgPath]) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  removeStaleManifestEntry();
  throw new GateError(`Visual 08 not rendered: ${message}`);
}

async function validateOutput(values) {
  requireGate(fs.existsSync(pngPath) && fs.existsSync(svgPath), "Rendered asset pair is missing");
  const metadata = await sharp(pngPath).metadata();
  requireGate(
    metadata.width === width && metadata.height === height,
    "Live PNG dimensions are not 1600 x 900",
  );
  const svgText = fs.readFileSync(svgPath, "utf8");
  for (const needle of [
    "<title",
    "<desc",
    values.timestamp,
    values.models[0],
    values.models[1],
    "NOT A GENERAL BENCHMARK",
    "NOT A RELIABILITY MEASUREMENT",
    "NOT AN SLA",
    'width="1600"',
    'height="900"',
  ]) {
    requireGate(svgText.includes(needle), `Rendered SVG is missing: ${needle}`);
  }
  requireGate(!/[\u0600-\u06ff]/u.test(svgText), "Arabic text detected in live SVG");
}

async function main() {
  try {
    const summary = readJson(summaryPath);
    const privacy = readJson(privacyPath);
    const plan = readJson(planPath);
    const planHash = readJson(planHashPath);
    const pricing = readJson(pricingPath);
    const values = reconcile(summary, privacy, plan, planHash, pricing);
    const svg = buildSvg(values);
    fs.writeFileSync(svgPath, svg, "utf8");
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
    await validateOutput(values);
    updateManifest(values);
    const manifest = readJson(manifestPath);
    requireGate(
      manifest.asset_count === manifest.assets.length * 2,
      "Manifest coverage does not match its asset entries",
    );
    requireGate(manifest.asset_count === 16, "Manifest does not cover all visual assets");
    console.log(
      `Rendered ${path.basename(pngPath)} and ${path.basename(svgPath)}; ` +
        `manifest covers ${manifest.asset_count} assets.`,
    );
  } catch (error) {
    failClosed(error instanceof Error ? error.message : String(error));
  }
}

await main();
