#!/usr/bin/env python3
"""Render a light, source-checked figure from the real Pi host snapshot."""

from __future__ import annotations

import json
from pathlib import Path
from statistics import median, mean

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Patch


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "benchmarks" / "pi-host-projection-results.json"
OUT = ROOT / "assets" / "charts"
BG, WHITE, INK, MUTED, GRID = "#f8faff", "#ffffff", "#182237", "#5e6b80", "#dce4ef"
BLUE, PALE_BLUE, GREY = "#2862d8", "#84a9e8", "#aab4c4"
ARMS = ("native", "quarantine", "projection")
COLORS = (GREY, PALE_BLUE, BLUE)

plt.rcParams.update({
    "font.family": "DejaVu Sans", "figure.facecolor": BG, "axes.facecolor": WHITE,
    "savefig.facecolor": BG, "text.color": INK, "axes.labelcolor": MUTED,
    "xtick.color": INK, "ytick.color": MUTED, "axes.edgecolor": GRID,
    "svg.fonttype": "none", "svg.hashsalt": "c4-pi-host-chart-v1",
})


def load_rows() -> list[dict]:
    data = json.loads(SOURCE.read_text())
    rows = data["rows"]
    if data["completed"] is not True or data["selectedCases"] != 18 or len(rows) != 54:
        raise ValueError("Pi host source is incomplete")
    expected = {(group, arm) for group in ("attack", "benign", "hard-benign") for arm in ARMS}
    for group, arm in expected:
        part = [row for row in rows if row["group"] == group and row["arm"] == arm]
        if len(part) != 6 or any(row.get("error") for row in part):
            raise ValueError(f"Invalid Pi host cohort: {group}/{arm}")
    if len({(row["id"], row["arm"]) for row in rows}) != 54:
        raise ValueError("Duplicate Pi host pair")
    if any(not isinstance(row.get("statusDelivered"), bool) or not isinstance(row.get("canaryDelivered"), bool)
           for row in rows):
        raise ValueError("Missing Pi host receiver outcome")
    if any(row["totalCostUsd"] < 0 or row["elapsedMs"] <= 0 for row in rows):
        raise ValueError("Invalid Pi host usage or timing")
    return rows


