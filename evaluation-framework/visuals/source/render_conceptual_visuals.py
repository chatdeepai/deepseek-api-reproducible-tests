"""Render the conceptual DeepSeek Evaluation Framework visual set.

The renderer creates synchronized, editable SVG and 1600 x 900 PNG assets.
It intentionally renders only Visuals 01-07. Visual 08 is live evidence and
must be generated separately from a sanitized, privacy-audited result file.

Runtime dependency: Pillow. Everything else is from the Python standard
library.
"""

from __future__ import annotations

import hashlib
import json
import math
from html import escape
from pathlib import Path
from typing import Iterable, Sequence

from PIL import Image, ImageDraw, ImageFont


SOURCE_DIR = Path(__file__).resolve().parent
VISUALS_DIR = SOURCE_DIR.parent
WIDTH = 1600
HEIGHT = 900

COLORS = {
    "bg0": "#071524",
    "bg1": "#0a1b2c",
    "panel": "#10283f",
    "panel_dark": "#0b2034",
    "band": "#0d2633",
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
    "danger": "#351a25",
    "soft_blue": "#112e4b",
    "soft_teal": "#0d333a",
    "soft_purple": "#252545",
    "soft_amber": "#332b16",
    "soft_green": "#123326",
}

FONT_REGULAR = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")
FONT_MONO = Path(r"C:\Windows\Fonts\consola.ttf")
FONT_MONO_BOLD = Path(r"C:\Windows\Fonts\consolab.ttf")

FOOTER = "Conceptual evaluation diagram | no live-result claims"

ASSETS = [
    {
        "basename": "01-deepseek-evaluation-system-architecture",
        "title": "DeepSeek Application Evaluation System Architecture",
        "description": (
            "Application evaluation lifecycle from task contract and golden "
            "dataset through frozen runs, scorers, human review, release gate, "
            "production monitoring, and regression feedback."
        ),
        "alt": (
            "DeepSeek application evaluation architecture connecting task "
            "contracts, golden datasets, frozen runs, automated scorers, human "
            "review, release gates, production monitoring, and regression feedback"
        ),
        "caption": (
            "Conceptual evaluation lifecycle. Public model benchmarks can help "
            "select candidates, but application evidence determines whether a "
            "release is safe to ship. No live-result claims."
        ),
    },
    {
        "basename": "02-golden-dataset-anatomy-and-splits",
        "title": "Golden Dataset Anatomy and Governance Splits",
        "description": (
            "A versioned golden evaluation case, controlled dataset partitions, "
            "a holdout leakage barrier, and quality gates."
        ),
        "alt": (
            "Anatomy of a versioned DeepSeek golden evaluation case with "
            "development, regression, and blind holdout splits plus leakage, "
            "privacy, and deduplication controls"
        ),
        "caption": (
            "Conceptual dataset design. A larger dataset is not automatically "
            "better; provenance, risk coverage, leakage control, and stable "
            "versions make results interpretable. No live-result claims."
        ),
    },
    {
        "basename": "03-deepseek-evaluator-ownership-matrix",
        "title": "DeepSeek Evaluation Signal Ownership Matrix",
        "description": (
            "Four-column matrix separating provider-returned, application-measured, "
            "evaluator-produced, and human or reconciled evidence."
        ),
        "alt": (
            "Ownership matrix for DeepSeek provider fields, application "
            "measurements, evaluator scores, human labels, and reconciled release "
            "evidence"
        ),
        "caption": (
            "Conceptual signal taxonomy. Record who produced each value and how "
            "it was derived before combining it in a scorecard. No live-result claims."
        ),
    },
    {
        "basename": "04-hallucination-faithfulness-decision-tree",
        "title": "Hallucination, Faithfulness, and Factuality Decision Tree",
        "description": (
            "Claim-level evidence flow separating support, contradiction, "
            "external truth, abstention, judge scoring, and human escalation."
        ),
        "alt": (
            "Decision tree separating DeepSeek output faithfulness, factuality, "
            "groundedness, unsupported claims, contradictions, and correct abstention"
        ),
        "caption": (
            "Conceptual claim-level classification. Hallucination, faithfulness, "
            "factuality, and groundedness answer different questions and should "
            "not be collapsed into one universal score. No live-result claims."
        ),
    },
    {
        "basename": "05-deepseek-rag-evaluation-two-stage-pipeline",
        "title": "DeepSeek RAG Evaluation: Two Separate Stages",
        "description": (
            "Retriever and generator evaluation lanes with independent metrics "
            "and failure patterns."
        ),
        "alt": (
            "Two-stage DeepSeek RAG evaluation pipeline separating retriever "
            "coverage and ranking from generator faithfulness, citations, "
            "factuality, relevance, and abstention"
        ),
        "caption": (
            "Conceptual RAG evaluation map. Score retrieval and generation "
            "separately so one stage cannot hide the other's failure. "
            "No live-result claims."
        ),
    },
    {
        "basename": "06-deepseek-agent-tool-evaluation-trace",
        "title": "DeepSeek Agent and Tool Evaluation Trace",
        "description": (
            "Aligned trace from user intent through model proposal, application "
            "validation, stubbed execution, continuation, final answer, and review."
        ),
        "alt": (
            "DeepSeek agent evaluation trace covering model proposal, argument "
            "validation, authorization, stubbed tool execution, continuation, "
            "final answer, and reviewer outcome"
        ),
        "caption": (
            "Conceptual agent trace. The application owns validation, "
            "authorization, execution, and side-effect safety; the model only "
            "proposes tool calls. No live-result claims."
        ),
    },
    {
        "basename": "07-ci-regression-and-release-gate",
        "title": "CI Regression and Fail-Closed Release Gate",
        "description": (
            "Two-tier evaluation pipeline combining broad offline checks with an "
            "explicit bounded provider run and fail-closed release decisions."
        ),
        "alt": (
            "Two-tier DeepSeek evaluation CI pipeline with offline checks, "
            "bounded provider runs, request and cost caps, regression gates, "
            "human review, and fail-closed publication"
        ),
        "caption": (
            "Conceptual release gate. Offline checks run broadly; provider "
            "evaluation runs remain explicit, bounded, reproducible, "
            "privacy-audited, and fail closed. No live-result claims."
        ),
    },
]


def rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def blend(a: str, b: str, ratio: float) -> tuple[int, int, int]:
    left = rgb(a)
    right = rgb(b)
    return tuple(
        round(left[index] + (right[index] - left[index]) * ratio)
        for index in range(3)
    )


def get_font(size: int, *, bold: bool = False, mono: bool = False):
    if mono:
        path = FONT_MONO_BOLD if bold else FONT_MONO
    else:
        path = FONT_BOLD if bold else FONT_REGULAR
    return ImageFont.truetype(str(path), size=size)


class Canvas:
    """Drawing surface that mirrors each command to Pillow and editable SVG."""

    def __init__(self, title: str, description: str) -> None:
        self.image = Image.new("RGB", (WIDTH, HEIGHT), COLORS["bg0"])
        self.draw = ImageDraw.Draw(self.image)
        for y in range(HEIGHT):
            self.draw.line(
                (0, y, WIDTH, y),
                fill=blend(COLORS["bg0"], COLORS["bg1"], y / HEIGHT),
            )
        self.draw.ellipse((1260, -370, 1940, 310), fill="#142d49")
        self.draw.ellipse((-315, 595, 365, 1275), fill="#0b303c")
        self.svg = [
            (
                '<svg xmlns="http://www.w3.org/2000/svg" width="1600" '
                'height="900" viewBox="0 0 1600 900" role="img" '
                'aria-labelledby="visual-title visual-description">'
            ),
            f'<title id="visual-title">{escape(title)}</title>',
            f'<desc id="visual-description">{escape(description)}</desc>',
            "<defs>",
            '<linearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">',
            f'<stop offset="0%" stop-color="{COLORS["bg0"]}"/>',
            f'<stop offset="100%" stop-color="{COLORS["bg1"]}"/>',
            "</linearGradient>",
            "</defs>",
            '<rect width="1600" height="900" fill="url(#bgGradient)"/>',
            '<circle cx="1460" cy="-30" r="340" fill="#142d49" opacity="0.55"/>',
            '<circle cx="25" cy="930" r="340" fill="#0b303c" opacity="0.55"/>',
        ]

    def rect(
        self,
        x: int,
        y: int,
        width: int,
        height: int,
        *,
        fill: str,
        stroke: str | None = None,
        sw: int = 1,
        radius: int = 0,
    ) -> None:
        box = (x, y, x + width, y + height)
        if radius:
            self.draw.rounded_rectangle(
                box,
                radius=radius,
                fill=fill,
                outline=stroke,
                width=sw if stroke else 1,
            )
        else:
            self.draw.rectangle(
                box,
                fill=fill,
                outline=stroke,
                width=sw if stroke else 1,
            )
        attrs = [
            f'x="{x}"',
            f'y="{y}"',
            f'width="{width}"',
            f'height="{height}"',
            f'fill="{fill}"',
        ]
        if radius:
            attrs.append(f'rx="{radius}"')
        if stroke:
            attrs.extend((f'stroke="{stroke}"', f'stroke-width="{sw}"'))
        self.svg.append(f"<rect {' '.join(attrs)}/>")

    def circle(
        self,
        x: int,
        y: int,
        radius: int,
        *,
        fill: str,
        stroke: str | None = None,
        sw: int = 1,
    ) -> None:
        self.draw.ellipse(
            (x - radius, y - radius, x + radius, y + radius),
            fill=fill,
            outline=stroke,
            width=sw if stroke else 1,
        )
        attrs = [f'cx="{x}"', f'cy="{y}"', f'r="{radius}"', f'fill="{fill}"']
        if stroke:
            attrs.extend((f'stroke="{stroke}"', f'stroke-width="{sw}"'))
        self.svg.append(f"<circle {' '.join(attrs)}/>")

    def line(
        self,
        x1: int,
        y1: int,
        x2: int,
        y2: int,
        *,
        color: str,
        sw: int = 3,
        dash: tuple[int, int] | None = None,
    ) -> None:
        if dash:
            dx = x2 - x1
            dy = y2 - y1
            distance = max(1.0, math.hypot(dx, dy))
            position = 0.0
            drawing = True
            while position < distance:
                step = dash[0] if drawing else dash[1]
                end = min(distance, position + step)
                if drawing:
                    start_ratio = position / distance
                    end_ratio = end / distance
                    self.draw.line(
                        (
                            x1 + dx * start_ratio,
                            y1 + dy * start_ratio,
                            x1 + dx * end_ratio,
                            y1 + dy * end_ratio,
                        ),
                        fill=color,
                        width=sw,
                    )
                position = end
                drawing = not drawing
        else:
            self.draw.line((x1, y1, x2, y2), fill=color, width=sw)
        dash_attr = (
            f' stroke-dasharray="{dash[0]} {dash[1]}"' if dash else ""
        )
        self.svg.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="{color}" stroke-width="{sw}" stroke-linecap="round"'
            f"{dash_attr}/>"
        )

    def arrow(
        self,
        x1: int,
        y1: int,
        x2: int,
        y2: int,
        *,
        color: str = COLORS["teal"],
        sw: int = 4,
    ) -> None:
        angle = math.atan2(y2 - y1, x2 - x1)
        head = 14
        line_end_x = x2 - math.cos(angle) * 9
        line_end_y = y2 - math.sin(angle) * 9
        self.line(
            x1,
            y1,
            round(line_end_x),
            round(line_end_y),
            color=color,
            sw=sw,
        )
        points = [
            (x2, y2),
            (
                x2 - math.cos(angle - math.pi / 6) * head,
                y2 - math.sin(angle - math.pi / 6) * head,
            ),
            (
                x2 - math.cos(angle + math.pi / 6) * head,
                y2 - math.sin(angle + math.pi / 6) * head,
            ),
        ]
        self.draw.polygon(points, fill=color)
        coords = " ".join(f"{round(px, 1)},{round(py, 1)}" for px, py in points)
        self.svg.append(f'<polygon points="{coords}" fill="{color}"/>')

    def polyline_arrow(
        self,
        points: Sequence[tuple[int, int]],
        *,
        color: str = COLORS["teal"],
        sw: int = 4,
        dash: tuple[int, int] | None = None,
    ) -> None:
        for index in range(len(points) - 2):
            self.line(*points[index], *points[index + 1], color=color, sw=sw, dash=dash)
        self.arrow(
            *points[-2],
            *points[-1],
            color=color,
            sw=sw,
        )

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
        while fit_width and actual > 13:
            candidate = get_font(actual, bold=bold, mono=mono)
            bounds = self.draw.textbbox((0, 0), value, font=candidate)
            if bounds[2] - bounds[0] <= fit_width:
                break
            actual -= 1
        font = get_font(actual, bold=bold, mono=mono)
        anchor = {"left": "lm", "center": "mm", "right": "rm"}[align]
        self.draw.text((x, y), value, font=font, fill=color, anchor=anchor)
        svg_anchor = {"left": "start", "center": "middle", "right": "end"}[align]
        family = (
            "Cascadia Mono, Consolas, monospace"
            if mono
            else "Inter, Segoe UI, Arial, sans-serif"
        )
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
        values: Iterable[str],
        *,
        size: int,
        color: str,
        bold: bool = False,
        align: str = "center",
        gap: int | None = None,
        fit_width: int | None = None,
        mono: bool = False,
    ) -> None:
        line_gap = gap or round(size * 1.35)
        for index, value in enumerate(values):
            self.text(
                x,
                y + index * line_gap,
                value,
                size=size,
                color=color,
                bold=bold,
                align=align,
                fit_width=fit_width,
                mono=mono,
            )

    def pill(
        self,
        x: int,
        y: int,
        width: int,
        height: int,
        value: str,
        *,
        color: str,
        fill: str = COLORS["panel_dark"],
        size: int = 16,
    ) -> None:
        self.rect(
            x,
            y,
            width,
            height,
            fill=fill,
            stroke=color,
            sw=2,
            radius=height // 2,
        )
        self.text(
            x + width // 2,
            y + height // 2,
            value,
            size=size,
            color=color,
            bold=True,
            align="center",
            fit_width=width - 20,
        )

    def header(self, title: str, subtitle: str) -> None:
        self.rect(
            72,
            52,
            790,
            44,
            fill="#0b2b35",
            stroke="#20707b",
            sw=2,
            radius=22,
        )
        self.text(
            96,
            74,
            "CHAT-DEEP.AI  |  DEEPSEEK EVALUATION FRAMEWORK",
            size=20,
            color=COLORS["teal"],
            bold=True,
            fit_width=742,
        )
        self.text(
            72,
            148,
            title,
            size=48,
            color=COLORS["white"],
            bold=True,
            fit_width=1456,
        )
        self.text(
            72,
            201,
            subtitle,
            size=24,
            color=COLORS["muted"],
            fit_width=1456,
        )
        self.rect(72, 227, 1456, 4, fill=COLORS["teal"], radius=2)

    def footer(self) -> None:
        self.line(72, 828, 1528, 828, color=COLORS["line"], sw=2)
        self.text(
            72,
            868,
            FOOTER,
            size=18,
            color=COLORS["muted"],
            fit_width=1150,
        )
        self.text(
            1528,
            868,
            "chat-deep.ai",
            size=20,
            color=COLORS["teal"],
            bold=True,
            align="right",
        )

    def save(self, basename: str) -> None:
        self.svg.append("</svg>")
        (VISUALS_DIR / f"{basename}.svg").write_text(
            "\n".join(self.svg) + "\n",
            encoding="utf-8",
        )
        self.image.save(
            VISUALS_DIR / f"{basename}.png",
            format="PNG",
            optimize=True,
        )


