"""Render the conceptual LlamaIndex article diagrams as matching SVG and PNG files.

The renderer is deliberately self-contained: it uses only Pillow for the raster
output and emits the SVG source from the same drawing commands. Visual 08 is
intentionally excluded until a final sanitized live-results summary is supplied.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import Counter
from dataclasses import dataclass
from html import escape
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
VISUALS = ROOT / "visuals"
WIDTH = 1600
HEIGHT = 900

COLORS = {
    "bg0": "#071524",
    "bg1": "#0a1b2c",
    "panel": "#10283f",
    "panel_dark": "#0b2034",
    "panel_teal": "#0d2633",
    "line": "#284d68",
    "teal": "#2dd4c6",
    "blue": "#5ea8ff",
    "purple": "#a78bfa",
    "green": "#43df88",
    "amber": "#ffbd22",
    "coral": "#ff6b81",
    "white": "#f7f9fc",
    "muted": "#afc0d5",
    "ink": "#061422",
    "danger_panel": "#351a25",
}

FONT_REGULAR = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")
FONT_MONO = Path(r"C:\Windows\Fonts\consola.ttf")
FONT_MONO_BOLD = Path(r"C:\Windows\Fonts\consolab.ttf")


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def blend(a: str, b: str, ratio: float) -> tuple[int, int, int]:
    aa = hex_rgb(a)
    bb = hex_rgb(b)
    return tuple(round(aa[i] + (bb[i] - aa[i]) * ratio) for i in range(3))


def font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_MONO_BOLD if mono and bold else FONT_MONO if mono else FONT_BOLD if bold else FONT_REGULAR
    return ImageFont.truetype(str(path), size=size)


@dataclass
class Canvas:
    image: Image.Image
    draw: ImageDraw.ImageDraw
    svg: list[str]

    @classmethod
    def create(cls) -> "Canvas":
        image = Image.new("RGB", (WIDTH, HEIGHT), COLORS["bg0"])
        draw = ImageDraw.Draw(image)
        for y in range(HEIGHT):
            draw.line((0, y, WIDTH, y), fill=blend(COLORS["bg0"], COLORS["bg1"], y / HEIGHT))
        draw.ellipse((1260, -370, 1940, 310), fill="#142d49")
        draw.ellipse((-315, 595, 365, 1275), fill="#0b303c")
        svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" '
            'viewBox="0 0 1600 900" role="img">',
            "<defs>",
            '<linearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">',
            f'<stop offset="0%" stop-color="{COLORS["bg0"]}"/>',
            f'<stop offset="100%" stop-color="{COLORS["bg1"]}"/>',
            "</linearGradient>",
            '<linearGradient id="accentGradient" x1="0" y1="0" x2="1" y2="0">',
            f'<stop offset="0%" stop-color="{COLORS["teal"]}"/>',
            f'<stop offset="100%" stop-color="{COLORS["blue"]}"/>',
            "</linearGradient>",
            "</defs>",
            '<rect width="1600" height="900" fill="url(#bgGradient)"/>',
            '<circle cx="1460" cy="-30" r="340" fill="#142d49" opacity="0.55"/>',
            '<circle cx="25" cy="930" r="340" fill="#0b303c" opacity="0.55"/>',
        ]
        return cls(image=image, draw=draw, svg=svg)

    def rect(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        *,
        fill: str,
        stroke: str | None = None,
        sw: int = 1,
        radius: int = 0,
    ) -> None:
        box = (x, y, x + w, y + h)
        if radius:
            self.draw.rounded_rectangle(box, radius=radius, fill=fill, outline=stroke, width=sw if stroke else 1)
        else:
            self.draw.rectangle(box, fill=fill, outline=stroke, width=sw if stroke else 1)
        attrs = [
            f'x="{x}"',
            f'y="{y}"',
            f'width="{w}"',
            f'height="{h}"',
            f'fill="{fill}"',
        ]
        if radius:
            attrs.append(f'rx="{radius}"')
        if stroke:
            attrs.extend((f'stroke="{stroke}"', f'stroke-width="{sw}"'))
        self.svg.append(f"<rect {' '.join(attrs)}/>")

    def circle(self, cx: int, cy: int, r: int, *, fill: str, stroke: str | None = None, sw: int = 1) -> None:
        self.draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fill, outline=stroke, width=sw if stroke else 1)
        attrs = [f'cx="{cx}"', f'cy="{cy}"', f'r="{r}"', f'fill="{fill}"']
        if stroke:
            attrs.extend((f'stroke="{stroke}"', f'stroke-width="{sw}"'))
        self.svg.append(f"<circle {' '.join(attrs)}/>")

    def line(self, x1: int, y1: int, x2: int, y2: int, *, color: str, sw: int = 3) -> None:
        self.draw.line((x1, y1, x2, y2), fill=color, width=sw)
        self.svg.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>'
        )

    def arrow(self, x1: int, y1: int, x2: int, y2: int, *, color: str = COLORS["teal"], sw: int = 4) -> None:
        angle = math.atan2(y2 - y1, x2 - x1)
        head = 14
        end_x = x2 - math.cos(angle) * 8
        end_y = y2 - math.sin(angle) * 8
        self.line(x1, y1, int(end_x), int(end_y), color=color, sw=sw)
        left = (
            x2 - math.cos(angle - math.pi / 6) * head,
            y2 - math.sin(angle - math.pi / 6) * head,
        )
        right = (
            x2 - math.cos(angle + math.pi / 6) * head,
            y2 - math.sin(angle + math.pi / 6) * head,
        )
        points = [(x2, y2), left, right]
        self.draw.polygon(points, fill=color)
        points_svg = " ".join(f"{round(px, 1)},{round(py, 1)}" for px, py in points)
        self.svg.append(f'<polygon points="{points_svg}" fill="{color}"/>')

    def text(
        self,
        x: int,
        y: int,
        value: str,
        *,
        size: int,
        color: str,
        bold: bool = False,
        align: str = "left",
        mono: bool = False,
        fit_width: int | None = None,
    ) -> None:
        actual = size
        while fit_width and actual > 14:
            candidate = font(actual, bold=bold, mono=mono)
            bbox = self.draw.textbbox((0, 0), value, font=candidate)
            if bbox[2] - bbox[0] <= fit_width:
                break
            actual -= 1
        pil_font = font(actual, bold=bold, mono=mono)
        anchor = {"left": "lm", "center": "mm", "right": "rm"}[align]
        self.draw.text((x, y), value, font=pil_font, fill=color, anchor=anchor)
        svg_anchor = {"left": "start", "center": "middle", "right": "end"}[align]
        family = "Cascadia Mono, Consolas, monospace" if mono else "Inter, Segoe UI, Arial, sans-serif"
        weight = "800" if bold else "500"
        self.svg.append(
            f'<text x="{x}" y="{y + round(actual * 0.34)}" fill="{color}" '
            f'font-family="{family}" font-size="{actual}" font-weight="{weight}" '
            f'text-anchor="{svg_anchor}">{escape(value)}</text>'
        )

    def multiline(
        self,
        x: int,
        y: int,
        lines: list[str],
        *,
        size: int,
        color: str,
        bold: bool = False,
        align: str = "center",
        line_gap: int | None = None,
        fit_width: int | None = None,
    ) -> None:
        gap = line_gap or round(size * 1.35)
        for offset, value in enumerate(lines):
            self.text(
                x,
                y + offset * gap,
                value,
                size=size,
                color=color,
                bold=bold,
                align=align,
                fit_width=fit_width,
            )

    def pill(
        self,
        x: int,
        y: int,
        w: int,
        h: int,
        label: str,
        *,
        color: str,
        fill: str = COLORS["panel_dark"],
        size: int = 20,
        mono: bool = False,
    ) -> None:
        self.rect(x, y, w, h, fill=fill, stroke=color, sw=2, radius=h // 2)
        self.text(x + w // 2, y + h // 2, label, size=size, color=color, bold=True, align="center", mono=mono, fit_width=w - 28)

    def header(self, title: str, subtitle: str) -> None:
        self.rect(72, 52, 700, 44, fill="#0b2b35", stroke="#20707b", sw=2, radius=22)
        self.text(
            96,
            74,
            "CHAT-DEEP.AI  |  LLAMAINDEX INTEGRATION GUIDE",
            size=20,
            color=COLORS["teal"],
            bold=True,
            fit_width=650,
        )
        self.text(72, 148, title, size=50, color=COLORS["white"], bold=True, fit_width=1456)
        self.text(72, 201, subtitle, size=25, color=COLORS["muted"], fit_width=1456)
        self.rect(72, 227, 1456, 4, fill=COLORS["teal"], radius=2)

    def footer(
        self,
        detail: str,
        *,
        prefix: str = "Conceptual LlamaIndex method diagram  |  no live-result claims",
    ) -> None:
        self.line(72, 828, 1528, 828, color=COLORS["line"], sw=2)
        self.text(
            72,
            868,
            f"{prefix}  |  {detail}",
            size=18,
            color=COLORS["muted"],
            fit_width=1200,
        )
        self.text(1528, 868, "chat-deep.ai", size=20, color=COLORS["teal"], bold=True, align="right")

    def save(self, basename: str) -> None:
        VISUALS.mkdir(parents=True, exist_ok=True)
        self.svg.append("</svg>")
        (VISUALS / f"{basename}.svg").write_text("\n".join(self.svg) + "\n", encoding="utf-8")
        self.image.save(VISUALS / f"{basename}.png", format="PNG", optimize=True)


def small_card(
    c: Canvas,
    x: int,
    y: int,
    w: int,
    h: int,
    title: list[str],
    details: list[str],
    color: str,
    *,
    badge: str | None = None,
) -> None:
    c.rect(x, y, w, h, fill=COLORS["panel"], stroke=color, sw=2, radius=22)
    if badge:
        c.circle(x + w // 2, y + 46, 24, fill=color)
        c.text(x + w // 2, y + 46, badge, size=18, color=COLORS["ink"], bold=True, align="center")
        title_y = y + 101
    else:
        title_y = y + 48
    c.multiline(
        x + w // 2,
        title_y,
        title,
        size=24,
        color=color,
        bold=True,
        fit_width=w - 28,
        line_gap=30,
    )
    detail_y = title_y + len(title) * 31 + 28
    c.multiline(
        x + w // 2,
        detail_y,
        details,
        size=19,
        color=COLORS["muted"],
        fit_width=w - 28,
        line_gap=28,
    )


def visual_01() -> None:
    c = Canvas.create()
    c.header(
        "DeepSeek + LlamaIndex Integration Architecture",
        "Retrieval orchestration and model generation meet at an explicit application control boundary",
    )
    cards = [
        ("APPROVED INPUT", ["documents", "metadata", "user query"], COLORS["blue"]),
        ("INGESTION", ["parse", "split to nodes", "attach sources"], COLORS["purple"]),
        ("INDEX", ["embed nodes", "store vectors", "retain metadata"], COLORS["teal"]),
        ("RETRIEVE", ["search", "rank context", "return sources"], COLORS["green"]),
        ("RESPOND", ["assemble context", "DeepSeek generation", "validate answer"], COLORS["amber"]),
    ]
    x_positions = [72, 370, 668, 966, 1264]
    for i, ((title, details, color), x) in enumerate(zip(cards, x_positions)):
        small_card(c, x, 292, 264, 310, [title], details, color, badge=str(i + 1))
        if i < len(cards) - 1:
            c.arrow(x + 264, 447, x_positions[i + 1] - 14, 447)
    c.rect(116, 646, 1368, 132, fill=COLORS["panel_teal"], stroke=COLORS["line"], sw=2, radius=24)
    lanes = [
        (138, 472, "LLAMAINDEX", "ingestion  |  indexing  |  retrieval  |  synthesis", COLORS["purple"]),
        (574, 376, "DEEPSEEK API", "model generation boundary", COLORS["green"]),
        (930, 532, "APPLICATION", "approval  |  validation  |  limits  |  safe logs", COLORS["amber"]),
    ]
    for x, w, name, detail, color in lanes:
        c.text(x, 683, name, size=23, color=color, bold=True, fit_width=w)
        c.text(x, 728, detail, size=19, color=COLORS["white"], fit_width=w)
    c.footer("architecture only")
    c.save("01-deepseek-llamaindex-integration-architecture")


def visual_02() -> None:
    c = Canvas.create()
    c.header(
        "LlamaIndex Dependency & Configuration Boundary",
        "Pin the stack, load secrets at runtime, correct metadata deliberately, and inject ownership clearly",
    )
    columns = [
        (
            "DEPENDENCIES",
            ["llama-index-core", "DeepSeek LLM adapter", "embedding adapter"],
            COLORS["blue"],
        ),
        (
            "RUNTIME CONFIG",
            ["credential name only", "API origin + model", "timeout + retry policy"],
            COLORS["purple"],
        ),
        (
            "WRAPPER METADATA",
            ["context window", "function-call flag", "capability overrides"],
            COLORS["teal"],
        ),
        (
            "OWNER BOUNDARY",
            ["factory construction", "explicit LLM injection", "Settings as fallback"],
            COLORS["green"],
        ),
    ]
    positions = [72, 444, 816, 1188]
    for i, ((title, details, color), x) in enumerate(zip(columns, positions)):
        small_card(c, x, 292, 340, 330, [title], details, color)
        if i < len(columns) - 1:
            c.arrow(x + 340, 458, positions[i + 1] - 14, 458)
    c.rect(180, 662, 1240, 126, fill=COLORS["danger_panel"], stroke=COLORS["coral"], sw=2, radius=24)
    c.text(800, 701, "METADATA DRIFT GUARDRAIL", size=23, color=COLORS["coral"], bold=True, align="center")
    c.text(
        800,
        746,
        "Transport acceptance does not prove that wrapper context or tool metadata matches the selected model.",
        size=22,
        color=COLORS["white"],
        bold=True,
        align="center",
        fit_width=1160,
    )
    c.footer("no package-version claim")
    c.save("02-llamaindex-dependency-configuration-boundary")


def visual_03() -> None:
    c = Canvas.create()
    c.header(
        "LlamaIndex Chat, Completion & Stream Lifecycle",
        "Choose the response contract, consume every stream, validate terminal state, and propagate cancellation",
    )
    columns = [
        (
            "COMPLETE",
            ["string input", "completion response", "validate content"],
            COLORS["blue"],
            "complete()",
        ),
        (
            "CHAT",
            ["message sequence", "chat response", "validate role + content"],
            COLORS["purple"],
            "chat()",
        ),
        (
            "SYNC STREAM",
            ["iterate chunks", "assemble state", "confirm terminal finish"],
            COLORS["teal"],
            "stream_*()",
        ),
        (
            "ASYNC PATH",
            ["await operation", "bound concurrency", "cancel + clean up"],
            COLORS["green"],
            "a*()",
        ),
    ]
    positions = [72, 444, 816, 1188]
    for title, details, color, method in columns:
        x = positions[columns.index((title, details, color, method))]
        c.rect(x, 286, 340, 410, fill=COLORS["panel"], stroke=color, sw=2, radius=24)
        c.text(x + 24, 332, title, size=27, color=color, bold=True, fit_width=292)
        c.pill(x + 24, 360, 292, 50, method, color=color, size=21, mono=True)
        for j, detail in enumerate(details):
            cy = 468 + j * 66
            c.circle(x + 42, cy, 12, fill=color)
            c.text(x + 42, cy, "+", size=14, color=COLORS["ink"], bold=True, align="center")
            c.text(x + 70, cy, detail, size=20, color=COLORS["muted"], fit_width=238)
        c.pill(x + 24, 642, 292, 38, "VALIDATE BEFORE USE", color=COLORS["amber"], size=16)
    c.rect(230, 734, 1140, 70, fill=COLORS["panel_teal"], stroke=COLORS["teal"], sw=2, radius=22)
    c.text(
        800,
        769,
        "Cancellation path: stop work  ->  discard partial state  ->  close owned resources  ->  surface safely",
        size=21,
        color=COLORS["teal"],
        bold=True,
        align="center",
        fit_width=1080,
    )
    c.footer("lifecycle guidance only")
    c.save("03-llamaindex-chat-complete-stream-lifecycle")


def flow_step(c: Canvas, x: int, y: int, w: int, label: str, color: str) -> None:
    c.rect(x, y, w, 76, fill=COLORS["panel_dark"], stroke=color, sw=2, radius=18)
    c.text(x + w // 2, y + 38, label, size=20, color=color, bold=True, align="center", fit_width=w - 22)


def visual_04() -> None:
    c = Canvas.create()
    c.header(
        "Structured Output & Tool Validation Pipeline",
        "Provider capabilities narrow a response shape; application policy decides whether data or actions are safe",
    )
    c.rect(72, 286, 1456, 226, fill=COLORS["panel"], stroke=COLORS["purple"], sw=2, radius=24)
    c.text(102, 324, "STRUCTURED DATA PATH", size=26, color=COLORS["purple"], bold=True)
    labels = ["PROVIDER RESPONSE", "DEFENSIVE PARSE", "SCHEMA CHECK", "BUSINESS RULES", "ACCEPT / REJECT"]
    xs = [102, 388, 674, 960, 1246]
    colors = [COLORS["blue"], COLORS["purple"], COLORS["teal"], COLORS["amber"], COLORS["green"]]
    for i, (x, label, color) in enumerate(zip(xs, labels, colors)):
        flow_step(c, x, 374, 236, label, color)
        if i < len(xs) - 1:
            c.arrow(x + 236, 412, xs[i + 1] - 12, 412)
    c.rect(72, 542, 1456, 226, fill=COLORS["panel"], stroke=COLORS["amber"], sw=2, radius=24)
    c.text(102, 580, "TOOL ACTION PATH", size=26, color=COLORS["amber"], bold=True)
    labels2 = ["TOOL SELECTION", "ARGUMENT PARSE", "SCHEMA CHECK", "AUTHORIZE", "APPROVED ADAPTER"]
    colors2 = [COLORS["blue"], COLORS["purple"], COLORS["teal"], COLORS["amber"], COLORS["green"]]
    for i, (x, label, color) in enumerate(zip(xs, labels2, colors2)):
        flow_step(c, x, 630, 236, label, color)
        if i < len(xs) - 1:
            c.arrow(x + 236, 668, xs[i + 1] - 12, 668)
    c.text(
        800,
        794,
        "Parser success is not factual correctness. Provider tool support is not application authorization.",
        size=21,
        color=COLORS["coral"],
        bold=True,
        align="center",
        fit_width=1380,
    )
    c.footer("validation boundaries only")
    c.save("04-llamaindex-structured-output-tool-validation")


def visual_05() -> None:
    c = Canvas.create()
    c.header(
        "LlamaIndex RAG Index & Query Pipeline",
        "Evaluate ingestion, retrieval, synthesis, attribution, and injection resistance as separate systems",
    )
    stages = [
        ("APPROVED DOCS", ["content", "metadata"], COLORS["blue"]),
        ("NODES", ["split", "source refs"], COLORS["purple"]),
        ("EMBEDDINGS", ["local or", "approved model"], COLORS["teal"]),
        ("VECTOR INDEX", ["store", "search"], COLORS["green"]),
        ("RETRIEVAL", ["rank", "top context"], COLORS["amber"]),
        ("SYNTHESIS", ["context", "DeepSeek"], COLORS["purple"]),
        ("SOURCE REVIEW", ["claims", "attribution"], COLORS["green"]),
    ]
    xs = [72, 282, 492, 702, 912, 1122, 1332]
    for i, ((title, details, color), x) in enumerate(zip(stages, xs)):
        c.rect(x, 292, 196, 270, fill=COLORS["panel"], stroke=color, sw=2, radius=22)
        c.circle(x + 98, 336, 22, fill=color)
        c.text(x + 98, 336, str(i + 1), size=17, color=COLORS["ink"], bold=True, align="center")
        c.multiline(x + 98, 390, [title], size=21, color=color, bold=True, fit_width=170)
        c.multiline(x + 98, 462, details, size=18, color=COLORS["muted"], fit_width=168, line_gap=28)
        if i < len(xs) - 1:
            c.arrow(x + 196, 427, xs[i + 1] - 12, 427)
    c.rect(110, 604, 1380, 164, fill=COLORS["panel_teal"], stroke=COLORS["line"], sw=2, radius=24)
    c.text(140, 640, "LAYERED EVALUATION", size=24, color=COLORS["white"], bold=True)
    checks = [
        ("INGESTION", "approved + traceable"),
        ("RETRIEVAL", "relevant + complete"),
        ("SYNTHESIS", "grounded + bounded"),
        ("ATTRIBUTION", "sources support claims"),
        ("INJECTION", "retrieved text is untrusted"),
    ]
    check_xs = [140, 408, 676, 944, 1212]
    check_colors = [COLORS["blue"], COLORS["purple"], COLORS["teal"], COLORS["green"], COLORS["coral"]]
    for (name, detail), x, color in zip(checks, check_xs, check_colors):
        c.text(x, 690, name, size=19, color=color, bold=True, fit_width=232)
        c.text(x, 728, detail, size=17, color=COLORS["muted"], fit_width=238)
    c.footer("pipeline and evaluation boundaries")
    c.save("05-llamaindex-rag-index-query-pipeline")


def visual_06() -> None:
    c = Canvas.create()
    c.header(
        "LlamaIndex Error, Retry & Cancellation Tree",
        "Classify the failing layer before fixing, retrying, rejecting, or propagating cancellation",
    )
    c.rect(210, 280, 1180, 126, fill=COLORS["panel"], stroke=COLORS["blue"], sw=2, radius=24)
    c.text(800, 318, "FAILURE CONTEXT", size=26, color=COLORS["blue"], bold=True, align="center")
    questions = ["WHICH LAYER?", "REQUEST SENT?", "SIDE EFFECT?", "IDEMPOTENT?", "CANCELLED?"]
    qx = [242, 472, 702, 932, 1162]
    qcolors = [COLORS["blue"], COLORS["purple"], COLORS["teal"], COLORS["green"], COLORS["amber"]]
    for label, x, color in zip(questions, qx, qcolors):
        c.pill(x, 350, 196, 40, label, color=color, size=15)
    c.arrow(800, 408, 800, 466)
    branches = [
        ("CONFIGURATION", "FIX & STOP", ["package", "option", "credential"], COLORS["coral"]),
        ("RETRIEVAL", "INSPECT LAYER", ["corpus", "index", "metadata"], COLORS["purple"]),
        ("PROVIDER / TRANSPORT", "RETRY IF SAFE", ["transient only", "bounded", "idempotent"], COLORS["blue"]),
        ("PARSER / TOOL", "REJECT / GATE", ["schema", "business rule", "authorization"], COLORS["amber"]),
        ("TIMEOUT / CANCEL", "PROPAGATE", ["deadline reached", "stop + close", "never retry"], COLORS["green"]),
    ]
    xs = [72, 370, 668, 966, 1264]
    for (title, action, details, color), x in zip(branches, xs):
        c.rect(x, 476, 276, 250, fill=COLORS["panel"], stroke=color, sw=2, radius=22)
        c.text(x + 138, 518, title, size=22, color=color, bold=True, align="center", fit_width=248)
        c.pill(x + 28, 548, 220, 42, action, color=color, size=16)
        c.multiline(x + 138, 632, details, size=18, color=COLORS["muted"], fit_width=238, line_gap=27)
    c.rect(230, 752, 1140, 56, fill=COLORS["danger_panel"], stroke=COLORS["coral"], sw=2, radius=18)
    c.text(
        800,
        780,
        "Safe observability keeps allowlisted states and discards prompts, payloads, credentials, identifiers, and raw errors.",
        size=19,
        color=COLORS["coral"],
        bold=True,
        align="center",
        fit_width=1080,
    )
    c.footer("classification and safe-action guidance")
    c.save("06-llamaindex-error-retry-cancellation-tree")


def visual_07() -> None:
    c = Canvas.create()
    c.header(
        "LlamaIndex Test Methodology Ladder",
        "Build evidence in layers and unlock dated publication only after a sanitized privacy audit",
    )
    c.rect(90, 278, 1040, 118, fill=COLORS["panel_teal"], stroke=COLORS["line"], sw=2, radius=22)
    c.text(120, 316, "EVIDENCE GATES", size=25, color=COLORS["white"], bold=True)
    c.text(
        120,
        360,
        "schema  ->  retrieval  ->  serialization  ->  transport  ->  semantics  ->  privacy",
        size=22,
        color=COLORS["muted"],
        fit_width=970,
    )
    steps = [
        (90, 612, 310, 138, "SCHEMA + POLICY", ["validators + synthetic fixtures"], COLORS["blue"]),
        (380, 532, 310, 218, "LOCAL RAG FIXTURES", ["nodes + embeddings", "retrieval controls"], COLORS["purple"]),
        (670, 452, 310, 298, "WRAPPER CONTRACT", ["request serialization", "typed responses"], COLORS["teal"]),
        (960, 372, 310, 378, "BOUNDED LIVE PLAN", ["serial provider cases", "explicit request budget"], COLORS["green"]),
        (1250, 292, 260, 458, "PRIVACY AUDIT", ["allowlisted evidence", "secret + payload scan"], COLORS["amber"]),
    ]
    for index, (x, y, w, h, title, details, color) in enumerate(steps, start=1):
        c.rect(x, y, w, h, fill=COLORS["panel"], stroke=color, sw=2, radius=22)
        c.circle(x + w // 2, y + 46, 23, fill=color)
        c.text(x + w // 2, y + 46, str(index), size=17, color=COLORS["ink"], bold=True, align="center")
        c.text(x + w // 2, y + 91, title, size=20, color=color, bold=True, align="center", fit_width=w - 24)
        c.multiline(x + w // 2, y + 125, details, size=17, color=COLORS["muted"], fit_width=w - 28, line_gap=27)
        if index == len(steps):
            c.pill(x + 24, y + 240, w - 48, 48, "DASHBOARD LOCKED", color=COLORS["coral"], size=16)
            c.multiline(
                x + w // 2,
                y + 330,
                ["Unlock only after", "sanitized evidence"],
                size=18,
                color=COLORS["white"],
                bold=True,
                fit_width=w - 40,
                line_gap=30,
            )
    c.rect(230, 772, 1140, 40, fill=COLORS["danger_panel"], stroke=COLORS["coral"], sw=2, radius=18)
    c.text(
        800,
        792,
        "No result is publishable until measured values and saved evidence pass the redaction audit.",
        size=18,
        color=COLORS["coral"],
        bold=True,
        align="center",
        fit_width=1080,
    )
    c.footer("results dashboard remains locked")
    c.save("07-llamaindex-test-methodology-ladder")


def result_row(
    c: Canvas,
    x: int,
    y: int,
    w: int,
    h: int,
    title: str,
    lines: list[str],
    color: str,
) -> None:
    c.rect(x, y, w, h, fill=COLORS["panel_dark"], stroke=color, sw=2, radius=16)
    c.text(x + 18, y + 20, title, size=17, color=color, bold=True, fit_width=w - 36)
    for index, value in enumerate(lines):
        c.text(x + 18, y + 44 + index * 19, value, size=15, color=COLORS["muted"], fit_width=w - 36)


def visual_08() -> None:
    summary_path = ROOT / "results" / "live-summary.json"
    audit_path = ROOT / "results" / "privacy-audit.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    assert summary["status"] == "completed"
    assert audit["status"] == "pass"
    assert summary["provider_requests_issued"] == summary["provider_request_cap"]
    assert summary["concurrency"] == 1
    assert summary["automatic_retries"] == 0
    results = summary["results"]
    assert len(results) == summary["provider_requests_issued"]
    cases = {item["case_id"]: item for item in results}
    outcomes = Counter(item["outcome"] for item in results)

    structured = cases["py-structured-predict-v4-flash"]
    tool_initial = cases["py-tool-call-initial-v4-flash"]
    tool_continuation = cases["py-tool-call-continuation-v4-flash"]
    rag = cases["py-local-rag-query-engine-v4-flash"]
    reasoner_alias = cases["py-alias-deepseek-reasoner-probe"]
    chat_alias = cases["py-alias-deepseek-chat-probe"]
    invalid_model = cases["py-invalid-model-error"]
    thinking = cases["py-chat-v4-pro-thinking"]

    assert outcomes == {
        "success": 12,
        "unexpected_error": 1,
        "alias_accepted": 2,
        "expected_provider_error": 1,
    }
    assert structured["exception_class"] == "ValueError"
    assert tool_initial["tool_call_count"] == 1 and tool_initial["tool_name_valid"] is True
    assert tool_initial["arguments_schema_valid"] is False
    assert tool_continuation["content_nonempty"] is True
    assert rag["selected_record_count"] == 1 and rag["source_node_count"] == 1
    assert chat_alias["content_nonempty"] is True
    assert reasoner_alias["reasoning_field_present"] is True
    assert reasoner_alias["content_nonempty"] is False
    assert reasoner_alias["finish_reason"] == "length"
    assert invalid_model["expected_error_observed"] is True
    assert thinking["reasoning_field_present"] is True and thinking["content_nonempty"] is True

    tested_date = summary["tested_at_utc"][:10]
    elapsed = f'{summary["elapsed_ms"] / 1000:.3f}s'
    packages = summary["python_packages"]

    c = Canvas.create()
    c.header(
        "DeepSeek LlamaIndex Live Results Dashboard",
        f"Dated observation  |  {tested_date} UTC  |  bounded Python wrapper study  |  sanitized evidence",
    )

    metrics = [
        ("REQUESTS", f'{summary["provider_requests_issued"]} / {summary["provider_request_cap"]}', "issued / fixed cap", COLORS["blue"]),
        ("CONCURRENCY", str(summary["concurrency"]), "serial execution", COLORS["purple"]),
        ("AUTO RETRIES", str(summary["automatic_retries"]), "disabled for study", COLORS["teal"]),
        ("ELAPSED", elapsed, "study duration only", COLORS["amber"]),
        ("PRIVACY AUDIT", audit["status"].upper(), "zero secret findings", COLORS["green"]),
    ]
    metric_xs = [72, 366, 660, 954, 1248]
    for (label, value, note, color), x in zip(metrics, metric_xs):
        c.rect(x, 276, 280, 108, fill=COLORS["panel"], stroke=color, sw=2, radius=20)
        c.text(x + 20, 302, label, size=16, color=color, bold=True, fit_width=240)
        c.text(x + 140, 337, value, size=29, color=COLORS["white"], bold=True, align="center", fit_width=244)
        c.text(x + 140, 366, note, size=15, color=COLORS["muted"], align="center", fit_width=244)

    c.rect(72, 402, 1456, 66, fill=COLORS["panel_teal"], stroke=COLORS["line"], sw=2, radius=18)
    c.text(
        98,
        422,
        "PRIMARY: deepseek-v4-flash + deepseek-v4-pro   |   DATED ALIASES: deepseek-chat + deepseek-reasoner",
        size=17,
        color=COLORS["white"],
        bold=True,
        fit_width=1404,
    )
    version_line = (
        f'Python {summary["python_version"]}  |  core {packages["llama-index-core"]}  |  '
        f'DeepSeek adapter {packages["llama-index-llms-deepseek"]}  |  '
        f'OpenAI-like {packages["llama-index-llms-openai-like"]}  |  '
        f'OpenAI {packages["openai"]}  |  Pydantic {packages["pydantic"]}'
    )
    c.text(98, 449, version_line, size=15, color=COLORS["muted"], fit_width=1404)

    c.rect(72, 486, 710, 318, fill=COLORS["panel"], stroke=COLORS["teal"], sw=2, radius=22)
    c.text(98, 516, "EXERCISED PATHS", size=23, color=COLORS["teal"], bold=True)
    left_rows = [
        ("CHAT + COMPLETE", ["sync + async: 4 / 4 success"], COLORS["green"]),
        ("SYNC + ASYNC STREAMS", ["chat + complete: 4 / 4 success"], COLORS["green"]),
        ("THINKING PATH", ["content and reasoning field present"], COLORS["green"]),
        ("LOCAL RAG QUERY ENGINE", ["1 selected record  |  1 source node"], COLORS["green"]),
        ("INVALID MODEL", ["expected 400  |  BadRequestError"], COLORS["blue"]),
        ("OFFLINE CONTRACT SUITE", ["22 / 22 passed"], COLORS["purple"]),
    ]
    left_positions = [(98, 542), (438, 542), (98, 626), (438, 626), (98, 710), (438, 710)]
    for (title, lines, color), (x, y) in zip(left_rows, left_positions):
        result_row(c, x, y, 318, 72, title, lines, color)

    c.rect(818, 486, 710, 318, fill=COLORS["panel"], stroke=COLORS["amber"], sw=2, radius=22)
    c.text(844, 516, "LIMITS AND CAVEATS OBSERVED", size=23, color=COLORS["amber"], bold=True)
    result_row(
        c,
        844,
        542,
        658,
        64,
        "STRUCTURED PREDICT  |  UNEXPECTED ERROR",
        [f'{structured["exception_class"]}; no validated object returned'],
        COLORS["coral"],
    )
    result_row(
        c,
        844,
        616,
        658,
        76,
        "TOOL PATH  |  MIXED ASSERTIONS",
        [
            f'{tool_initial["tool_call_count"]} call + correct name; exact fixture argument contract not met',
            "controlled continuation succeeded",
        ],
        COLORS["amber"],
    )
    result_row(
        c,
        844,
        702,
        658,
        76,
        "DATED ALIAS PROBES  |  ACCEPTED WITH CAVEAT",
        [
            "chat: final content present",
            "reasoner: reasoning present; final content empty; finish reason length",
        ],
        COLORS["amber"],
    )
    c.line(844, 786, 1502, 786, color=COLORS["line"], sw=1)
    c.text(
        1173,
        795,
        f'{outcomes["success"]} success  |  {outcomes["alias_accepted"]} aliases accepted  |  '
        f'{outcomes["expected_provider_error"]} expected error  |  '
        f'{outcomes["unexpected_error"]} unexpected error',
        size=14,
        color=COLORS["white"],
        bold=True,
        align="center",
        fit_width=630,
    )
    c.footer(
        "sanitized evidence  |  not a service-level benchmark",
        prefix="Dated LlamaIndex observation",
    )
    c.save("08-llamaindex-live-results-dashboard")


def write_hashes() -> None:
    entries = []
    for path in sorted(VISUALS.glob("0[1-8]-*.png")):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        with Image.open(path) as image:
            width, height = image.size
        evidence = "conceptual_only_no_live_results"
        if path.name.startswith("08-"):
            summary = json.loads((ROOT / "results" / "live-summary.json").read_text(encoding="utf-8"))
            evidence = f'sanitized_dated_observation_{summary["tested_at_utc"][:10]}_utc'
        entries.append(
            {
                "file": path.name,
                "width": width,
                "height": height,
                "evidence": evidence,
                "sha256": digest,
            }
        )
    dashboard_present = any(item["file"].startswith("08-") for item in entries)
    if not dashboard_present:
        entries.append(
            {
                "file": "08-llamaindex-live-results-dashboard.png",
                "width": 1600,
                "height": 900,
                "evidence": "pending_final_sanitized_live_summary",
                "sha256": None,
            }
        )
    payload = {
        "schema_version": "1.0.0",
        "evidence_status": (
            "conceptual_visuals_plus_sanitized_dated_dashboard"
            if dashboard_present
            else "conceptual_visuals_ready_dashboard_pending"
        ),
        "images": entries,
    }
    (VISUALS / "conceptual-hashes.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    visual_01()
    visual_02()
    visual_03()
    visual_04()
    visual_05()
    visual_06()
    visual_07()
    if (ROOT / "results" / "live-summary.json").exists() and (ROOT / "results" / "privacy-audit.json").exists():
        visual_08()
    write_hashes()


if __name__ == "__main__":
    main()