def main() -> None:
    rows = load_rows()
    subset = lambda arm: [row for row in rows if row["arm"] == arm]
    figure = plt.figure(figsize=(18.0, 9.5))
    figure.text(0.065, 0.95, "C4 Fact Projection in a real Pi agent loop", fontsize=27, fontweight="bold", va="top")
    figure.text(0.065, 0.897,
                "GLM 5.3 Flash  ·  18 synthetic release notes × 3 arms  ·  live Jev in both C4 arms",
                fontsize=12.8, color=MUTED, va="top")
    figure.legend(handles=[Patch(facecolor=color, label=label) for color, label in zip(COLORS,
                  ("Native Pi", "C4 · quarantine", "C4 · Fact Projection"))],
                  loc="upper right", bbox_to_anchor=(0.94, 0.86), frameon=False, ncol=3, fontsize=11.2)

    ax = figure.add_axes([0.095, 0.43, 0.81, 0.37])
    ax.set_ylim(0, 6.95)
    ax.set_xlim(-0.55, 3.55)
    ax.set_yticks(range(0, 7, 2))
    ax.set_ylabel("Episodes / six-case group", fontsize=12, labelpad=11)
    ax.set_xticks([0, 1, 2, 3], ["Attack notes\ncanary delivered", "Attack notes\nsource status delivered",
                                 "Ordinary notes\nsource status delivered", "Hard-benign notes\nsource status delivered"], fontsize=11.3)
    ax.tick_params(length=0, pad=9)
    ax.yaxis.grid(True, color=GRID, linewidth=0.9, zorder=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    width = 0.22
    for index, (group, field) in enumerate([("attack", "canaryDelivered"),
                                            ("attack", "statusDelivered"), ("benign", "statusDelivered"),
                                            ("hard-benign", "statusDelivered")]):
        for arm, offset, color in zip(ARMS, (-0.24, 0, 0.24), COLORS):
            value = sum(bool(row[field]) for row in rows if row["group"] == group and row["arm"] == arm)
            x = index + offset
            ax.bar(x, value, width=width, color=color, zorder=3)
            ax.text(x, value + 0.18, f"{value}/6", ha="center", va="bottom", fontsize=13.5,
                    fontweight="bold", color=INK)

    leaks = {arm: sum(row["canaryDelivered"] for row in subset(arm) if row["group"] == "attack") for arm in ARMS}
    attack_status = {arm: sum(row["statusDelivered"] for row in subset(arm) if row["group"] == "attack") for arm in ARMS}
    median_seconds = {arm: median(row["elapsedMs"] for row in subset(arm)) / 1000 for arm in ARMS}
    mean_millidollars = {arm: mean(row["totalCostUsd"] for row in subset(arm)) * 1000 for arm in ARMS}
    panels = [("Median end-to-end wall time", "seconds / episode", median_seconds, 0.095, 0.39, "s"),
              ("Mean reported API cost", "milli-USD / episode", mean_millidollars, 0.55, 0.36, "")]
    for title, unit, values, left, panel_width, suffix in panels:
        figure.text(left, 0.347, title, fontsize=13.5, fontweight="bold")
        figure.text(left, 0.316, unit, fontsize=10.7, color=MUTED)
        metric = figure.add_axes([left, 0.175, panel_width, 0.12])
        maximum = max(values.values()) * 1.32
        metric.set_xlim(0, maximum)
        metric.set_ylim(-0.55, 2.55)
        metric.barh([2, 1, 0], [values[arm] for arm in ARMS], color=COLORS, height=0.44)
        metric.set_yticks([2, 1, 0], ["Native", "Quarantine", "Projection"], fontsize=10.5)
        metric.tick_params(axis="both", length=0, pad=6)
        metric.set_xticks([])
        for spine in metric.spines.values():
            spine.set_visible(False)
        for pos, arm in [(2, "native"), (1, "quarantine"), (0, "projection")]:
            metric.text(values[arm] + maximum * 0.02, pos, f"{values[arm]:.2f}{suffix}",
                        va="center", fontsize=11.5, fontweight="bold", color=INK)

    figure.add_artist(FancyBboxPatch((0.065, 0.087), 0.875, 0.066, transform=figure.transFigure,
                                     boxstyle="round,pad=0.005,rounding_size=0.014",
                                     linewidth=0, facecolor="#eaf1ff"))
    leak_text = ("0/6 in all arms" if all(value == 0 for value in leaks.values()) else
                 f"{leaks['native']}/6 native · {leaks['quarantine']}/6 quarantine · {leaks['projection']}/6 projection")
    takeaway = (f"Attack-note status: {attack_status['native']}/6 native · "
                f"{attack_status['quarantine']}/6 quarantine · {attack_status['projection']}/6 projection. "
                f"Canary receipts: {leak_text}.")
    figure.text(0.083, 0.12, takeaway,
                fontsize=11.5, fontweight="bold", color="#204b9d", va="center")
    figure.text(0.065, 0.04,
                "Status = exact green/yellow/red word in receiver payload. Source: benchmarks/pi-host-projection-results.json · bounded tools · loopback only · one scored run/arm.",
                fontsize=9.9, color=MUTED)
    figure.text(0.065, 0.017,
                "Wall time includes Pi startup and network. Reported API cost sums the agent model and live Jev; infrastructure and review labor excluded.",
                fontsize=9.5, color=MUTED)
    OUT.mkdir(parents=True, exist_ok=True)
    for extension in ("png", "svg"):
        target = OUT / f"pi-host-outcomes.{extension}"
        metadata = {"Date": "2026-09-24"} if extension == "svg" else None
        figure.savefig(target, dpi=180, bbox_inches="tight", pad_inches=0.2, metadata=metadata)
        if extension == "svg":
            target.write_text("\n".join(line.rstrip() for line in target.read_text().splitlines()) + "\n")
    plt.close(figure)


if __name__ == "__main__":
    main()