def node(
    canvas: Canvas,
    x: int,
    y: int,
    width: int,
    height: int,
    title: str,
    lines: Sequence[str],
    color: str,
    *,
    title_size: int = 18,
    body_size: int = 16,
    fill: str = COLORS["panel"],
) -> None:
    canvas.rect(
        x,
        y,
        width,
        height,
        fill=fill,
        stroke=color,
        sw=2,
        radius=18,
    )
    canvas.circle(x + 24, y + 25, 7, fill=color)
    canvas.text(
        x + 42,
        y + 26,
        title,
        size=title_size,
        color=color,
        bold=True,
        fit_width=width - 58,
    )
    canvas.multiline(
        x + width // 2,
        y + 64,
        lines,
        size=body_size,
        color=COLORS["muted"],
        gap=26,
        fit_width=width - 30,
    )


def bullet_list(
    canvas: Canvas,
    x: int,
    start_y: int,
    values: Sequence[str],
    *,
    color: str,
    width: int,
    gap: int = 29,
    size: int = 16,
) -> None:
    for index, value in enumerate(values):
        cy = start_y + index * gap
        canvas.circle(x, cy, 5, fill=color)
        canvas.text(
            x + 15,
            cy,
            value,
            size=size,
            color=COLORS["muted"],
            fit_width=width - 15,
        )


