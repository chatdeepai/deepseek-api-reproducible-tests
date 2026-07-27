"""Render the DeepSeek observability article diagrams and evidence dashboard.

The same drawing commands produce editable SVG and 1600 x 900 PNG files.
Visuals 01-07 are explicitly conceptual. Visual 08 is fail-closed: it reads
only sanitized result files and is removed when either evidence gate fails.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from html import escape
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
VISUALS = ROOT / "visuals"
WIDTH = 1600
HEIGHT = 900

C = {
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
}

FONT_REGULAR = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")
FONT_MONO = Path(r"C:\Windows\Fonts\consola.ttf")
FONT_MONO_BOLD = Path(r"C:\Windows\Fonts\consolab.ttf")

CONCEPTUAL_BASENAMES = [
    "01-deepseek-observability-reference-architecture",
    "02-deepseek-signal-ownership-map",
    "03-privacy-safe-logging-pipeline",
    "04-streaming-timing-state-machine",
    "05-token-cache-cost-math",
    "06-tool-agent-trace-waterfall",
    "07-dashboard-alert-topology",
]
LIVE_BASENAME = "08-sanitized-live-results-dashboard"


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


def get_font(
    size: int,
    *,
    bold: bool = False,
    mono: bool = False,
) -> ImageFont.FreeTypeFont:
    if mono:
        path = FONT_MONO_BOLD if bold else FONT_MONO
    else:
        path = FONT_BOLD if bold else FONT_REGULAR
    return ImageFont.truetype(str(path), size=size)


class Canvas:
    """One drawing surface with synchronized raster and vector commands."""

    def __init__(self, accessible_title: str, accessible_description: str) -> None:
        self.image = Image.new("RGB", (WIDTH, HEIGHT), C["bg0"])
        self.draw = ImageDraw.Draw(self.image)
        for y in range(HEIGHT):
            self.draw.line(
                (0, y, WIDTH, y),
                fill=blend(C["bg0"], C["bg1"], y / HEIGHT),
            )
        self.draw.ellipse((1260, -370, 1940, 310), fill="#142d49")
        self.draw.ellipse((-315, 595, 365, 1275), fill="#0b303c")
        self.svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" '
            'viewBox="0 0 1600 900" role="img" '
            'aria-labelledby="visual-title visual-description">',
            f'<title id="visual-title">{escape(accessible_title)}</title>',
            (
                '<desc id="visual-description">'
                f"{escape(accessible_description)}</desc>"
            ),
            "<defs>",
            '<linearGradient id="bgGradient" x1="0" y1="0" x2="1" y2="1">',
            f'<stop offset="0%" stop-color="{C["bg0"]}"/>',
            f'<stop offset="100%" stop-color="{C["bg1"]}"/>',
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
        attrs = [
            f'cx="{x}"',
            f'cy="{y}"',
            f'r="{radius}"',
            f'fill="{fill}"',
        ]
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
        color: str = C["teal"],
        sw: int = 4,
    ) -> None:
        angle = math.atan2(y2 - y1, x2 - x1)
        head = 14
        line_end_x = x2 - math.cos(angle) * 8
        line_end_y = y2 - math.sin(angle) * 8
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
        coordinates = " ".join(
            f"{round(px, 1)},{round(py, 1)}" for px, py in points
        )
        self.svg.append(f'<polygon points="{coordinates}" fill="{color}"/>')

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
        svg_anchor = {
            "left": "start",
            "center": "middle",
            "right": "end",
        }[align]
        family = (
            "Cascadia Mono, Consolas, monospace"
            if mono
            else "Inter, Segoe UI, Arial, sans-serif"
        )
        weight = "800" if bold else "500"
        self.svg.append(
            f'<text x="{x}" y="{y + round(actual * 0.34)}" fill="{color}" '
            f'font-family="{family}" font-size="{actual}" '
            f'font-weight="{weight}" text-anchor="{svg_anchor}">'
            f"{escape(value)}</text>"
        )

    def multiline(
        self,
        x: int,
        y: int,
        lines: Iterable[str],
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
        for index, value in enumerate(lines):
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
        size: int = 17,
        mono: bool = False,
        fill: str = C["panel_dark"],
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
            mono=mono,
            fit_width=width - 24,
        )

    def header(self, title: str, subtitle: str) -> None:
        self.rect(
            72,
            52,
            710,
            44,
            fill="#0b2b35",
            stroke="#20707b",
            sw=2,
            radius=22,
        )
        self.text(
            96,
            74,
            "CHAT-DEEP.AI  |  DEEPSEEK OBSERVABILITY",
            size=20,
            color=C["teal"],
            bold=True,
            fit_width=662,
        )
        self.text(
            72,
            148,
            title,
            size=49,
            color=C["white"],
            bold=True,
            fit_width=1456,
        )
        self.text(
            72,
            201,
            subtitle,
            size=24,
            color=C["muted"],
            fit_width=1456,
        )
        self.rect(72, 227, 1456, 4, fill=C["teal"], radius=2)

    def conceptual_footer(self, detail: str) -> None:
        self.line(72, 828, 1528, 828, color=C["line"], sw=2)
        self.text(
            72,
            868,
            (
                "Conceptual observability diagram  |  no live-result claims"
                f"  |  {detail}"
            ),
            size=18,
            color=C["muted"],
            fit_width=1260,
        )
        self.text(
            1528,
            868,
            "chat-deep.ai",
            size=20,
            color=C["teal"],
            bold=True,
            align="right",
        )

    def live_footer(self, date_label: str) -> None:
        self.line(72, 828, 1528, 828, color=C["line"], sw=2)
        self.text(
            72,
            868,
            (
                f"{date_label}  |  sanitized live evidence  |  "
                "individual observations, not a benchmark or SLA"
            ),
            size=18,
            color=C["muted"],
            fit_width=1270,
        )
        self.text(
            1528,
            868,
            "chat-deep.ai",
            size=20,
            color=C["teal"],
            bold=True,
            align="right",
        )

    def save(self, basename: str) -> None:
        VISUALS.mkdir(parents=True, exist_ok=True)
        self.svg.append("</svg>")
        (VISUALS / f"{basename}.svg").write_text(
            "\n".join(self.svg) + "\n",
            encoding="utf-8",
        )
        self.image.save(
            VISUALS / f"{basename}.png",
            format="PNG",
            optimize=True,
        )


def bullet_list(
    canvas: Canvas,
    x: int,
    start_y: int,
    values: Iterable[str],
    *,
    color: str,
    width: int,
    gap: int = 34,
    size: int = 17,
) -> None:
    for index, value in enumerate(values):
        cy = start_y + index * gap
        canvas.circle(x, cy, 6, fill=color)
        canvas.text(
            x + 18,
            cy,
            value,
            size=size,
            color=C["muted"],
            fit_width=width - 18,
        )


def titled_card(
    canvas: Canvas,
    x: int,
    y: int,
    width: int,
    height: int,
    *,
    title: str,
    eyebrow: str,
    color: str,
    details: Iterable[str],
) -> None:
    canvas.rect(
        x,
        y,
        width,
        height,
        fill=C["panel"],
        stroke=color,
        sw=2,
        radius=22,
    )
    canvas.pill(
        x + 20,
        y + 18,
        width - 40,
        34,
        eyebrow,
        color=color,
        size=13,
    )
    canvas.text(
        x + 24,
        y + 88,
        title,
        size=23,
        color=color,
        bold=True,
        fit_width=width - 48,
    )
    bullet_list(
        canvas,
        x + 30,
        y + 132,
        details,
        color=color,
        width=width - 58,
        gap=34,
        size=17,
    )


def visual_01() -> None:
    title = "DeepSeek Observability Reference Architecture"
    subtitle = (
        "Keep the model call inside the application trace, then emit only "
        "redacted, versioned signals"
    )
    canvas = Canvas(
        title,
        (
            "Reference architecture connecting the product request, application "
            "controls, DeepSeek client span, privacy-safe telemetry, stores, "
            "dashboards, and alerts."
        ),
    )
    canvas.header(title, subtitle)

    stages = [
        (72, "PRODUCT", "request + context", C["blue"]),
        (332, "APP BOUNDARY", "auth + policy", C["purple"]),
        (592, "CLIENT SPAN", "DeepSeek call", C["teal"]),
        (852, "VALIDATION", "contract + quality", C["amber"]),
        (1112, "OUTCOME", "safe response", C["green"]),
    ]
    for index, (x, label, detail, color) in enumerate(stages):
        canvas.rect(
            x,
            286,
            220,
            134,
            fill=C["panel"],
            stroke=color,
            sw=2,
            radius=20,
        )
        canvas.circle(x + 28, 318, 10, fill=color)
        canvas.text(
            x + 48,
            318,
            label,
            size=19,
            color=color,
            bold=True,
            fit_width=150,
        )
        canvas.text(
            x + 24,
            374,
            detail,
            size=18,
            color=C["muted"],
            fit_width=172,
        )
        if index < len(stages) - 1:
            next_x = stages[index + 1][0]
            canvas.arrow(x + 220, 353, next_x - 12, 353)

    canvas.rect(
        72,
        474,
        1456,
        292,
        fill=C["band"],
        stroke=C["line"],
        sw=2,
        radius=24,
    )
    canvas.text(
        104,
        510,
        "TELEMETRY PLANE",
        size=22,
        color=C["white"],
        bold=True,
    )
    plane = [
        (104, "SAFE EVENT BUILDER", ["allowlist", "schema version"], C["teal"]),
        (398, "OTEL COLLECTOR", ["batch + sample", "route"], C["blue"]),
        (692, "SIGNAL STORES", ["traces + logs", "metrics + evals"], C["purple"]),
        (986, "DASHBOARDS", ["bounded labels", "owned targets"], C["green"]),
        (1280, "ALERTS", ["runbook", "safe exemplar"], C["amber"]),
    ]
    for index, (x, label, details, color) in enumerate(plane):
        canvas.rect(
            x,
            548,
            246,
            164,
            fill=C["panel_dark"],
            stroke=color,
            sw=2,
            radius=18,
        )
        canvas.text(
            x + 123,
            583,
            label,
            size=17,
            color=color,
            bold=True,
            align="center",
            fit_width=214,
        )
        canvas.multiline(
            x + 123,
            631,
            details,
            size=16,
            color=C["muted"],
            gap=29,
            fit_width=210,
        )
        if index < len(plane) - 1:
            next_x = plane[index + 1][0]
            canvas.arrow(x + 246, 630, next_x - 12, 630, color=C["teal"])

    canvas.arrow(702, 420, 702, 535, color=C["teal"])
    canvas.rect(
        1160,
        442,
        340,
        60,
        fill=C["danger"],
        stroke=C["coral"],
        sw=2,
        radius=18,
    )
    canvas.text(
        1182,
        472,
        "RAW CONTENT PATH: BLOCKED",
        size=17,
        color=C["coral"],
        bold=True,
        fit_width=296,
    )
    canvas.line(
        1128,
        420,
        1128,
        472,
        color=C["coral"],
        sw=3,
        dash=(8, 7),
    )
    canvas.arrow(1128, 472, 1150, 472, color=C["coral"])
    canvas.conceptual_footer("reference design, not a deployment claim")
    canvas.save(CONCEPTUAL_BASENAMES[0])


def visual_02() -> None:
    title = "Who Owns Each DeepSeek Signal?"
    subtitle = (
        "Classify evidence before aggregation so estimates never masquerade "
        "as provider-returned facts"
    )
    canvas = Canvas(
        title,
        (
            "Four signal domains distinguish provider-returned fields, "
            "application measurements, evaluator results, and account or "
            "reconciled evidence."
        ),
    )
    canvas.header(title, subtitle)

    columns = [
        (
            72,
            "PROVIDER-RETURNED",
            "SOURCE: RESPONSE",
            C["blue"],
            [
                "model identifier",
                "finish reason",
                "usage totals",
                "cache hit / miss tokens",
            ],
        ),
        (
            444,
            "APPLICATION-MEASURED",
            "SOURCE: CLIENT CLOCK",
            C["teal"],
            [
                "request duration",
                "first parsed event",
                "first visible content",
                "retry / cancel state",
            ],
        ),
        (
            816,
            "EVALUATOR-PRODUCED",
            "SOURCE: TEST CONTRACT",
            C["purple"],
            [
                "schema pass / fail",
                "word-count contract",
                "grounding checks",
                "human feedback",
            ],
        ),
        (
            1188,
            "ACCOUNT / RECONCILED",
            "SOURCE: EXTERNAL RECORD",
            C["amber"],
            [
                "dated price snapshot",
                "estimated token cost",
                "billing reconciliation",
                "budget status",
            ],
        ),
    ]
    for x, label, eyebrow, color, details in columns:
        titled_card(
            canvas,
            x,
            286,
            340,
            372,
            title=label,
            eyebrow=eyebrow,
            color=color,
            details=details,
        )

    canvas.rect(
        188,
        700,
        1224,
        96,
        fill=C["soft_teal"],
        stroke=C["teal"],
        sw=2,
        radius=22,
    )
    canvas.text(
        800,
        732,
        "OWNERSHIP BEFORE AGGREGATION",
        size=23,
        color=C["teal"],
        bold=True,
        align="center",
    )
    canvas.text(
        800,
        770,
        "record source + unit + schema version + derivation status",
        size=19,
        color=C["white"],
        align="center",
        fit_width=1120,
    )
    canvas.conceptual_footer("source taxonomy only")
    canvas.save(CONCEPTUAL_BASENAMES[1])


def visual_03() -> None:
    title = "Privacy-Safe DeepSeek Logging Pipeline"
    subtitle = (
        "Construct a new event from approved metadata; never send raw request "
        "or response objects into logging"
    )
    canvas = Canvas(
        title,
        (
            "Pipeline from a quarantined raw request and response through an "
            "allowlist, redaction gate, bounded-cardinality controls, sampling, "
            "retention, access control, and approved signal stores."
        ),
    )
    canvas.header(title, subtitle)

    canvas.rect(
        72,
        286,
        300,
        350,
        fill=C["danger"],
        stroke=C["coral"],
        sw=2,
        radius=22,
    )
    canvas.pill(
        96,
        306,
        252,
        36,
        "QUARANTINED INPUT",
        color=C["coral"],
        size=14,
    )
    canvas.text(
        222,
        389,
        "RAW REQUEST",
        size=22,
        color=C["white"],
        bold=True,
        align="center",
    )
    canvas.text(
        222,
        438,
        "+",
        size=32,
        color=C["coral"],
        bold=True,
        align="center",
    )
    canvas.text(
        222,
        487,
        "RAW RESPONSE",
        size=22,
        color=C["white"],
        bold=True,
        align="center",
    )
    canvas.pill(
        112,
        548,
        220,
        46,
        "DO NOT LOG",
        color=C["coral"],
        size=17,
    )

    pipeline = [
        (420, "ALLOWLIST", ["model", "status", "usage"], C["teal"]),
        (680, "REDACT", ["safe errors", "no identifiers"], C["purple"]),
        (940, "CONTROL", ["bounded labels", "schema version"], C["blue"]),
        (1200, "GOVERN", ["sample", "retain", "authorize"], C["green"]),
    ]
    for index, (x, label, details, color) in enumerate(pipeline):
        canvas.rect(
            x,
            320,
            220,
            278,
            fill=C["panel"],
            stroke=color,
            sw=2,
            radius=20,
        )
        canvas.circle(x + 110, 367, 24, fill=color)
        canvas.text(
            x + 110,
            367,
            str(index + 1),
            size=16,
            color=C["ink"],
            bold=True,
            align="center",
        )
        canvas.text(
            x + 110,
            422,
            label,
            size=21,
            color=color,
            bold=True,
            align="center",
        )
        canvas.multiline(
            x + 110,
            480,
            details,
            size=16,
            color=C["muted"],
            gap=31,
            fit_width=184,
        )
        if index == 0:
            canvas.arrow(372, 459, x - 12, 459)
        if index < len(pipeline) - 1:
            next_x = pipeline[index + 1][0]
            canvas.arrow(x + 220, 459, next_x - 12, 459)

    canvas.rect(
        420,
        646,
        1000,
        150,
        fill=C["band"],
        stroke=C["line"],
        sw=2,
        radius=22,
    )
    canvas.text(
        450,
        677,
        "FIELDS THAT NEVER ENTER THE PUBLIC TELEMETRY PATH",
        size=19,
        color=C["coral"],
        bold=True,
    )
    banned = [
        ("API KEY", 450),
        ("PROMPTS", 606),
        ("OUTPUT", 762),
        ("REASONING", 918),
        ("TOOL DATA", 1074),
        ("PROVIDER IDS", 1230),
    ]
    for label, x in banned:
        canvas.pill(
            x,
            718,
            140,
            42,
            label,
            color=C["coral"],
            size=13,
            fill=C["danger"],
        )
    canvas.conceptual_footer("privacy control flow only")
    canvas.save(CONCEPTUAL_BASENAMES[2])


def visual_04() -> None:
    title = "Streaming Timing State Machine"
    subtitle = (
        "Measure transport, parsed events, visible content, finish state, and "
        "terminal usage as separate milestones"
    )
    canvas = Canvas(
        title,
        (
            "Horizontal streaming state machine from request start through "
            "network data, parsed JSON, visible content, finish reason, terminal "
            "usage, and safe span closure, with timeout and cancellation exits."
        ),
    )
    canvas.header(title, subtitle)

    y = 454
    stages = [
        (92, "REQUEST", "t0", C["blue"]),
        (316, "NETWORK DATA", "transport", C["purple"]),
        (540, "PARSED JSON", "first event", C["teal"]),
        (764, "VISIBLE CONTENT", "TTFC", C["green"]),
        (988, "FINISH REASON", "terminal state", C["amber"]),
        (1212, "FINAL USAGE", "usage chunk", C["blue"]),
        (1436, "CLOSE SPAN", "DONE", C["green"]),
    ]
    canvas.line(92, y, 1436, y, color=C["line"], sw=8)
    for index, (x, label, detail, color) in enumerate(stages):
        canvas.circle(x, y, 30, fill=C["panel_dark"], stroke=color, sw=5)
        canvas.circle(x, y, 11, fill=color)
        label_y = 352 if index % 2 == 0 else 555
        canvas.rect(
            x - 92,
            label_y - 42,
            184,
            84,
            fill=C["panel"],
            stroke=color,
            sw=2,
            radius=16,
        )
        canvas.text(
            x,
            label_y - 12,
            label,
            size=16,
            color=color,
            bold=True,
            align="center",
            fit_width=160,
        )
        canvas.text(
            x,
            label_y + 19,
            detail,
            size=15,
            color=C["muted"],
            align="center",
            fit_width=158,
        )
        if index % 2 == 0:
            canvas.line(x, label_y + 42, x, y - 34, color=color, sw=2)
        else:
            canvas.line(x, y + 34, x, label_y - 42, color=color, sw=2)

    canvas.rect(
        196,
        690,
        1208,
        106,
        fill=C["danger"],
        stroke=C["coral"],
        sw=2,
        radius=22,
    )
    canvas.text(
        230,
        721,
        "EARLY EXIT",
        size=20,
        color=C["coral"],
        bold=True,
    )
    canvas.text(
        230,
        762,
        "timeout  |  user cancellation  |  parse failure  |  incomplete terminal state",
        size=19,
        color=C["white"],
        fit_width=780,
    )
    canvas.arrow(1044, 744, 1130, 744, color=C["coral"])
    canvas.pill(
        1146,
        719,
        226,
        50,
        "CLASSIFY + CLOSE",
        color=C["coral"],
        size=16,
    )
    canvas.conceptual_footer("timing method, with no latency observation")
    canvas.save(CONCEPTUAL_BASENAMES[3])


def visual_05() -> None:
    title = "DeepSeek Token, Cache, and Cost Math"
    subtitle = (
        "Treat provider usage as measured, estimated cost as derived, and "
        "billing as a separate reconciliation step"
    )
    canvas = Canvas(
        title,
        (
            "Symbolic calculation showing prompt tokens split into cache-hit "
            "and cache-miss input, estimated token cost from a dated price "
            "snapshot, and later billing reconciliation."
        ),
    )
    canvas.header(title, subtitle)

    titled_card(
        canvas,
        72,
        286,
        400,
        332,
        title="PROVIDER USAGE",
        eyebrow="MEASURED",
        color=C["blue"],
        details=[
            "H = cache-hit input",
            "M = cache-miss input",
            "O = output tokens",
            "prompt = H + M",
            "total = H + M + O",
        ],
    )
    titled_card(
        canvas,
        600,
        286,
        400,
        332,
        title="DATED PRICE SNAPSHOT",
        eyebrow="EXTERNAL INPUT",
        color=C["purple"],
        details=[
            "pH = hit price / 1M",
            "pM = miss price / 1M",
            "pO = output price / 1M",
            "source + retrieval date",
        ],
    )
    titled_card(
        canvas,
        1128,
        286,
        400,
        332,
        title="ESTIMATED COST",
        eyebrow="DERIVED",
        color=C["green"],
        details=[
            "H x pH",
            "+ M x pM",
            "+ O x pO",
            "then divide by 1,000,000",
        ],
    )
    canvas.arrow(472, 452, 588, 452, color=C["teal"])
    canvas.arrow(1000, 452, 1116, 452, color=C["teal"])

    canvas.rect(
        174,
        660,
        1252,
        136,
        fill=C["band"],
        stroke=C["amber"],
        sw=2,
        radius=24,
    )
    canvas.text(
        800,
        696,
        "RECONCILIATION BOUNDARY",
        size=22,
        color=C["amber"],
        bold=True,
        align="center",
    )
    canvas.text(
        800,
        740,
        "estimated token cost  ->  account billing export  ->  variance review",
        size=23,
        color=C["white"],
        bold=True,
        align="center",
        fit_width=1140,
    )
    canvas.text(
        800,
        775,
        "Reasoning tokens already included in completion must not be charged twice.",
        size=17,
        color=C["muted"],
        align="center",
        fit_width=1130,
    )
    canvas.conceptual_footer("symbolic formula; no price or cost observation")
    canvas.save(CONCEPTUAL_BASENAMES[4])


def visual_06() -> None:
    title = "DeepSeek Tool and Agent Trace Waterfall"
    subtitle = (
        "A model can propose a call; only the application validates, "
        "authorizes, executes, and records the side effect"
    )
    canvas = Canvas(
        title,
        (
            "Trace waterfall with application, DeepSeek model, policy gate, "
            "tool adapter, and evaluator lanes across proposal, validation, "
            "authorization, execution, continuation, and final validation."
        ),
    )
    canvas.header(title, subtitle)

    lanes = [
        (300, "APPLICATION", C["blue"]),
        (390, "DEEPSEEK MODEL", C["purple"]),
        (480, "POLICY GATE", C["amber"]),
        (570, "TOOL ADAPTER", C["teal"]),
        (660, "EVALUATOR", C["green"]),
    ]
    for y, label, color in lanes:
        canvas.text(
            72,
            y,
            label,
            size=17,
            color=color,
            bold=True,
            fit_width=170,
        )
        canvas.line(238, y, 1528, y, color=C["line"], sw=2)

    phases = [
        (258, 300, 180, "INBOUND", C["blue"]),
        (424, 390, 184, "PROPOSE CALL", C["purple"]),
        (594, 480, 190, "PARSE + SCHEMA", C["amber"]),
        (770, 480, 164, "AUTHORIZE", C["amber"]),
        (920, 570, 182, "EXECUTE", C["teal"]),
        (1088, 300, 184, "APPEND RESULT", C["blue"]),
        (1258, 390, 150, "CONTINUE", C["purple"]),
        (1394, 660, 130, "VALIDATE", C["green"]),
    ]
    for index, (x, y, width, label, color) in enumerate(phases):
        canvas.rect(
            x,
            y - 25,
            width,
            50,
            fill=C["panel"],
            stroke=color,
            sw=2,
            radius=15,
        )
        canvas.text(
            x + width // 2,
            y,
            label,
            size=14,
            color=color,
            bold=True,
            align="center",
            fit_width=width - 20,
        )
        if index < len(phases) - 1:
            next_x, next_y, _, _, next_color = phases[index + 1]
            canvas.arrow(
                x + width,
                y,
                next_x - 10,
                next_y,
                color=next_color,
                sw=3,
            )

    canvas.rect(
        340,
        722,
        920,
        74,
        fill=C["danger"],
        stroke=C["coral"],
        sw=2,
        radius=20,
    )
    canvas.text(
        800,
        759,
        "MODEL PROPOSAL != TOOL EXECUTION",
        size=24,
        color=C["coral"],
        bold=True,
        align="center",
    )
    canvas.conceptual_footer("control-flow trace only")
    canvas.save(CONCEPTUAL_BASENAMES[5])


def visual_07() -> None:
    title = "Dashboard and Alert Topology"
    subtitle = (
        "Bound label cardinality, keep targets application-owned, and use safe "
        "exemplars to reach the right trace"
    )
    canvas = Canvas(
        title,
        (
            "Dashboard panels for reliability, streaming, usage and cost, "
            "contracts, tools, and telemetry health feeding an application-owned "
            "alert pipeline and a privacy-safe trace."
        ),
    )
    canvas.header(title, subtitle)

    panels = [
        (72, 286, "RELIABILITY", ["status class", "finish state"], C["blue"]),
        (320, 286, "STREAMING", ["first event", "first content"], C["teal"]),
        (568, 286, "TOKENS / CACHE", ["usage mix", "cost estimate"], C["purple"]),
        (816, 286, "CONTRACTS", ["schema", "quality checks"], C["green"]),
        (1064, 286, "TOOL HEALTH", ["proposal", "policy outcome"], C["amber"]),
        (1312, 286, "TELEMETRY", ["drop rate", "exporter health"], C["coral"]),
    ]
    for x, y, label, details, color in panels:
        canvas.rect(
            x,
            y,
            216,
            186,
            fill=C["panel"],
            stroke=color,
            sw=2,
            radius=20,
        )
        canvas.text(
            x + 108,
            y + 42,
            label,
            size=17,
            color=color,
            bold=True,
            align="center",
            fit_width=188,
        )
        canvas.multiline(
            x + 108,
            y + 100,
            details,
            size=15,
            color=C["muted"],
            gap=31,
            fit_width=184,
        )
        canvas.line(
            x + 42,
            y + 158,
            x + 72,
            y + 139,
            color=color,
            sw=3,
        )
        canvas.line(
            x + 72,
            y + 139,
            x + 112,
            y + 150,
            color=color,
            sw=3,
        )
        canvas.line(
            x + 112,
            y + 150,
            x + 166,
            y + 120,
            color=color,
            sw=3,
        )

    canvas.line(180, 496, 1420, 496, color=C["line"], sw=3)
    for x in (180, 428, 676, 924, 1172, 1420):
        canvas.line(x, 472, x, 496, color=C["line"], sw=3)
    canvas.arrow(800, 496, 800, 548, color=C["teal"])

    topology = [
        (72, "BOUNDED LABELS", C["teal"]),
        (330, "BASELINE / TARGET", C["blue"]),
        (588, "ALERT ROUTER", C["amber"]),
        (846, "RUNBOOK", C["purple"]),
        (1104, "SAFE EXEMPLAR", C["green"]),
        (1362, "TRACE", C["teal"]),
    ]
    for index, (x, label, color) in enumerate(topology):
        width = 192 if index < len(topology) - 1 else 166
        canvas.rect(
            x,
            566,
            width,
            104,
            fill=C["panel_dark"],
            stroke=color,
            sw=2,
            radius=18,
        )
        canvas.text(
            x + width // 2,
            618,
            label,
            size=15,
            color=color,
            bold=True,
            align="center",
            fit_width=width - 20,
        )
        if index < len(topology) - 1:
            next_x = topology[index + 1][0]
            canvas.arrow(x + width, 618, next_x - 10, 618, color=C["teal"])

    canvas.rect(
        260,
        714,
        1080,
        82,
        fill=C["danger"],
        stroke=C["amber"],
        sw=2,
        radius=20,
    )
    canvas.text(
        800,
        755,
        "Application-owned targets  |  no provider SLA is implied",
        size=22,
        color=C["amber"],
        bold=True,
        align="center",
        fit_width=1020,
    )
    canvas.conceptual_footer("monitoring topology only")
    canvas.save(CONCEPTUAL_BASENAMES[6])


def read_json(path: Path, label: str) -> dict[str, Any]:
    if not path.is_file():
        raise RuntimeError(f"Missing required {label}: {path.name}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Invalid required {label}: {path.name}") from error
    if not isinstance(value, dict):
        raise RuntimeError(f"The required {label} must be a JSON object.")
    return value


def require_path(value: dict[str, Any], *path: str) -> Any:
    current: Any = value
    for key in path:
        if not isinstance(current, dict) or key not in current:
            raise RuntimeError(
                "Missing required live-summary field: " + ".".join(path)
            )
        current = current[key]
    return current


def require_bool(value: Any, field: str) -> bool:
    if not isinstance(value, bool):
        raise RuntimeError(f"{field} must be a boolean.")
    return value


def require_int(value: Any, field: str, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise RuntimeError(f"{field} must be an integer >= {minimum}.")
    return value


def require_number(value: Any, field: str, *, minimum: float = 0.0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RuntimeError(f"{field} must be numeric.")
    number = float(value)
    if not math.isfinite(number) or number < minimum:
        raise RuntimeError(f"{field} must be finite and >= {minimum}.")
    return number


def assert_zero_findings(audit: dict[str, Any]) -> None:
    zero_fields = [
        "forbidden_field_findings",
        "forbidden_result_field_findings",
        "secret_findings",
        "internal_identifier_findings",
        "contact_findings",
        "local_path_findings",
        "non_ascii_characters",
        "mojibake_matches",
    ]
    for field in zero_fields:
        if field in audit and audit[field] != 0:
            raise RuntimeError(f"Privacy audit blocks rendering: {field}.")
    checks = audit.get("checks")
    if isinstance(checks, dict) and (
        not checks or not all(result is True for result in checks.values())
    ):
        raise RuntimeError("Privacy audit checks are not all passing.")


def normalize_cost_text(value: Any) -> str:
    require_number(value, "totals.estimated_cost_usd")
    if isinstance(value, str):
        return value
    return str(value)


def date_label_from_summary(summary: dict[str, Any]) -> str:
    executed = require_path(summary, "executed_at_utc")
    if not isinstance(executed, str) or len(executed) < 10:
        raise RuntimeError("executed_at_utc must be an ISO timestamp.")
    date = executed[:10]
    if (
        len(date) != 10
        or date[4] != "-"
        or date[7] != "-"
        or not date.replace("-", "").isdigit()
    ):
        raise RuntimeError("executed_at_utc must begin with an ISO date.")
    return f"{date} UTC"


def load_live_dashboard_evidence() -> dict[str, Any]:
    live_path = ROOT / "results" / "live-summary.json"
    audit_path = ROOT / "results" / "privacy-audit.json"
    live_audit_path = ROOT / "results" / "live-privacy-audit.json"

    live = read_json(live_path, "live summary")
    audit = read_json(audit_path, "privacy audit")
    if audit.get("status") != "pass":
        raise RuntimeError("The required privacy audit did not pass.")
    assert_zero_findings(audit)

    if live_audit_path.exists():
        live_audit = read_json(live_audit_path, "live privacy audit")
        if live_audit.get("status") != "pass":
            raise RuntimeError("The live evidence audit did not pass.")
        assert_zero_findings(live_audit.get("privacy", live_audit))
        checks = live_audit.get("checks")
        if not isinstance(checks, dict) or not checks:
            raise RuntimeError("The live evidence audit has no checks.")
        if not all(result is True for result in checks.values()):
            raise RuntimeError("The live evidence audit checks are incomplete.")

    cases = require_path(live, "cases")
    if not isinstance(cases, list):
        raise RuntimeError("live-summary cases must be an array.")
    expected_ids = [f"OBS-LIVE-{number:02d}" for number in range(1, 9)]
    observed_ids = [
        case.get("id") if isinstance(case, dict) else None for case in cases
    ]
    if observed_ids != expected_ids:
        raise RuntimeError("The live-summary case order is incomplete.")
    case_map = {case["id"]: case for case in cases}

    totals = require_path(live, "totals")
    method = require_path(live, "method")
    if not isinstance(totals, dict) or not isinstance(method, dict):
        raise RuntimeError("Live totals and method must be objects.")

    total_tokens = require_int(
        require_path(live, "totals", "total_tokens"),
        "totals.total_tokens",
    )
    prompt_tokens = require_int(
        require_path(live, "totals", "prompt_tokens"),
        "totals.prompt_tokens",
    )
    completion_tokens = require_int(
        require_path(live, "totals", "completion_tokens"),
        "totals.completion_tokens",
    )
    if prompt_tokens + completion_tokens != total_tokens:
        raise RuntimeError("Live token totals do not reconcile.")
    estimated_cost = require_path(live, "totals", "estimated_cost_usd")
    require_number(estimated_cost, "totals.estimated_cost_usd")

    http_200 = require_int(
        require_path(live, "totals", "http_200"),
        "totals.http_200",
    )
    expected_400 = require_int(
        require_path(live, "totals", "expected_http_400"),
        "totals.expected_http_400",
    )
    expected_outcomes = require_int(
        require_path(live, "totals", "expected_outcomes_observed"),
        "totals.expected_outcomes_observed",
    )
    if http_200 + expected_400 != len(cases) or expected_outcomes != len(cases):
        raise RuntimeError("Live outcome totals do not reconcile.")

    stream = case_map["OBS-LIVE-02"]
    stream_events = require_int(
        require_path(stream, "stream", "json_event_count")
        if isinstance(stream.get("stream"), dict)
        else require_path(stream, "sse_json_event_count"),
        "OBS-LIVE-02.json_event_count",
    )
    stream_ttfc = require_int(
        require_path(stream, "stream", "time_to_first_json_event_ms")
        if isinstance(stream.get("stream"), dict)
        else require_path(stream, "time_to_first_json_event_ms"),
        "OBS-LIVE-02.time_to_first_json_event_ms",
    )
    stream_first_content = require_int(
        require_path(stream, "stream", "time_to_first_content_ms")
        if isinstance(stream.get("stream"), dict)
        else require_path(stream, "time_to_first_content_ms"),
        "OBS-LIVE-02.time_to_first_content_ms",
    )
    stream_terminal_usage = require_bool(
        require_path(stream, "terminal_usage_present"),
        "OBS-LIVE-02.terminal_usage_present",
    )
    stream_words = require_int(
        require_path(stream, "output_word_count"),
        "OBS-LIVE-02.output_word_count",
    )
    quality_miss = require_bool(
        require_path(
            live,
            "totals",
            "stream_monitor_detected_quality_miss",
        ),
        "totals.stream_monitor_detected_quality_miss",
    )

    json_case = case_map["OBS-LIVE-03"]
    tool_case = case_map["OBS-LIVE-04"]
    thinking_case = case_map["OBS-LIVE-05"]
    cache_first = case_map["OBS-LIVE-06"]
    cache_repeat = case_map["OBS-LIVE-07"]
    invalid_case = case_map["OBS-LIVE-08"]

    json_valid = (
        require_bool(
            require_path(json_case, "json_parse_valid"),
            "OBS-LIVE-03.json_parse_valid",
        )
        and require_bool(
            require_path(json_case, "json_schema_valid"),
            "OBS-LIVE-03.json_schema_valid",
        )
    )
    json_fields = require_int(
        require_path(json_case, "json_field_count"),
        "OBS-LIVE-03.json_field_count",
    )
    tool_count = require_int(
        require_path(tool_case, "tool_call_count"),
        "OBS-LIVE-04.tool_call_count",
    )
    tool_valid = all(
        require_bool(require_path(tool_case, field), f"OBS-LIVE-04.{field}")
        for field in (
            "tool_name_valid",
            "tool_arguments_json_valid",
            "tool_arguments_schema_valid",
        )
    )
    tool_executed = require_bool(
        require_path(tool_case, "tool_output_executed"),
        "OBS-LIVE-04.tool_output_executed",
    )
    reasoning_tokens = require_int(
        require_path(thinking_case, "usage", "reasoning_tokens"),
        "OBS-LIVE-05.usage.reasoning_tokens",
    )
    thinking_final = require_bool(
        require_path(thinking_case, "exact_final_answer"),
        "OBS-LIVE-05.exact_final_answer",
    )
    cold_prompt = require_int(
        require_path(cache_first, "usage", "prompt_tokens"),
        "OBS-LIVE-06.usage.prompt_tokens",
    )
    cold_hits = require_int(
        require_path(cache_first, "usage", "prompt_cache_hit_tokens"),
        "OBS-LIVE-06.usage.prompt_cache_hit_tokens",
    )
    repeat_prompt = require_int(
        require_path(cache_repeat, "usage", "prompt_tokens"),
        "OBS-LIVE-07.usage.prompt_tokens",
    )
    repeat_hits = require_int(
        require_path(cache_repeat, "usage", "prompt_cache_hit_tokens"),
        "OBS-LIVE-07.usage.prompt_cache_hit_tokens",
    )
    repeat_misses = require_int(
        require_path(cache_repeat, "usage", "prompt_cache_miss_tokens"),
        "OBS-LIVE-07.usage.prompt_cache_miss_tokens",
    )
    if repeat_hits + repeat_misses != repeat_prompt:
        raise RuntimeError("Repeat-cache token fields do not reconcile.")
    invalid_status = require_int(
        require_path(invalid_case, "http_status"),
        "OBS-LIVE-08.http_status",
        minimum=100,
    )
    invalid_expected = require_bool(
        require_path(invalid_case, "expected_error"),
        "OBS-LIVE-08.expected_error",
    )
    invalid_type = require_path(invalid_case, "error_type")
    if not isinstance(invalid_type, str) or not invalid_type:
        raise RuntimeError("OBS-LIVE-08.error_type must be a string.")

    storage_flags = {
        "raw_prompt_storage": require_bool(
            require_path(live, "method", "raw_prompt_storage"),
            "method.raw_prompt_storage",
        ),
        "raw_output_storage": require_bool(
            require_path(live, "method", "raw_output_storage"),
            "method.raw_output_storage",
        ),
        "provider_request_id_storage": require_bool(
            require_path(live, "method", "provider_request_id_storage"),
            "method.provider_request_id_storage",
        ),
        "api_key_storage": require_bool(
            require_path(live, "method", "api_key_storage"),
            "method.api_key_storage",
        ),
    }
    if any(storage_flags.values()):
        raise RuntimeError("Unsafe storage flags block dashboard rendering.")

    return {
        "date_label": date_label_from_summary(live),
        "case_count": len(cases),
        "http_200": http_200,
        "expected_400": expected_400,
        "total_tokens": total_tokens,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "estimated_cost_text": normalize_cost_text(estimated_cost),
        "audit_status": str(audit["status"]).upper(),
        "stream_events": stream_events,
        "stream_ttfc": stream_ttfc,
        "stream_first_content": stream_first_content,
        "stream_terminal_usage": stream_terminal_usage,
        "stream_words": stream_words,
        "quality_miss": quality_miss,
        "json_valid": json_valid,
        "json_fields": json_fields,
        "tool_count": tool_count,
        "tool_valid": tool_valid,
        "tool_executed": tool_executed,
        "reasoning_tokens": reasoning_tokens,
        "thinking_final": thinking_final,
        "cold_prompt": cold_prompt,
        "cold_hits": cold_hits,
        "repeat_prompt": repeat_prompt,
        "repeat_hits": repeat_hits,
        "repeat_misses": repeat_misses,
        "invalid_status": invalid_status,
        "invalid_expected": invalid_expected,
        "invalid_type": invalid_type,
        "concurrency": require_int(
            require_path(live, "method", "concurrency"),
            "method.concurrency",
            minimum=1,
        ),
        "retries": require_int(
            require_path(live, "method", "provider_retries"),
            "method.provider_retries",
        ),
        "timeout_ms": require_int(
            require_path(live, "method", "request_timeout_ms"),
            "method.request_timeout_ms",
            minimum=1,
        ),
    }


def truth_label(value: bool, *, positive: str = "YES", negative: str = "NO") -> str:
    return positive if value else negative


def visual_08() -> None:
    evidence = load_live_dashboard_evidence()
    title = "Sanitized DeepSeek Observability: Live Results"
    subtitle = (
        "Eight bounded cases connect lifecycle health, usage, cache evidence, "
        "contract checks, and privacy controls"
    )
    canvas = Canvas(
        title,
        (
            "Sanitized results dashboard generated from the passing live summary "
            "and privacy audit, with exact case, token, cost, streaming, cache, "
            "contract, and method values."
        ),
    )
    canvas.header(title, subtitle)

    cards = [
        (
            72,
            "PLANNED CASES",
            str(evidence["case_count"]),
            (
                f'{evidence["http_200"]} HTTP 200 + '
                f'{evidence["expected_400"]} expected 400'
            ),
            C["blue"],
        ),
        (
            444,
            "TOTAL TOKENS",
            f'{evidence["total_tokens"]:,}',
            (
                f'{evidence["prompt_tokens"]:,} prompt + '
                f'{evidence["completion_tokens"]:,} completion'
            ),
            C["teal"],
        ),
        (
            816,
            "ESTIMATED COST",
            f'${evidence["estimated_cost_text"]}',
            "dated official price snapshot",
            C["purple"],
        ),
        (
            1188,
            "PRIVACY AUDIT",
            evidence["audit_status"],
            "required evidence gate",
            C["green"],
        ),
    ]
    for x, label, value, detail, color in cards:
        canvas.rect(
            x,
            260,
            340,
            144,
            fill=C["panel"],
            stroke=color,
            sw=2,
            radius=20,
        )
        canvas.text(
            x + 22,
            290,
            label,
            size=16,
            color=color,
            bold=True,
            fit_width=296,
        )
        canvas.text(
            x + 22,
            338,
            value,
            size=34,
            color=C["white"],
            bold=True,
            fit_width=296,
        )
        canvas.text(
            x + 22,
            379,
            detail,
            size=15,
            color=C["muted"],
            fit_width=296,
        )

    canvas.rect(
        72,
        430,
        468,
        304,
        fill=C["panel"],
        stroke=C["amber"],
        sw=2,
        radius=22,
    )
    canvas.pill(
        94,
        450,
        424,
        34,
        "STREAMING OBSERVATION",
        color=C["amber"],
        size=14,
    )
    canvas.text(
        104,
        527,
        f'{evidence["stream_ttfc"]} ms',
        size=34,
        color=C["white"],
        bold=True,
    )
    canvas.text(
        302,
        527,
        "first parsed JSON event",
        size=16,
        color=C["muted"],
        fit_width=202,
    )
    canvas.text(
        104,
        580,
        f'{evidence["stream_first_content"]} ms',
        size=34,
        color=C["white"],
        bold=True,
    )
    canvas.text(
        302,
        580,
        "first visible content",
        size=16,
        color=C["muted"],
        fit_width=202,
    )
    canvas.text(
        104,
        627,
        (
            f'{evidence["stream_events"]} JSON events  |  terminal usage '
            f'{truth_label(evidence["stream_terminal_usage"])}'
        ),
        size=17,
        color=C["teal"],
        bold=True,
        fit_width=398,
    )
    canvas.rect(
        96,
        657,
        420,
        54,
        fill=C["danger"],
        stroke=C["coral"],
        sw=2,
        radius=16,
    )
    canvas.text(
        306,
        684,
        (
            f'QUALITY MISS DETECTED  |  {evidence["stream_words"]} words '
            "returned"
        ),
        size=16,
        color=C["coral"],
        bold=True,
        align="center",
        fit_width=392,
    )

    canvas.rect(
        566,
        430,
        468,
        304,
        fill=C["panel"],
        stroke=C["teal"],
        sw=2,
        radius=22,
    )
    canvas.pill(
        588,
        450,
        424,
        34,
        "REPEATED-PREFIX CACHE EVIDENCE",
        color=C["teal"],
        size=14,
    )
    canvas.text(
        600,
        523,
        "FIRST REQUEST",
        size=17,
        color=C["muted"],
        bold=True,
    )
    canvas.text(
        1000,
        523,
        f'{evidence["cold_prompt"]:,} input',
        size=20,
        color=C["white"],
        bold=True,
        align="right",
    )
    canvas.text(
        1000,
        556,
        f'{evidence["cold_hits"]:,} cache-hit tokens',
        size=17,
        color=C["blue"],
        align="right",
    )
    canvas.line(600, 584, 1000, 584, color=C["line"], sw=2)
    canvas.text(
        600,
        617,
        "IMMEDIATE REPEAT",
        size=17,
        color=C["muted"],
        bold=True,
    )
    canvas.text(
        1000,
        617,
        f'{evidence["repeat_prompt"]:,} input',
        size=20,
        color=C["white"],
        bold=True,
        align="right",
    )
    canvas.text(
        600,
        665,
        f'{evidence["repeat_hits"]:,}',
        size=32,
        color=C["green"],
        bold=True,
    )
    canvas.text(
        718,
        665,
        "hits",
        size=17,
        color=C["muted"],
    )
    canvas.text(
        850,
        665,
        f'{evidence["repeat_misses"]:,}',
        size=32,
        color=C["amber"],
        bold=True,
    )
    canvas.text(
        956,
        665,
        "misses",
        size=17,
        color=C["muted"],
    )
    canvas.text(
        800,
        706,
        "dated observation; no cache-persistence promise",
        size=15,
        color=C["muted"],
        align="center",
        fit_width=404,
    )

    canvas.rect(
        1060,
        430,
        468,
        304,
        fill=C["panel"],
        stroke=C["purple"],
        sw=2,
        radius=22,
    )
    canvas.pill(
        1082,
        450,
        424,
        34,
        "CONTRACTS + CONTROL",
        color=C["purple"],
        size=14,
    )
    checks = [
        (
            "JSON MODE",
            (
                f'{truth_label(evidence["json_valid"], positive="PASS", negative="FAIL")}'
                f'  |  {evidence["json_fields"]} fields'
            ),
            C["green"] if evidence["json_valid"] else C["coral"],
        ),
        (
            "TOOL SCHEMA",
            (
                f'{truth_label(evidence["tool_valid"], positive="PASS", negative="FAIL")}'
                f'  |  {evidence["tool_count"]} call  |  executed '
                f'{truth_label(evidence["tool_executed"])}'
            ),
            C["green"] if evidence["tool_valid"] else C["coral"],
        ),
        (
            "V4 PRO THINKING",
            (
                f'{evidence["reasoning_tokens"]} reasoning tokens  |  final '
                f'{truth_label(evidence["thinking_final"], positive="CORRECT", negative="MISS")}'
            ),
            C["blue"],
        ),
        (
            "INVALID MODEL",
            (
                f'expected {evidence["invalid_status"]}  |  '
                f'{evidence["invalid_type"]}'
            ),
            C["amber"] if evidence["invalid_expected"] else C["coral"],
        ),
    ]
    for index, (label, value, color) in enumerate(checks):
        y = 523 + index * 49
        canvas.text(
            1092,
            y,
            label,
            size=15,
            color=C["muted"],
            bold=True,
            fit_width=146,
        )
        canvas.text(
            1498,
            y,
            value,
            size=15,
            color=color,
            bold=True,
            align="right",
            fit_width=248,
        )
        if index < len(checks) - 1:
            canvas.line(1092, y + 24, 1498, y + 24, color=C["line"], sw=1)

    canvas.rect(
        72,
        758,
        1456,
        48,
        fill=C["band"],
        stroke=C["line"],
        sw=2,
        radius=18,
    )
    canvas.text(
        800,
        782,
        (
            f'SERIAL METHOD  |  concurrency {evidence["concurrency"]}  |  '
            f'retries {evidence["retries"]}  |  timeout '
            f'{evidence["timeout_ms"]} ms  |  no raw content, provider IDs, '
            "or API key stored"
        ),
        size=17,
        color=C["white"],
        bold=True,
        align="center",
        fit_width=1400,
    )
    canvas.live_footer(evidence["date_label"])
    canvas.save(LIVE_BASENAME)


def remove_live_artifacts() -> None:
    for name in (
        f"{LIVE_BASENAME}.png",
        f"{LIVE_BASENAME}.svg",
        "manifest.json",
    ):
        (VISUALS / name).unlink(missing_ok=True)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_manifest(*, include_live: bool) -> None:
    basenames = list(CONCEPTUAL_BASENAMES)
    if include_live:
        basenames.append(LIVE_BASENAME)
    assets: list[dict[str, Any]] = []
    for basename in basenames:
        png = VISUALS / f"{basename}.png"
        svg = VISUALS / f"{basename}.svg"
        if not png.is_file() or not svg.is_file():
            raise RuntimeError(f"Missing generated asset pair: {basename}")
        with Image.open(png) as image:
            dimensions = list(image.size)
        if dimensions != [WIDTH, HEIGHT]:
            raise RuntimeError(f"Unexpected PNG dimensions: {png.name}")
        evidence = (
            "sanitized_live_evidence_privacy_gated"
            if basename == LIVE_BASENAME
            else "conceptual_only_no_live_result_claims"
        )
        assets.append(
            {
                "basename": basename,
                "evidence": evidence,
                "png": {
                    "file": png.name,
                    "width": dimensions[0],
                    "height": dimensions[1],
                    "sha256": sha256(png),
                },
                "svg": {
                    "file": svg.name,
                    "editable_text_and_shapes": True,
                    "sha256": sha256(svg),
                },
            }
        )
    payload = {
        "schema_version": "1.0.0",
        "generator": "render_visuals.py",
        "status": (
            "complete_privacy_gated"
            if include_live
            else "conceptual_only_live_dashboard_not_rendered"
        ),
        "asset_count": len(assets) * 2,
        "assets": assets,
    }
    (VISUALS / "manifest.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render DeepSeek observability article visuals."
    )
    parser.add_argument(
        "--conceptual-only",
        action="store_true",
        help="Render visuals 01-07 without attempting the gated live dashboard.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    visual_01()
    visual_02()
    visual_03()
    visual_04()
    visual_05()
    visual_06()
    visual_07()
    if args.conceptual_only:
        remove_live_artifacts()
        write_manifest(include_live=False)
        return
    try:
        visual_08()
    except Exception:
        remove_live_artifacts()
        raise
    write_manifest(include_live=True)


if __name__ == "__main__":
    main()
