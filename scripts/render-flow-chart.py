#!/usr/bin/env python3
"""Render the C4-owned flow-regression trade-off as a static README figure."""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt


ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "benchmarks" / "flow-results.json").read_text())
OUT = ROOT / "assets" / "charts"

BG = "#f7f9fc"
PANEL = "#ffffff"
INK = "#172235"
MUTED = "#66758b"
GRID = "#dde4ee"
BLUE = "#255ed2"
GREY = "#a5afbf"

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "figure.facecolor": BG,
    "axes.facecolor": PANEL,
    "savefig.facecolor": BG,
    "text.color": INK,
    "axes.labelcolor": MUTED,
    "xtick.color": INK,
    "ytick.color": MUTED,
    "axes.edgecolor": GRID,
    "svg.fonttype": "none",
})


def count(method: str, group: str, passed: bool) -> tuple[int, int]:
    row = DATA["methods"][method][group]
    total = row["total"]
    interventions = row["terminalInterventions"]
    if total < 1 or not 0 <= interventions <= total:
        raise ValueError("Unexpected flow regression denominator")
    return (total - interventions if passed else interventions), total


def main() -> None:
    groups = [
        ("Attack probes\nterminal gated", "attack", False),
        ("Benign probes\nuninterrupted", "benign", True),
        ("Hard benign probes\nuninterrupted", "hard-benign", True),
    ]
    fig = plt.figure(figsize=(15.2, 8.2))
    fig.text(0.065, 0.94, "C4 Flow Ledger · cross-step control", fontsize=26, fontweight="bold", va="top")
    fig.text(0.065, 0.875,
             f"Same fixed Jev observations  •  stateless gate vs C4 flow policy  •  {len(DATA['cases'])} designed sequences",
             fontsize=12.3, color=MUTED, va="top")
    ax = fig.add_axes([0.095, 0.24, 0.84, 0.52])
    maximum = max(DATA["methods"]["flow"][group]["total"] for _label, group, _passed in groups)
    ax.set_ylim(0, maximum + 1.4)
    ax.set_xlim(-0.55, 2.55)
    ax.set_yticks(list(range(0, maximum + 1, 3)))
    ax.set_ylabel("Sequences / group", fontsize=12, labelpad=12)
    ax.yaxis.grid(True, color=GRID, linewidth=0.9, zorder=0)
    ax.tick_params(axis="both", length=0, pad=10)
    ax.set_xticks(range(3), [item[0] for item in groups], fontsize=12.5)
    for spine in ax.spines.values():
        spine.set_visible(False)

    width = 0.31
    for index, (_label, group, passed) in enumerate(groups):
        for method, offset, color in [("stateless", -width / 2, GREY), ("flow", width / 2, BLUE)]:
            value, total = count(method, group, passed)
            x = index + offset
            ax.bar(x, value, width=width * 0.94, color=color, zorder=3)
            ax.text(x, value + 0.28, f"{value}/{total}", ha="center", va="bottom", fontsize=13.5,
                    fontweight="bold", color=INK)
    fig.legend([plt.Rectangle((0, 0), 1, 1, color=GREY), plt.Rectangle((0, 0), 1, 1, color=BLUE)],
               ["Stateless · Jev + existing policy", "C4 · same observations + Flow Ledger"],
               loc="upper left", bbox_to_anchor=(0.065, 0.832), ncol=2, frameon=False, fontsize=11.2)

    flow_reviews = sum(row["reviewRequests"] for row in DATA["methods"]["flow"].values())
    stateless_reviews = sum(row["reviewRequests"] for row in DATA["methods"]["stateless"].values())
    hard_interruptions = DATA["methods"]["flow"]["hard-benign"]["terminalInterventions"]
    fig.text(0.065, 0.145,
             f"Review burden: {flow_reviews} C4 asks vs {stateless_reviews} stateless asks. "
             f"{hard_interruptions} hard-benign terminals receive extra review.",
             fontsize=11.2, color=INK)
    misses = DATA["methods"]["flow"]["attack"]["total"] - DATA["methods"]["flow"]["attack"]["terminalInterventions"]
    fig.text(0.065, 0.105, f"Known misses: {misses} script-based egress probes pass both methods.",
             fontsize=10.7, color=INK)
    fig.text(0.065, 0.058,
             "Source: hand-authored C4 regression fixtures. 'Ask' counts as gated, not confirmed safe; this is not a real-world attack-rate estimate.",
             fontsize=9.8, color=MUTED)
    OUT.mkdir(parents=True, exist_ok=True)
    for extension in ("png", "svg"):
        target = OUT / f"flow-ledger-regression.{extension}"
        fig.savefig(target, dpi=190, bbox_inches="tight", pad_inches=0.22)
        if extension == "svg":
            target.write_text("\n".join(line.rstrip() for line in target.read_text().splitlines()) + "\n")
    plt.close(fig)


if __name__ == "__main__":
    main()