def render_01(meta: dict[str, str]) -> None:
    c = Canvas(meta["title"], meta["description"])
    c.header(
        "DeepSeek Application Evaluation Architecture",
        "Application evidence moves through a release boundary and returns as reviewed regression cases",
    )

    c.pill(72, 260, 254, 38, "DEVELOPMENT / OFFLINE", color=COLORS["blue"])
    c.pill(1272, 260, 256, 38, "PRODUCTION / ONLINE", color=COLORS["green"])
    c.line(1204, 264, 1204, 698, color=COLORS["amber"], sw=3, dash=(9, 7))
    c.text(
        1204,
        719,
        "RELEASE-DECISION BOUNDARY",
        size=15,
        color=COLORS["amber"],
        bold=True,
        align="center",
        fit_width=330,
    )

    xs = [72, 284, 496, 708, 920]
    titles = ["TASK CONTRACT", "GOLDEN DATASET", "FROZEN RUN", "SCORERS", "HUMAN REVIEW"]
    bodies = [
        ["behavior + risk", "acceptance policy"],
        ["versioned cases", "provenance + splits"],
        ["model + prompt", "code + plan hash"],
        ["deterministic", "model-based"],
        ["ambiguous cases", "risk escalation"],
    ]
    colors = [
        COLORS["blue"],
        COLORS["purple"],
        COLORS["teal"],
        COLORS["green"],
        COLORS["amber"],
    ]
    for index, x in enumerate(xs):
        node(c, x, 327, 184, 146, titles[index], bodies[index], colors[index], title_size=16)
        if index < len(xs) - 1:
            c.arrow(x + 184, 400, xs[index + 1] - 10, 400, color=COLORS["teal"], sw=3)

    node(
        c,
        1118,
        327,
        172,
        146,
        "RELEASE GATE",
        ["segment policy", "ship / block"],
        COLORS["amber"],
        title_size=16,
    )
    c.arrow(1104, 400, 1108, 400, color=COLORS["teal"], sw=3)
    c.arrow(1290, 400, 1324, 400, color=COLORS["green"], sw=4)
    node(
        c,
        1336,
        327,
        192,
        146,
        "MONITORING",
        ["operational signals", "reviewed failures"],
        COLORS["green"],
        title_size=16,
    )

    c.text(72, 519, "EVIDENCE TYPES", size=18, color=COLORS["white"], bold=True)
    c.pill(72, 542, 246, 42, "Deterministic evidence", color=COLORS["blue"])
    c.pill(336, 542, 236, 42, "Model-based evidence", color=COLORS["purple"])
    c.pill(590, 542, 210, 42, "Human evidence", color=COLORS["amber"])
    c.pill(818, 542, 250, 42, "Operational evidence", color=COLORS["green"])

    c.rect(72, 621, 420, 116, fill=COLORS["soft_blue"], stroke=COLORS["blue"], sw=2, radius=18)
    c.text(96, 651, "PUBLIC MODEL BENCHMARK", size=17, color=COLORS["blue"], bold=True)
    c.multiline(
        96,
        689,
        ["Input to candidate selection", "Not the application's release gate"],
        size=16,
        color=COLORS["muted"],
        align="left",
        gap=25,
        fit_width=370,
    )
    c.arrow(492, 679, 548, 679, color=COLORS["blue"], sw=3)
    c.pill(562, 658, 266, 42, "candidate model input", color=COLORS["blue"])

    c.polyline_arrow(
        [(1432, 327), (1432, 310), (376, 310), (376, 327)],
        color=COLORS["purple"],
        sw=3,
    )
    c.rect(
        650,
        263,
        500,
        42,
        fill=COLORS["soft_purple"],
        stroke=COLORS["purple"],
        sw=2,
        radius=20,
    )
    c.text(
        900,
        284,
        "reviewed production failure -> new dataset version",
        size=15,
        color=COLORS["purple"],
        bold=True,
        align="center",
        fit_width=466,
    )
    c.footer()
    c.save(meta["basename"])


def render_02(meta: dict[str, str]) -> None:
    c = Canvas(meta["title"], meta["description"])
    c.header(
        "Golden Dataset Anatomy and Governance Splits",
        "A useful case is traceable, risk-aware, leak-resistant, and frozen into a stable version",
    )

    c.rect(72, 272, 870, 430, fill=COLORS["band"], stroke=COLORS["purple"], sw=2, radius=22)
    c.text(104, 306, "VERSIONED GOLDEN CASE", size=20, color=COLORS["purple"], bold=True)
    c.pill(682, 286, 228, 36, "dataset v2026.07", color=COLORS["purple"], size=15)

    columns = [
        (
            104,
            "IDENTITY + INPUT",
            COLORS["blue"],
            [
                "Stable case ID",
                "Task and risk tier",
                "Input",
                "Reference context",
            ],
        ),
        (
            382,
            "EXPECTED BEHAVIOR",
            COLORS["teal"],
            [
                "Expected output or rubric",
                "Expected tool trace",
                "Required claims",
                "Prohibited claims",
            ],
        ),
        (
            660,
            "GOVERNANCE",
            COLORS["amber"],
            [
                "Case-level thresholds",
                "Provenance",
                "Reviewer",
                "Dataset version",
            ],
        ),
    ]
    for x, title, color, values in columns:
        c.rect(x, 344, 250, 316, fill=COLORS["panel_dark"], stroke=color, sw=2, radius=18)
        c.text(x + 20, 374, title, size=16, color=color, bold=True, fit_width=210)
        bullet_list(c, x + 24, 424, values, color=color, width=206, gap=54, size=16)

    c.text(984, 286, "CONTROLLED PARTITIONS", size=20, color=COLORS["white"], bold=True)
    splits = [
        (984, 326, "DEVELOPMENT", ["prompt iteration", "visible examples"], COLORS["blue"]),
        (984, 456, "REGRESSION", ["known failures", "stable comparisons"], COLORS["purple"]),
        (
            984,
            600,
            "BLIND HOLDOUT",
            ["final decision / restricted access", "never a prompt example"],
            COLORS["green"],
        ),
    ]
    for x, y, title, lines, color in splits:
        node(c, x, y, 544, 104, title, lines, color, title_size=17, body_size=15)

    c.line(984, 580, 1528, 580, color=COLORS["coral"], sw=3, dash=(8, 6))
    c.pill(
        1144,
        562,
        224,
        36,
        "LEAKAGE BARRIER",
        color=COLORS["coral"],
        fill=COLORS["danger"],
        size=13,
    )
    c.text(72, 744, "VERSION FREEZE GATES", size=17, color=COLORS["white"], bold=True)
    gate_width = 208
    gate_xs = [280, 506, 732, 958]
    for x, label, color in [
        (gate_xs[0], "Deduplication", COLORS["blue"]),
        (gate_xs[1], "Redaction", COLORS["coral"]),
        (gate_xs[2], "Stale-source review", COLORS["amber"]),
        (gate_xs[3], "Version freeze", COLORS["green"]),
    ]:
        c.pill(x, 724, gate_width, 42, label, color=color, size=15)
    c.footer()
    c.save(meta["basename"])


