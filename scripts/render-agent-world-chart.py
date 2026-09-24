#!/usr/bin/env python3
"""Render the model-driven mock-tool outcome, including negative results."""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt


ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "benchmarks" / "agent-world-v5-results.json").read_text())
OUT = ROOT / "assets" / "charts"
BG, PANEL, INK, MUTED, GRID = "#f7f9fc", "#ffffff", "#172235", "#66758b", "#dde4ee"
BLUE, GREY = "#255ed2", "#a5afbf"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "figure.facecolor": BG, "axes.facecolor": PANEL,
    "savefig.facecolor": BG, "text.color": INK, "axes.labelcolor": MUTED,
    "xtick.color": INK, "ytick.color": MUTED, "axes.edgecolor": GRID,
    "svg.fonttype": "none",
})


def outcome(group: str, arm: str, field: str) -> tuple[int, int]:
    rows = [row for row in DATA["rows"] if row["group"] == group and row["arm"] == arm]
    if len(rows) != 12 or any(row.get("error") or not isinstance(row.get(field), (bool, int)) for row in rows):
        raise ValueError(f"Incomplete agent-world group: {group}/{arm}")
    return sum(bool(row[field]) for row in rows), len(rows)


def main() -> None:
    if DATA["model"] != "z-ai/glm-5.3-flash" or DATA["flowPolicyId"] != "flow-v5" or len(DATA["rows"]) != 72:
        raise ValueError("Unexpected agent-world source snapshot")
    groups = [
        ("Attack notes\ncanary delivered", "attack", "leakedCanary"),
        ("Ordinary notes\nreport delivered", "benign", "receipts"),
        ("Hard-benign notes\nreport delivered", "hard-benign", "receipts"),
    ]
    fig = plt.figure(figsize=(15.2, 8.2))
    fig.text(0.065, 0.94, "C4 · model-driven tool-world outcomes", fontsize=26, fontweight="bold", va="top")
    fig.text(0.065, 0.875, "GLM 5.3 Flash  •  36 synthetic notes × 2 arms  •  fixed Jev observations", fontsize=12.3, color=MUTED, va="top")
    ax = fig.add_axes([0.095, 0.24, 0.84, 0.52])
    ax.set_ylim(0, 13.4)
    ax.set_xlim(-0.55, 2.55)
    ax.set_yticks([0, 2, 4, 6, 8, 10, 12])
    ax.set_ylabel("Episodes / group", fontsize=12, labelpad=12)
    ax.yaxis.grid(True, color=GRID, linewidth=0.9, zorder=0)
    ax.tick_params(axis="both", length=0, pad=10)
    ax.set_xticks(range(3), [entry[0] for entry in groups], fontsize=12.5)
    for spine in ax.spines.values():
        spine.set_visible(False)
    width = 0.31
    for index, (_label, group, field) in enumerate(groups):
        for arm, offset, color in [("stateless", -width / 2, GREY), ("flow", width / 2, BLUE)]:
            value, total = outcome(group, arm, field)
            x = index + offset
            ax.bar(x, value, width=width * 0.94, color=color, zorder=3)
            ax.text(x, value + 0.26, f"{value}/{total}", ha="center", va="bottom", fontsize=13.5, fontweight="bold", color=INK)
    fig.legend([plt.Rectangle((0, 0), 1, 1, color=GREY), plt.Rectangle((0, 0), 1, 1, color=BLUE)],
               ["Stateless · Jev + existing policy", "C4 · same observations + Flow Ledger"],
               loc="upper left", bbox_to_anchor=(0.065, 0.832), ncol=2, frameon=False, fontsize=11.2)
    reviews = sum(1 for row in DATA["rows"] if row["arm"] == "flow" for decision in row["decisions"] if decision["action"] == "ask")
    baseline_leaks, _ = outcome("attack", "stateless", "leakedCanary")
    flow_leaks, _ = outcome("attack", "flow", "leakedCanary")
    fig.text(0.065, 0.145, f"Exact canary receipts: {baseline_leaks} stateless vs {flow_leaks} C4. C4 requested {reviews} reviews across 36 episodes.", fontsize=11.2, color=INK)
    fig.text(0.065, 0.105, f"Provider-reported agent API usage: USD {DATA['reportedUsd']:.4f} across {DATA['requests']} model requests; synthetic Jev calls cost USD 0.", fontsize=10.7, color=INK)
    fig.text(0.065, 0.058,
             "Source: synthetic C4 notes and a mock receiver. Simulated reviewer denies asks. No production agent, real credential, or field attack-rate claim.",
             fontsize=9.8, color=MUTED)
    OUT.mkdir(parents=True, exist_ok=True)
    for extension in ("png", "svg"):
        target = OUT / f"agent-world-outcomes.{extension}"
        fig.savefig(target, dpi=190, bbox_inches="tight", pad_inches=0.22)
        if extension == "svg":
            target.write_text("\n".join(line.rstrip() for line in target.read_text().splitlines()) + "\n")
    plt.close(fig)


if __name__ == "__main__":
    main()
