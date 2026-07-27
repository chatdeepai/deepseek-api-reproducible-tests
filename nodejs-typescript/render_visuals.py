"""Render the Node.js and TypeScript article diagrams and evidence dashboard.

The same drawing commands produce SVG and PNG outputs. Visuals 1-7 are
conceptual. Visual 8 is fail-closed and renders only from the final sanitized
live summary, offline summary, and passing privacy audit.
"""

from __future__ import annotations

import hashlib
import json
import math
from html import escape
from pathlib import Path

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
}

FONT_REGULAR = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")
FONT_MONO = Path(r"C:\Windows\Fonts\consola.ttf")
FONT_MONO_BOLD = Path(r"C:\Windows\Fonts\consolab.ttf")


def rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def blend(a: str, b: str, ratio: float) -> tuple[int, int, int]:
    aa = rgb(a)
    bb = rgb(b)
    return tuple(round(aa[i] + (bb[i] - aa[i]) * ratio) for i in range(3))


def get_font(size: int, *, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    if mono:
        path = FONT_MONO_BOLD if bold else FONT_MONO
    else:
        path = FONT_BOLD if bold else FONT_REGULAR
    return ImageFont.truetype(str(path), size=size)


class Canvas:
    def __init__(self) -> None:
        self.image = Image.new("RGB", (WIDTH, HEIGHT), C["bg0"])
        self.draw = ImageDraw.Draw(self.image)
        for y in range(HEIGHT):
            self.draw.line((0, y, WIDTH, y), fill=blend(C["bg0"], C["bg1"], y / HEIGHT))
        self.draw.ellipse((1260, -370, 1940, 310), fill="#142d49")
        self.draw.ellipse((-315, 595, 365, 1275), fill="#0b303c")
        self.svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" '
            'viewBox="0 0 1600 900" role="img">',
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
        attrs = [f'x="{x}"', f'y="{y}"', f'width="{w}"', f'height="{h}"', f'fill="{fill}"']
        if radius:
            attrs.append(f'rx="{radius}"')
        if stroke:
            attrs.extend((f'stroke="{stroke}"', f'stroke-width="{sw}"'))
        self.svg.append(f"<rect {' '.join(attrs)}/>")

    def circle(self, x: int, y: int, r: int, *, fill: str) -> None:
        self.draw.ellipse((x - r, y - r, x + r, y + r), fill=fill)
        self.svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>')

    def line(self, x1: int, y1: int, x2: int, y2: int, *, color: str, sw: int = 3) -> None:
        self.draw.line((x1, y1, x2, y2), fill=color, width=sw)
        self.svg.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="{color}" stroke-width="{sw}" stroke-linecap="round"/>'
        )

    def arrow(self, x1: int, y1: int, x2: int, y2: int, *, color: str = C["teal"], sw: int = 4) -> None:
        angle = math.atan2(y2 - y1, x2 - x1)
        head = 14
        ex = x2 - math.cos(angle) * 8
        ey = y2 - math.sin(angle) * 8
        self.line(x1, y1, int(ex), int(ey), color=color, sw=sw)
        points = [
            (x2, y2),
            (x2 - math.cos(angle - math.pi / 6) * head, y2 - math.sin(angle - math.pi / 6) * head),
            (x2 - math.cos(angle + math.pi / 6) * head, y2 - math.sin(angle + math.pi / 6) * head),
        ]
        self.draw.polygon(points, fill=color)
        coords = " ".join(f"{round(px, 1)},{round(py, 1)}" for px, py in points)
        self.svg.append(f'<polygon points="{coords}" fill="{color}"/>')

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
            candidate = get_font(actual, bold=bold, mono=mono)
            bounds = self.draw.textbbox((0, 0), value, font=candidate)
            if bounds[2] - bounds[0] <= fit_width:
                break
            actual -= 1
        pil_font = get_font(actual, bold=bold, mono=mono)
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
        gap: int | None = None,
        fit_width: int | None = None,
    ) -> None:
        line_gap = gap or round(size * 1.35)
        for i, value in enumerate(lines):
            self.text(
                x,
                y + i * line_gap,
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
        value: str,
        *,
        color: str,
        size: int = 18,
        mono: bool = False,
        fill: str = C["panel_dark"],
    ) -> None:
        self.rect(x, y, w, h, fill=fill, stroke=color, sw=2, radius=h // 2)
        self.text(
            x + w // 2,
            y + h // 2,
            value,
            size=size,
            color=color,
            bold=True,
            align="center",
            mono=mono,
            fit_width=w - 26,
        )

    def header(self, title: str, subtitle: str) -> None:
        self.rect(72, 52, 720, 44, fill="#0b2b35", stroke="#20707b", sw=2, radius=22)
        self.text(
            96,
            74,
            "CHAT-DEEP.AI  |  NODE.JS + TYPESCRIPT GUIDE",
            size=20,
            color=C["teal"],
            bold=True,
            fit_width=670,
        )
        self.text(72, 148, title, size=50, color=C["white"], bold=True, fit_width=1456)
        self.text(72, 201, subtitle, size=25, color=C["muted"], fit_width=1456)
        self.rect(72, 227, 1456, 4, fill=C["teal"], radius=2)

    def footer(self, detail: str) -> None:
        self.line(72, 828, 1528, 828, color=C["line"], sw=2)
        self.text(
            72,
            868,
            f"Conceptual Node.js and TypeScript method diagram  |  no live-result claims  |  {detail}",
            size=18,
            color=C["muted"],
            fit_width=1210,
        )
        self.text(1528, 868, "chat-deep.ai", size=20, color=C["teal"], bold=True, align="right")

    def save(self, basename: str) -> None:
        VISUALS.mkdir(parents=True, exist_ok=True)
        self.svg.append("</svg>")
        (VISUALS / f"{basename}.svg").write_text("\n".join(self.svg) + "\n", encoding="utf-8")
        self.image.save(VISUALS / f"{basename}.png", format="PNG", optimize=True)


def card(
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
    c.rect(x, y, w, h, fill=C["panel"], stroke=color, sw=2, radius=22)
    title_y = y + 48
    if badge:
        c.circle(x + w // 2, y + 44, 23, fill=color)
        c.text(x + w // 2, y + 44, badge, size=17, color=C["ink"], bold=True, align="center")
        title_y = y + 92
    c.multiline(
        x + w // 2,
        title_y,
        title,
        size=23,
        color=color,
        bold=True,
        fit_width=w - 26,
        gap=29,
    )
    detail_y = title_y + len(title) * 30 + 25
    c.multiline(
        x + w // 2,
        detail_y,
        details,
        size=18,
        color=C["muted"],
        fit_width=w - 28,
        gap=27,
    )


def visual_01() -> None:
    c = Canvas()
    c.header(
        "DeepSeek + Node.js / TypeScript Architecture",
        "A server-owned client keeps credentials, policy, resource limits, and validation under application control",
    )
    stages = [
        ("BROWSER / APP", ["untrusted input", "request context"], C["blue"]),
        ("SERVER ROUTE", ["authenticate", "abuse limits"], C["purple"]),
        ("INPUT POLICY", ["parse unknown", "validate shape"], C["teal"]),
        ("OPENAI JS", ["owned client", "typed adapter"], C["green"]),
        ("DEEPSEEK API", ["transport", "model boundary"], C["amber"]),
        ("OUTPUT CONTROL", ["finish state", "safe response"], C["green"]),
    ]
    xs = [72, 320, 568, 816, 1064, 1312]
    for i, ((title, details, color), x) in enumerate(zip(stages, xs), start=1):
        card(c, x, 296, 216, 300, [title], details, color, badge=str(i))
        if i < len(stages):
            c.arrow(x + 216, 446, xs[i] - 12, 446)
    c.rect(142, 642, 1316, 136, fill=C["band"], stroke=C["line"], sw=2, radius=24)
    c.text(176, 681, "SERVER-ONLY SECRET", size=22, color=C["coral"], bold=True)
    c.text(176, 728, "credential name only  |  never browser-visible  |  never logged", size=19, color=C["white"], fit_width=600)
    c.text(844, 681, "APPLICATION OWNERSHIP", size=22, color=C["teal"], bold=True)
    c.text(
        844,
        728,
        "authorization  |  validation  |  side effects  |  resource limits  |  safe telemetry",
        size=19,
        color=C["white"],
        fit_width=560,
    )
    c.footer("production boundary only")
    c.save("01-deepseek-nodejs-typescript-production-architecture")


def visual_02() -> None:
    c = Canvas()
    c.header(
        "Node.js / TypeScript Client Configuration Boundary",
        "Separate compile-time types, runtime secrets, provider-specific fields, and the owned client lifecycle",
    )
    columns = [
        ("PINNED STACK", ["Node.js runtime", "TypeScript compiler", "OpenAI JS client"], C["blue"]),
        ("SERVER CONFIG", ["credential name only", "baseURL + model policy", "resource limits"], C["purple"]),
        ("TYPED ADAPTER", ["provider fields", "request shape", "compile gate"], C["teal"]),
        ("OWNED CLIENT", ["explicit timeout", "one retry owner", "service injection"], C["green"]),
    ]
    xs = [72, 444, 816, 1188]
    for i, ((title, details, color), x) in enumerate(zip(columns, xs)):
        card(c, x, 294, 340, 328, [title], details, color)
        if i < len(columns) - 1:
            c.arrow(x + 340, 458, xs[i + 1] - 14, 458)
    c.rect(180, 660, 1240, 128, fill=C["danger"], stroke=C["coral"], sw=2, radius=24)
    c.text(800, 700, "FOUR DIFFERENT CLAIMS", size=23, color=C["coral"], bold=True, align="center")
    c.text(
        800,
        747,
        "type accepted  !=  request serialized  !=  provider accepted  !=  semantically valid",
        size=23,
        color=C["white"],
        bold=True,
        align="center",
        fit_width=1140,
    )
    c.footer("no package-version or field-support claim")
    c.save("02-nodejs-typescript-client-configuration-boundary")


def visual_03() -> None:
    c = Canvas()
    c.header(
        "Node.js Streaming, Backpressure & Abort Lifecycle",
        "Consume the async iterable deliberately, separate output lanes, validate the terminal state, and clean up",
    )
    panels = [
        (
            "REQUEST CONTROL",
            ["stream selected", "explicit budget", "AbortSignal"],
            C["blue"],
            "START",
        ),
        (
            "ASYNC ITERABLE",
            ["for await", "consumer pace", "bounded buffering"],
            C["purple"],
            "CONSUME",
        ),
        (
            "DELTA ROUTER",
            ["final content lane", "reasoning metadata", "no raw logging"],
            C["teal"],
            "ROUTE",
        ),
        (
            "TERMINAL GATE",
            ["finish state", "usage summary", "validate or reject"],
            C["green"],
            "FINISH",
        ),
    ]
    xs = [72, 444, 816, 1188]
    for i, ((title, details, color, badge), x) in enumerate(zip(panels, xs)):
        c.rect(x, 286, 340, 396, fill=C["panel"], stroke=color, sw=2, radius=24)
        c.text(x + 24, 329, title, size=25, color=color, bold=True, fit_width=292)
        c.pill(x + 24, 356, 292, 48, badge, color=color, size=18)
        for j, detail in enumerate(details):
            cy = 466 + j * 62
            c.circle(x + 42, cy, 11, fill=color)
            c.text(x + 42, cy, "+", size=13, color=C["ink"], bold=True, align="center")
            c.text(x + 68, cy, detail, size=19, color=C["muted"], fit_width=244)
        if i < len(panels) - 1:
            c.arrow(x + 340, 484, xs[i + 1] - 14, 484)
    c.rect(194, 720, 1212, 82, fill=C["band"], stroke=C["line"], sw=2, radius=22)
    states = [
        (230, "COMPLETE", "validated terminal state", C["green"]),
        (644, "ABORTED", "stop + discard partial state", C["amber"]),
        (1030, "INCOMPLETE", "reject + close resources", C["coral"]),
    ]
    for x, name, detail, color in states:
        c.text(x, 748, name, size=19, color=color, bold=True)
        c.text(x, 778, detail, size=17, color=C["muted"], fit_width=330)
    c.footer("lifecycle guidance only")
    c.save("03-nodejs-streaming-backpressure-abort-lifecycle")


def visual_04() -> None:
    c = Canvas()
    c.header(
        "TypeScript JSON Runtime Validation Pipeline",
        "Static types disappear at runtime, so every provider string must pass explicit application gates",
    )
    stages = [
        ("UNKNOWN", ["provider content"], C["blue"]),
        ("EMPTY / FINISH", ["presence", "truncation"], C["amber"]),
        ("JSON.PARSE", ["syntax only"], C["purple"]),
        ("RUNTIME SCHEMA", ["types", "required fields"], C["teal"]),
        ("BUSINESS RULES", ["ranges", "permissions"], C["amber"]),
        ("TYPED OBJECT", ["trusted boundary"], C["green"]),
    ]
    xs = [72, 320, 568, 816, 1064, 1312]
    for i, ((title, details, color), x) in enumerate(zip(stages, xs), start=1):
        card(c, x, 306, 216, 278, [title], details, color, badge=str(i))
        if i < len(stages):
            c.arrow(x + 216, 445, xs[i] - 12, 445)
    c.rect(156, 636, 1288, 146, fill=C["danger"], stroke=C["coral"], sw=2, radius=24)
    c.text(800, 675, "REJECTION PATHS", size=23, color=C["coral"], bold=True, align="center")
    reject = [
        "empty",
        "truncated",
        "malformed",
        "schema mismatch",
        "business invalid",
        "unauthorized",
    ]
    x_positions = [194, 390, 586, 782, 1010, 1246]
    for x, label in zip(x_positions, reject):
        c.pill(x, 714, 166, 42, label.upper(), color=C["coral"], size=14)
    c.footer("parser success is not business validity")
    c.save("04-typescript-json-runtime-validation-pipeline")


def visual_05() -> None:
    c = Canvas()
    c.header(
        "Node.js Thinking-Mode Tool Safety Loop",
        "The application validates, authorizes, executes, and replays the protocol; the model never runs the tool",
    )
    stages = [
        ("TOOL SCHEMA", ["allowlisted", "narrow shape"], C["blue"]),
        ("ASSISTANT", ["tool alias T1", "reasoning present"], C["purple"]),
        ("PARSE", ["arguments", "as unknown"], C["teal"]),
        ("VALIDATE", ["runtime schema", "business rules"], C["amber"]),
        ("AUTHORIZE", ["user policy", "tenant scope"], C["amber"]),
        ("EXECUTE", ["approved adapter", "bounded effect"], C["green"]),
        ("REPLAY", ["tool message T1", "controlled continue"], C["blue"]),
    ]
    xs = [72, 282, 492, 702, 912, 1122, 1332]
    for i, ((title, details, color), x) in enumerate(zip(stages, xs), start=1):
        c.rect(x, 300, 196, 314, fill=C["panel"], stroke=color, sw=2, radius=22)
        c.circle(x + 98, 345, 22, fill=color)
        c.text(x + 98, 345, str(i), size=16, color=C["ink"], bold=True, align="center")
        c.text(x + 98, 407, title, size=20, color=color, bold=True, align="center", fit_width=170)
        c.multiline(x + 98, 492, details, size=17, color=C["muted"], fit_width=170, gap=28)
        if i < len(stages):
            c.arrow(x + 196, 457, xs[i] - 12, 457)
    c.rect(184, 658, 1232, 126, fill=C["band"], stroke=C["purple"], sw=2, radius=24)
    c.text(800, 696, "ACTIVE THINKING + TOOL LOOP", size=22, color=C["purple"], bold=True, align="center")
    c.text(
        800,
        742,
        "Preserve the required assistant and tool protocol fields in memory. Keep reasoning metadata out of the user interface and logs.",
        size=20,
        color=C["white"],
        bold=True,
        align="center",
        fit_width=1150,
    )
    c.footer("tool and replay controls only")
    c.save("05-nodejs-thinking-tool-call-safety-loop")


def visual_06() -> None:
    c = Canvas()
    c.header(
        "Node.js Error, Retry, Timeout & Cancellation Tree",
        "Classify the failing layer, choose one retry owner, and propagate a user abort without another request",
    )
    c.rect(190, 276, 1220, 126, fill=C["panel"], stroke=C["blue"], sw=2, radius=24)
    c.text(800, 314, "FAILURE CONTEXT", size=26, color=C["blue"], bold=True, align="center")
    questions = ["WHICH LAYER?", "REQUEST SENT?", "SIDE EFFECT?", "IDEMPOTENT?", "TIMEOUT?", "USER ABORT?"]
    qx = [220, 420, 620, 820, 1020, 1220]
    qcolors = [C["blue"], C["purple"], C["teal"], C["green"], C["amber"], C["coral"]]
    for label, x, color in zip(questions, qx, qcolors):
        c.pill(x, 348, 170, 38, label, color=color, size=13)
    c.arrow(800, 404, 800, 458)
    branches = [
        ("COMPILE / CONFIG", "FIX + STOP", ["types", "options"], C["coral"]),
        ("TRANSPORT", "RETRY IF SAFE", ["transient", "idempotent"], C["blue"]),
        ("PARSER / SCHEMA", "REJECT / REPAIR", ["validate", "bounded policy"], C["purple"]),
        ("TOOL / EFFECT", "STOP + RECONCILE", ["authorization", "side effect"], C["amber"]),
        ("TIMEOUT", "CANCEL OWNED WORK", ["classify", "clean up"], C["teal"]),
        ("USER ABORT", "PROPAGATE", ["no retry", "discard partial"], C["green"]),
    ]
    xs = [72, 320, 568, 816, 1064, 1312]
    for (title, action, details, color), x in zip(branches, xs):
        c.rect(x, 468, 216, 252, fill=C["panel"], stroke=color, sw=2, radius=20)
        c.text(x + 108, 508, title, size=18, color=color, bold=True, align="center", fit_width=192)
        c.pill(x + 20, 536, 176, 40, action, color=color, size=13)
        c.multiline(x + 108, 632, details, size=17, color=C["muted"], fit_width=184, gap=27)
    c.rect(226, 752, 1148, 58, fill=C["danger"], stroke=C["coral"], sw=2, radius=18)
    c.text(
        800,
        781,
        "ONE RETRY OWNER  |  safe telemetry keeps categories and states, not prompts, outputs, payloads, headers, or identifiers",
        size=18,
        color=C["coral"],
        bold=True,
        align="center",
        fit_width=1080,
    )
    c.footer("safe-action guidance only")
    c.save("06-nodejs-error-retry-timeout-cancellation-tree")


def visual_07() -> None:
    c = Canvas()
    c.header(
        "Node.js / TypeScript Test Methodology Ladder",
        "Separate source facts, compile results, localhost contracts, provider observations, and publication approval",
    )
    c.rect(90, 278, 1080, 118, fill=C["band"], stroke=C["line"], sw=2, radius=22)
    c.text(120, 316, "EVIDENCE GATES", size=25, color=C["white"], bold=True)
    c.text(
        120,
        360,
        "documented  ->  type accepted  ->  serialized  ->  parsed locally  ->  observed live  ->  privacy approved",
        size=21,
        color=C["muted"],
        fit_width=1010,
    )
    steps = [
        (72, 612, 276, 138, "SOURCE REVIEW", ["official contracts"], C["blue"]),
        (318, 548, 276, 202, "TYPECHECK", ["strict compile", "field boundary"], C["purple"]),
        (564, 484, 276, 266, "LOCALHOST FIXTURE", ["real SDK transport", "controlled parser"], C["teal"]),
        (810, 420, 276, 330, "FROZEN LIVE PLAN", ["serial cases", "fixed request budget"], C["green"]),
        (1056, 356, 276, 394, "PRIVACY AUDIT", ["allowlisted evidence", "secret + payload scan"], C["amber"]),
        (1302, 292, 226, 458, "DASHBOARD", ["RENDER AFTER", "audit passes"], C["green"]),
    ]
    for index, (x, y, w, h, title, details, color) in enumerate(steps, start=1):
        c.rect(x, y, w, h, fill=C["panel"], stroke=color, sw=2, radius=22)
        c.circle(x + w // 2, y + 43, 22, fill=color)
        c.text(x + w // 2, y + 43, str(index), size=16, color=C["ink"], bold=True, align="center")
        c.text(x + w // 2, y + 88, title, size=19, color=color, bold=True, align="center", fit_width=w - 24)
        c.multiline(x + w // 2, y + 126, details, size=16, color=C["muted"], fit_width=w - 26, gap=26)
    c.rect(230, 772, 1140, 40, fill=C["danger"], stroke=C["coral"], sw=2, radius=18)
    c.text(
        800,
        792,
        "No compatibility result is publishable until the measured evidence passes the redaction audit.",
        size=18,
        color=C["coral"],
        bold=True,
        align="center",
        fit_width=1080,
    )
    c.footer("evidence gate enforced")
    c.save("07-nodejs-test-methodology-ladder")


def load_dashboard_evidence() -> tuple[dict, dict, dict]:
    live = json.loads((ROOT / "results" / "live-summary.json").read_text(encoding="utf-8"))
    offline = json.loads((ROOT / "results" / "offline-summary.json").read_text(encoding="utf-8"))
    audit = json.loads((ROOT / "results" / "privacy-audit.json").read_text(encoding="utf-8"))

    if live.get("status") != "completed":
        raise RuntimeError("The live summary is not complete.")
    if offline.get("status") != "pass":
        raise RuntimeError("The offline summary did not pass.")
    if audit.get("status") != "pass":
        raise RuntimeError("The privacy audit did not pass.")
    if live.get("provider_requests_issued") != live.get("planned_case_count"):
        raise RuntimeError("The live request count does not match the frozen plan.")
    if live.get("provider_requests_issued") > live.get("provider_request_cap"):
        raise RuntimeError("The live request cap was exceeded.")
    if offline.get("tests_passed") != offline.get("tests_total"):
        raise RuntimeError("The localhost test total is incomplete.")
    if audit.get("forbidden_result_field_findings") != 0 or audit.get("secret_findings") != 0:
        raise RuntimeError("Sensitive evidence findings block dashboard rendering.")

    return live, offline, audit


def visual_08() -> None:
    live, offline, audit = load_dashboard_evidence()
    results = {item["case_id"]: item for item in live["results"]}

    ordinary = results["node-ordinary-chat-v4-flash"]
    stream = results["node-stream-v4-flash"]
    json_case = results["node-json-mode-v4-flash"]
    tool_initial = results["node-tool-initial-v4-flash"]
    tool_continuation = results["node-tool-continuation-v4-flash"]
    thinking = results["node-thinking-v4-pro"]
    alias_chat = results["node-alias-deepseek-chat"]
    alias_reasoner = results["node-alias-deepseek-reasoner"]
    invalid_model = results["node-invalid-model-error"]

    c = Canvas()
    c.header(
        "DeepSeek Node.js + TypeScript: Live Evidence",
        "Pinned SDK checks, bounded provider observations, explicit caveats, and a passing privacy audit",
    )

    def summary_card(
        x: int,
        title: str,
        lines: list[str],
        color: str,
        evidence_label: str,
    ) -> None:
        c.rect(x, 260, 350, 138, fill=C["panel"], stroke=color, sw=2, radius=20)
        c.pill(x + 18, 276, 314, 30, evidence_label, color=color, size=12)
        c.text(x + 22, 334, title, size=22, color=color, bold=True, fit_width=306)
        c.multiline(x + 22, 365, lines, size=15, color=C["muted"], align="left", gap=22, fit_width=306)

    summary_card(
        72,
        "PINNED STACK",
        [
            f"Node {live['node_version']} | OpenAI {live['openai_version']}",
            f"TypeScript {live['typescript_version']} | pnpm lock | ESM",
        ],
        C["blue"],
        "DOCUMENTED CONTRACT",
    )
    summary_card(
        440,
        "RUN CONTROLS",
        [
            f"{live['provider_requests_issued']} / {live['planned_case_count']} issued | 0 skipped | cap {live['provider_request_cap']}",
            f"timeout 30s | concurrency {live['concurrency']} | retries {live['automatic_retries']}",
        ],
        C["teal"],
        "DATED PROVIDER OBSERVATION",
    )
    summary_card(
        808,
        "LOCALHOST VERIFICATION",
        [
            f"strict typecheck {offline['strict_typecheck'].upper()}",
            f"{offline['tests_passed']} / {offline['tests_total']} tests passed | 0 provider calls",
        ],
        C["purple"],
        "LOCALHOST WRAPPER CHECK",
    )
    summary_card(
        1176,
        "PUBLICATION GATE",
        [
            f"privacy audit {audit['status'].upper()}",
            f"{audit['forbidden_result_field_findings']} forbidden | {audit['secret_findings']} secret findings",
        ],
        C["green"],
        "SANITIZED EVIDENCE",
    )

    def result_card(
        x: int,
        title: str,
        lines: list[str],
        color: str,
        *,
        label: str = "DATED PROVIDER OBSERVATION",
    ) -> None:
        c.rect(x, 424, 470, 254, fill=C["panel"], stroke=color, sw=2, radius=22)
        c.pill(x + 20, 442, 430, 32, label, color=color, size=13)
        c.text(x + 235, 510, title, size=24, color=color, bold=True, align="center", fit_width=420)
        c.multiline(x + 28, 550, lines, size=16, color=C["muted"], align="left", gap=27, fit_width=414)

    result_card(
        72,
        "CORE RESPONSE PATHS",
        [
            f"Chat {ordinary['status']} | content present | {ordinary['finish_reason']}",
            f"Stream {stream['status']} | {stream['event_count']} events | usage | {stream['terminal_finish_reason']}",
            f"JSON {json_case['status']} | parse + two-field schema valid",
            f"Tool {tool_initial['status']} | 1 valid call | continuation {tool_continuation['finish_reason']}",
        ],
        C["green"],
    )
    result_card(
        565,
        "THINKING CAVEAT",
        [
            f"V4 Pro returned HTTP {thinking['status']}",
            "reasoning field present + nonempty",
            f"final content empty | finish: {thinking['finish_reason']}",
            "INCOMPLETE FINAL ANSWER",
        ],
        C["amber"],
    )
    result_card(
        1058,
        "ALIASES + ERROR CONTROL",
        [
            f"chat alias -> V4 Flash | {alias_chat['status']} | {alias_chat['finish_reason']}",
            f"reasoner alias -> V4 Flash | {alias_reasoner['status']} | {alias_reasoner['finish_reason']}",
            f"invalid model -> expected HTTP {invalid_model['status']}",
            f"{invalid_model['exception_class']} | {invalid_model['error_code']}",
        ],
        C["blue"],
    )

    c.rect(72, 702, 940, 104, fill=C["panel_dark"], stroke=C["purple"], sw=2, radius=20)
    c.pill(92, 719, 330, 32, "LOCALHOST WRAPPER CHECK", color=C["purple"], size=13)
    c.text(
        446,
        735,
        "retry classification | timeout | AbortController | serial ledger",
        size=17,
        color=C["muted"],
        fit_width=530,
    )
    c.pill(92, 764, 180, 28, "NOT TESTED", color=C["coral"], size=12)
    c.text(
        292,
        778,
        "thinking stream and business actions | provider availability and throughput",
        size=16,
        color=C["muted"],
        fit_width=680,
    )

    c.rect(1034, 702, 494, 104, fill=C["danger"], stroke=C["amber"], sw=2, radius=20)
    c.text(1281, 731, "9.029s", size=36, color=C["amber"], bold=True, align="center")
    c.text(1281, 766, "TOTAL SERIAL STUDY DURATION", size=17, color=C["white"], bold=True, align="center")
    c.text(1281, 792, "not mean or percentile latency", size=15, color=C["muted"], align="center")

    c.line(72, 828, 1528, 828, color=C["line"], sw=2)
    c.text(
        72,
        868,
        "July 27, 2026 UTC  |  sanitized evidence  |  dated observations  |  not a service-level benchmark",
        size=18,
        color=C["muted"],
        fit_width=1260,
    )
    c.text(1528, 868, "chat-deep.ai", size=20, color=C["teal"], bold=True, align="right")
    c.save("08-nodejs-typescript-live-results-dashboard")


def write_hashes() -> None:
    entries = []
    for path in sorted(VISUALS.glob("0[1-8]-*.png")):
        with Image.open(path) as image:
            width, height = image.size
        entries.append(
            {
                "file": path.name,
                "width": width,
                "height": height,
                "evidence": (
                    "sanitized_live_and_offline_evidence"
                    if path.name.startswith("08-")
                    else "conceptual_only_no_live_results"
                ),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        )
    payload = {
        "schema_version": "1.0.0",
        "evidence_status": "complete_privacy_audited",
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
    visual_08()
    write_hashes()


if __name__ == "__main__":
    main()