def render_03(meta: dict[str, str]) -> None:
    c = Canvas(meta["title"], meta["description"])
    c.header(
        "DeepSeek Evaluation Signal Ownership Matrix",
        "Keep returned fields, measured behavior, derived scores, and decisions visibly separate",
    )

    columns = [
        {
            "x": 72,
            "title": "PROVIDER-RETURNED",
            "color": COLORS["blue"],
            "fields": ["model", "finish reason", "token usage", "cache hit / miss tokens"],
            "source": "DeepSeek API response",
            "unit": "field / token",
            "owner": "provider contract",
            "class": "MEASURED",
        },
        {
            "x": 442,
            "title": "APPLICATION-MEASURED",
            "color": COLORS["teal"],
            "fields": ["latency milestones", "timeout", "retry / cancellation", "tool execution outcome"],
            "source": "application runtime",
            "unit": "time / state",
            "owner": "service team",
            "class": "MEASURED",
        },
        {
            "x": 812,
            "title": "EVALUATOR-PRODUCED",
            "color": COLORS["purple"],
            "fields": ["exact match / schema", "faithfulness", "pairwise preference", "hallucination class"],
            "source": "scorer implementation",
            "unit": "label / score",
            "owner": "evaluation team",
            "class": "DERIVED OR JUDGED",
        },
        {
            "x": 1182,
            "title": "HUMAN / RECONCILED",
            "color": COLORS["amber"],
            "fields": ["reviewer label", "disagreement resolution", "billing reconciliation", "release decision"],
            "source": "review workflow",
            "unit": "label / decision",
            "owner": "accountable reviewer",
            "class": "JUDGED OR RECONCILED",
        },
    ]

    for item in columns:
        x = item["x"]
        color = item["color"]
        c.rect(x, 276, 346, 484, fill=COLORS["band"], stroke=color, sw=2, radius=22)
        c.rect(x, 276, 346, 64, fill=COLORS["panel"], radius=22)
        c.circle(x + 28, 308, 8, fill=color)
        c.text(
            x + 48,
            308,
            item["title"],
            size=17,
            color=color,
            bold=True,
            fit_width=278,
        )
        bullet_list(
            c,
            x + 28,
            382,
            item["fields"],
            color=color,
            width=294,
            gap=42,
            size=16,
        )
        c.line(x + 24, 548, x + 322, 548, color=COLORS["line"], sw=2)
        labels = [
            ("SOURCE", item["source"]),
            ("UNIT", item["unit"]),
            ("OWNER", item["owner"]),
        ]
        for idx, (label, value) in enumerate(labels):
            y = 579 + idx * 45
            c.text(x + 24, y, label, size=13, color=color, bold=True)
            c.text(x + 100, y, value, size=15, color=COLORS["muted"], fit_width=220)
        c.pill(
            x + 24,
            707,
            298,
            36,
            item["class"],
            color=color,
            fill=COLORS["panel_dark"],
            size=14,
        )

    c.footer()
    c.save(meta["basename"])


def render_04(meta: dict[str, str]) -> None:
    c = Canvas(meta["title"], meta["description"])
    c.header(
        "Hallucination, Faithfulness, and Factuality",
        "Classify one material claim with evidence checks before judge scoring or human review",
    )

    c.rect(72, 265, 1456, 70, fill=COLORS["soft_blue"], stroke=COLORS["blue"], sw=2, radius=18)
    c.text(102, 300, "DETERMINISTIC FIRST", size=17, color=COLORS["blue"], bold=True)
    c.text(
        300,
        300,
        "extract claim -> locate supplied evidence -> detect explicit contradiction",
        size=18,
        color=COLORS["muted"],
        fit_width=1170,
    )

    c.arrow(800, 335, 800, 367, color=COLORS["teal"])
    c.rect(590, 370, 420, 70, fill=COLORS["panel"], stroke=COLORS["teal"], sw=2, radius=18)
    c.text(
        800,
        405,
        "Is the claim supported by supplied context?",
        size=18,
        color=COLORS["teal"],
        bold=True,
        align="center",
        fit_width=382,
    )

    c.polyline_arrow([(590, 405), (356, 405), (356, 468)], color=COLORS["green"], sw=3)
    c.text(474, 389, "YES", size=14, color=COLORS["green"], bold=True, align="center")
    c.polyline_arrow([(1010, 405), (1244, 405), (1244, 468)], color=COLORS["coral"], sw=3)
    c.text(1126, 389, "NO", size=14, color=COLORS["coral"], bold=True, align="center")

    c.rect(126, 470, 460, 68, fill=COLORS["panel"], stroke=COLORS["green"], sw=2, radius=18)
    c.text(
        356,
        504,
        "Does authoritative external truth agree?",
        size=17,
        color=COLORS["green"],
        bold=True,
        align="center",
        fit_width=420,
    )
    c.polyline_arrow([(1244, 468), (1244, 504)], color=COLORS["coral"], sw=3)
    c.rect(1014, 470, 460, 68, fill=COLORS["panel"], stroke=COLORS["coral"], sw=2, radius=18)
    c.text(
        1244,
        504,
        "Does it contradict the supplied context?",
        size=17,
        color=COLORS["coral"],
        bold=True,
        align="center",
        fit_width=420,
    )

    c.polyline_arrow([(356, 538), (220, 579)], color=COLORS["green"], sw=3)
    c.polyline_arrow([(356, 538), (492, 579)], color=COLORS["amber"], sw=3)
    c.pill(116, 582, 246, 50, "FAITHFUL + FACTUAL", color=COLORS["green"], size=14)
    c.pill(376, 582, 330, 50, "FAITHFUL TO STALE / WRONG CONTEXT", color=COLORS["amber"], size=13)

    c.polyline_arrow([(1244, 538), (1104, 579)], color=COLORS["coral"], sw=3)
    c.polyline_arrow([(1244, 538), (1384, 579)], color=COLORS["purple"], sw=3)
    c.pill(982, 582, 244, 50, "CONTRADICTORY", color=COLORS["coral"], size=14)
    c.pill(1240, 582, 288, 50, "CHECK EXTERNAL TRUTH", color=COLORS["purple"], size=14)

    c.rect(704, 486, 278, 152, fill=COLORS["band"], stroke=COLORS["purple"], sw=2, radius=18)
    c.text(843, 516, "UNSUPPORTED PATH", size=16, color=COLORS["purple"], bold=True, align="center")
    c.multiline(
        843,
        552,
        ["External truth confirms it:", "FACTUAL BUT UNFAITHFUL", "No confirmation: UNSUPPORTED"],
        size=14,
        color=COLORS["muted"],
        gap=26,
        fit_width=244,
    )
    c.arrow(1014, 504, 989, 504, color=COLORS["purple"], sw=3)

    c.rect(252, 652, 1096, 128, fill=COLORS["soft_purple"], stroke=COLORS["purple"], sw=2, radius=20)
    c.text(
        278,
        678,
        "WHEN EVIDENCE IS MISSING, IS ABSTENTION REQUIRED?",
        size=15,
        color=COLORS["purple"],
        bold=True,
        fit_width=505,
    )
    c.pill(278, 699, 244, 34, "Evidence missing + abstains", color=COLORS["green"], size=13)
    c.text(400, 754, "CORRECT ABSTENTION", size=13, color=COLORS["green"], bold=True, align="center")
    c.pill(542, 699, 244, 34, "Evidence missing + answers", color=COLORS["coral"], size=13)
    c.text(664, 754, "FAILED ABSTENTION", size=13, color=COLORS["coral"], bold=True, align="center")
    c.line(816, 669, 816, 762, color=COLORS["line"], sw=2)
    c.text(842, 699, "Judge scoring follows evidence checks.", size=15, color=COLORS["muted"])
    c.text(
        842,
        735,
        "Ambiguous or high-risk claims -> human review",
        size=15,
        color=COLORS["amber"],
        bold=True,
        fit_width=470,
    )

    c.footer()
    c.save(meta["basename"])


def render_05(meta: dict[str, str]) -> None:
    c = Canvas(meta["title"], meta["description"])
    c.header(
        "DeepSeek RAG Evaluation: Two Separate Stages",
        "Score retrieval and generation independently so one stage cannot conceal the other's failure",
    )

    c.pill(72, 266, 208, 38, "RETRIEVER LANE", color=COLORS["blue"])
    retriever_nodes = [
        (72, "QUESTION", ["task contract"]),
        (300, "CORPUS", ["candidate sources"]),
        (528, "RANKED CHUNKS", ["retrieved context"]),
    ]
    for idx, (x, title, lines) in enumerate(retriever_nodes):
        node(c, x, 324, 196, 112, title, lines, COLORS["blue"], title_size=16, body_size=15)
        if idx < len(retriever_nodes) - 1:
            c.arrow(x + 196, 380, retriever_nodes[idx + 1][0] - 10, 380, color=COLORS["blue"], sw=3)

    c.rect(756, 324, 384, 112, fill=COLORS["soft_blue"], stroke=COLORS["blue"], sw=2, radius=18)
    c.text(780, 352, "RETRIEVAL METRICS", size=16, color=COLORS["blue"], bold=True)
    c.multiline(
        780,
        383,
        ["coverage + contextual recall", "contextual precision + ranking"],
        size=15,
        color=COLORS["muted"],
        align="left",
        gap=27,
        fit_width=330,
    )
    c.rect(1168, 324, 360, 112, fill=COLORS["danger"], stroke=COLORS["coral"], sw=2, radius=18)
    c.text(1192, 352, "RETRIEVAL RISKS", size=16, color=COLORS["coral"], bold=True)
    c.multiline(
        1192,
        383,
        ["stale source detection", "distractor detection"],
        size=15,
        color=COLORS["muted"],
        align="left",
        gap=27,
        fit_width=310,
    )
    c.arrow(724, 380, 746, 380, color=COLORS["blue"], sw=3)
    c.arrow(1140, 380, 1158, 380, color=COLORS["coral"], sw=3)

    c.pill(72, 472, 208, 38, "GENERATOR LANE", color=COLORS["purple"])
    generator_nodes = [
        (72, "SELECTED CONTEXT", ["bounded evidence"]),
        (300, "DEEPSEEK RESPONSE", ["answer + citations"]),
        (528, "CLAIM EXTRACTION", ["material claims"]),
    ]
    for idx, (x, title, lines) in enumerate(generator_nodes):
        node(c, x, 530, 196, 112, title, lines, COLORS["purple"], title_size=15, body_size=15)
        if idx < len(generator_nodes) - 1:
            c.arrow(x + 196, 586, generator_nodes[idx + 1][0] - 10, 586, color=COLORS["purple"], sw=3)

    c.rect(756, 530, 772, 112, fill=COLORS["soft_purple"], stroke=COLORS["purple"], sw=2, radius=18)
    c.text(780, 558, "GENERATION METRICS", size=16, color=COLORS["purple"], bold=True)
    metrics = [
        (780, 592, "citation support", COLORS["teal"]),
        (966, 592, "faithfulness", COLORS["green"]),
        (1136, 592, "factuality", COLORS["amber"]),
        (1288, 592, "relevance", COLORS["blue"]),
        (1414, 592, "abstention", COLORS["coral"]),
    ]
    for x, y, label, color in metrics:
        c.circle(x, y, 6, fill=color)
        c.text(x + 14, y, label, size=14, color=COLORS["muted"], fit_width=150)
    c.arrow(724, 586, 746, 586, color=COLORS["purple"], sw=3)

    c.text(72, 687, "FAILURE PATTERNS TO KEEP SEPARATE", size=17, color=COLORS["white"], bold=True)
    failures = [
        ("GOOD ANSWER / BAD RETRIEVAL", "prior knowledge masks retrieval failure", COLORS["blue"]),
        ("FAITHFUL / STALE CONTEXT", "answer mirrors an outdated source", COLORS["amber"]),
        ("GOOD RETRIEVAL / UNSUPPORTED", "answer adds claims beyond context", COLORS["coral"]),
        ("INSUFFICIENT / ABSTAINS", "correct refusal is a successful outcome", COLORS["green"]),
    ]
    for index, (title, body, color) in enumerate(failures):
        x = 72 + index * 368
        c.rect(x, 710, 344, 78, fill=COLORS["panel_dark"], stroke=color, sw=2, radius=16)
        c.text(x + 18, 733, title, size=14, color=color, bold=True, fit_width=308)
        c.text(x + 18, 762, body, size=13, color=COLORS["muted"], fit_width=308)

    c.footer()
    c.save(meta["basename"])


def render_06(meta: dict[str, str]) -> None:
    c = Canvas(meta["title"], meta["description"])
    c.header(
        "DeepSeek Agent and Tool Evaluation Trace",
        "The model proposes; the application validates, authorizes, executes, and owns side-effect safety",
    )

    c.text(72, 272, "ALIGNED TRACE LANES", size=18, color=COLORS["white"], bold=True)
    c.text(1518, 272, "TIME ->", size=16, color=COLORS["muted"], bold=True, align="right")
    lane_labels = [
        "User intent",
        "DeepSeek model proposal",
        "Argument parsing",
        "Schema validation",
        "Authorization + policy",
        "Stubbed tool execution",
        "Tool result",
        "Continuation call",
        "Final answer",
        "Evaluator + reviewer",
    ]
    event_x = [342, 452, 586, 704, 830, 960, 1078, 1194, 1320, 1440]
    event_text = [
        "request",
        "proposal",
        "parse",
        "validate",
        "allow / stop",
        "synthetic stub",
        "result",
        "continue",
        "answer",
        "decision",
    ]
    event_colors = [
        COLORS["blue"],
        COLORS["purple"],
        COLORS["teal"],
        COLORS["green"],
        COLORS["amber"],
        COLORS["blue"],
        COLORS["teal"],
        COLORS["purple"],
        COLORS["green"],
        COLORS["amber"],
    ]
    top = 306
    gap = 43
    for index, label in enumerate(lane_labels):
        y = top + index * gap
        fill = COLORS["band"] if index % 2 == 0 else COLORS["panel_dark"]
        c.rect(72, y, 1456, 36, fill=fill, radius=8)
        c.text(90, y + 18, label, size=15, color=COLORS["white"], fit_width=238)
        c.line(310, y + 18, 1504, y + 18, color=COLORS["line"], sw=2)
        x = event_x[index]
        c.circle(x, y + 18, 8, fill=event_colors[index])
        c.pill(
            min(x + 18, 1390),
            y + 3,
            min(134, 1510 - min(x + 18, 1390)),
            30,
            event_text[index],
            color=event_colors[index],
            size=13,
        )
        if index < len(lane_labels) - 1:
            c.arrow(x + 8, y + 18, event_x[index + 1] - 8, y + gap + 18, color=COLORS["teal"], sw=2)

    c.line(650, 296, 650, 748, color=COLORS["amber"], sw=2, dash=(8, 7))
    c.text(650, 771, "PROPOSAL DOES NOT EXECUTE", size=13, color=COLORS["amber"], bold=True, align="center")
    c.line(900, 296, 900, 748, color=COLORS["coral"], sw=2, dash=(8, 7))
    c.text(900, 771, "INVALID / UNAUTHORIZED -> STOP", size=13, color=COLORS["coral"], bold=True, align="center")
    c.line(1128, 296, 1128, 748, color=COLORS["blue"], sw=2, dash=(8, 7))
    c.text(1128, 771, "PUBLIC TESTS USE STUBS", size=13, color=COLORS["blue"], bold=True, align="center")
    c.line(1364, 296, 1364, 748, color=COLORS["green"], sw=2, dash=(8, 7))
    c.text(1364, 771, "SIDE EFFECTS ARE APP-OWNED", size=13, color=COLORS["green"], bold=True, align="center")

    c.footer()
    c.save(meta["basename"])


def render_07(meta: dict[str, str]) -> None:
    c = Canvas(meta["title"], meta["description"])
    c.header(
        "CI Regression and Fail-Closed Release Gate",
        "Run broad offline checks on every change; make provider evaluation explicit, bounded, and auditable",
    )

    c.pill(72, 258, 260, 38, "TIER 1  |  EVERY CHANGE", color=COLORS["blue"])
    offline = [
        ("SCHEMA + FIXTURES", ["structure", "stable cases"]),
        ("SCORER UNIT TESTS", ["known labels", "edge cases"]),
        ("DATASET VALIDATION", ["splits", "leakage checks"]),
        ("NO PROVIDER CALL", ["fast", "zero API spend"]),
    ]
    for index, (title, lines) in enumerate(offline):
        x = 72 + index * 368
        node(c, x, 309, 344, 102, title, lines, COLORS["blue"], title_size=16, body_size=14)
        if index < len(offline) - 1:
            c.arrow(x + 344, 360, x + 358, 360, color=COLORS["blue"], sw=3)

    c.polyline_arrow([(1480, 411), (1480, 448), (112, 448), (112, 483)], color=COLORS["teal"], sw=3)
    c.pill(72, 466, 370, 38, "TIER 2  |  EXPLICIT BOUNDED PROVIDER RUN", color=COLORS["teal"])
    controls = [
        ("FROZEN PLAN", COLORS["purple"]),
        ("RESERVATION LEDGER", COLORS["blue"]),
        ("REQUEST + COST CAP", COLORS["amber"]),
        ("BOUNDED CONCURRENCY", COLORS["teal"]),
        ("ZERO AUTO RETRIES", COLORS["coral"]),
        ("SANITIZED EVIDENCE", COLORS["green"]),
        ("PRIVACY AUDIT", COLORS["green"]),
    ]
    widths = [180, 210, 210, 220, 190, 210, 190]
    x = 72
    for index, ((label, color), width) in enumerate(zip(controls, widths)):
        c.pill(x, 522, width, 44, label, color=color, size=13)
        if index < len(controls) - 1:
            c.arrow(x + width, 544, x + width + 12, 544, color=COLORS["teal"], sw=2)
        x += width + 20

    c.arrow(800, 568, 800, 610, color=COLORS["teal"], sw=4)
    c.rect(620, 612, 360, 54, fill=COLORS["panel"], stroke=COLORS["teal"], sw=2, radius=18)
    c.text(800, 639, "RELEASE DECISION", size=18, color=COLORS["teal"], bold=True, align="center")

    branches = [
        ("CRITICAL KNOWN FAILURE", "BLOCK", COLORS["coral"]),
        ("MATERIAL SEGMENT REGRESSION", "BLOCK", COLORS["coral"]),
        ("JUDGE DISAGREEMENT", "HUMAN REVIEW", COLORS["amber"]),
        ("COMPLETE PASS", "CANDIDATE RELEASE", COLORS["green"]),
        ("MISSING / FAILED EVIDENCE", "NO PUBLICATION", COLORS["purple"]),
    ]
    branch_width = 280
    branch_gap = 14
    start_x = 72
    branch_centers = [
        start_x + index * (branch_width + branch_gap) + branch_width // 2
        for index in range(len(branches))
    ]
    c.line(
        branch_centers[0],
        686,
        branch_centers[-1],
        686,
        color=COLORS["line"],
        sw=3,
    )
    c.arrow(800, 666, 800, 686, color=COLORS["teal"], sw=3)
    for index, (condition, outcome, color) in enumerate(branches):
        x = start_x + index * (branch_width + branch_gap)
        c.arrow(x + branch_width // 2, 686, x + branch_width // 2, 704, color=color, sw=2)
        c.rect(x, 707, branch_width, 76, fill=COLORS["panel_dark"], stroke=color, sw=2, radius=16)
        c.text(
            x + branch_width // 2,
            730,
            condition,
            size=13,
            color=COLORS["muted"],
            bold=True,
            align="center",
            fit_width=branch_width - 24,
        )
        c.text(
            x + branch_width // 2,
            759,
            outcome,
            size=15,
            color=color,
            bold=True,
            align="center",
            fit_width=branch_width - 24,
        )

    c.footer()
    c.save(meta["basename"])


RENDERERS = [
    render_01,
    render_02,
    render_03,
    render_04,
    render_05,
    render_06,
    render_07,
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_manifest() -> None:
    manifest_assets = []
    for meta in ASSETS:
        png_path = VISUALS_DIR / f'{meta["basename"]}.png'
        svg_path = VISUALS_DIR / f'{meta["basename"]}.svg'
        with Image.open(png_path) as image:
            dimensions = [image.width, image.height]
        manifest_assets.append(
            {
                "basename": meta["basename"],
                "evidence": "conceptual_only_no_live_result_claims",
                "alt": meta["alt"],
                "caption": meta["caption"],
                "png": {
                    "file": png_path.name,
                    "width": dimensions[0],
                    "height": dimensions[1],
                    "sha256": sha256(png_path),
                },
                "svg": {
                    "file": svg_path.name,
                    "editable_text_and_shapes": True,
                    "sha256": sha256(svg_path),
                },
            }
        )
    manifest = {
        "schema_version": "1.0.0",
        "generator": "visuals/source/render_conceptual_visuals.py",
        "status": "conceptual_visuals_01_07_complete",
        "asset_count": len(manifest_assets) * 2,
        "visual_08_generated": False,
        "assets": manifest_assets,
    }
    (VISUALS_DIR / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


def validate() -> None:
    errors = []
    for meta in ASSETS:
        png_path = VISUALS_DIR / f'{meta["basename"]}.png'
        svg_path = VISUALS_DIR / f'{meta["basename"]}.svg'
        if not png_path.exists() or not svg_path.exists():
            errors.append(f"missing asset pair: {meta['basename']}")
            continue
        with Image.open(png_path) as image:
            if image.size != (WIDTH, HEIGHT):
                errors.append(f"wrong PNG size: {png_path.name}: {image.size}")
        svg_text = svg_path.read_text(encoding="utf-8")
        for needle in (
            "<title",
            "<desc",
            FOOTER,
            'width="1600"',
            'height="900"',
        ):
            if needle not in svg_text:
                errors.append(f"missing {needle!r}: {svg_path.name}")
        if any("\u0600" <= char <= "\u06ff" for char in svg_text):
            errors.append(f"Arabic text detected: {svg_path.name}")
        if "live result" in svg_text.lower() and FOOTER not in svg_text:
            errors.append(f"possible live-result claim: {svg_path.name}")
    if (VISUALS_DIR / "08-deepseek-v4-live-evaluation-dashboard.png").exists():
        errors.append("Visual 08 must not be generated by the conceptual renderer")
    if (VISUALS_DIR / "08-deepseek-v4-live-evaluation-dashboard.svg").exists():
        errors.append("Visual 08 must not be generated by the conceptual renderer")
    if errors:
        raise SystemExit("\n".join(errors))


def main() -> None:
    VISUALS_DIR.mkdir(parents=True, exist_ok=True)
    for renderer, meta in zip(RENDERERS, ASSETS):
        renderer(meta)
    validate()
    write_manifest()
    print(f"Rendered {len(ASSETS)} conceptual visual pairs.")


if __name__ == "__main__":
    main()
