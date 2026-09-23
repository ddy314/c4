#!/usr/bin/env python3
"""Render publication-ready, static README figures from the verified metric snapshot."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from statistics import median

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.lines import Line2D
from matplotlib.patches import Patch


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "charts"
DATA = json.loads((ROOT / "benchmarks" / "metrics.json").read_text())
METHODS = DATA["methods"]

BG = "#f7f9fc"
PANEL = "#ffffff"
WHITE = "#172235"
MUTED = "#66758b"
GRID = "#dde4ee"
BLUE = "#255ed2"
CYAN = "#5e9fdf"
GREY = "#8d9aad"
RULE = "#68768a"

NAMES = {
    "c4": "C4 · Jev + policy",
    "action-rule": "Keyword rules",
    "google/gemma-3-4b-it": "Gemma 3 4B",
    "meta-llama/llama-3.2-3b-instruct": "Llama 3.2 3B",
    "mistralai/ministral-3b-2512": "Ministral 3B",
    "qwen/qwen3-30b-a3b-instruct-2507": "Qwen3 30B A3B",
    "openai/gpt-4o-mini": "GPT-4o mini",
    "google/gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
    "deepseek/deepseek-v3.2": "DeepSeek V3.2",
    "deepseek/deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
    "z-ai/glm-5.3-flash": "GLM 5.3 Flash",
    "google/gemini-3.5-flash-lite": "Gemini 3.5 Flash Lite",
    "openai/gpt-6-luna": "GPT-6 Luna",
    "qwen/qwen3.8-flash": "Qwen3.8 Flash",
    "qwen/qwen3.8-27b": "Qwen3.8 27B",
}

plt.rcParams.update(
    {
        "font.family": "DejaVu Sans",
        "font.size": 11,
        "axes.facecolor": PANEL,
        "figure.facecolor": BG,
        "savefig.facecolor": BG,
        "text.color": WHITE,
        "axes.labelcolor": MUTED,
        "xtick.color": MUTED,
        "ytick.color": WHITE,
        "axes.edgecolor": GRID,
        "svg.fonttype": "none",
    }
)


def color(row):
    return BLUE if row["id"] == "c4" else CYAN if row["family"] == "2026 model" else RULE if row["family"] == "Rules" else GREY


def ordered():
    return sorted(METHODS, key=lambda row: (-row["caught"], row["hard_false_alarms"], NAMES[row["id"]]))


def save(fig, stem):
    OUT.mkdir(parents=True, exist_ok=True)
    for extension in ("png", "svg"):
        target = OUT / f"{stem}.{extension}"
        fig.savefig(target, dpi=180, facecolor=BG, bbox_inches="tight", pad_inches=0.2)
        if extension == "svg":
            target.write_text("\n".join(line.rstrip() for line in target.read_text().splitlines()) + "\n")
    plt.close(fig)


def heading(fig, title, subtitle, footer):
    fig.text(0.06, 0.955, title, fontsize=24, fontweight="bold", color=WHITE, va="top")
    fig.text(0.06, 0.904, subtitle, fontsize=12, color=MUTED, va="top")
    fig.text(0.06, 0.032, footer, fontsize=9.5, color=MUTED, va="bottom")


def legend_handles():
    return [
        Patch(color=BLUE, label="C4"),
        Patch(color=CYAN, label="Newer 2026 models"),
        Patch(color=GREY, label="Earlier baselines"),
        Patch(color=RULE, label="Local keyword rules"),
    ]


def ranking():
    rows = ordered()
    fig = plt.figure(figsize=(16, 10.7))
    heading(
        fig,
        "Prompt-injection detection · all 15 methods",
        "Same 60 InjecAgent attacks per method  •  longer bar is better  •  hard-benign false alarms shown separately",
        "Source: pinned InjecAgent validation cohort  •  Hard-benign denominator: 11 for C4/rules, 12 for chat models  •  Candidate C4 policy is opt-in",
    )
    ax = fig.add_axes([0.23, 0.12, 0.71, 0.70])
    ax.set_xlim(0, 85)
    ax.set_ylim(-0.9, len(rows) - 0.45)
    ax.invert_yaxis()
    ax.barh(range(len(rows)), [r["caught"] for r in rows], color=[color(r) for r in rows], height=0.61, zorder=3)
    ax.set_yticks(range(len(rows)), [NAMES[r["id"]] for r in rows], fontsize=11)
    ax.set_xticks([0, 15, 30, 45, 60], ["0", "15", "30", "45", "60"])
    ax.set_xlabel("Attacks detected / 60", fontsize=11, labelpad=9)
    ax.xaxis.grid(True, color=GRID, linewidth=0.8, zorder=0)
    ax.tick_params(axis="y", length=0, pad=11)
    ax.tick_params(axis="x", length=0, pad=8)
    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.text(63, -0.6, "DETECTED", fontsize=9, color=MUTED, fontweight="bold")
    ax.text(73.5, -0.6, "HARD FP", fontsize=9, color=MUTED, fontweight="bold")
    for i, row in enumerate(rows):
        ax.text(63, i, f'{row["caught"]}/60', va="center", fontsize=11, fontweight="bold", color=WHITE)
        ax.text(73.5, i, f'{row["hard_false_alarms"]}/{row["hard_valid"]}', va="center", fontsize=10.5, color=MUTED)
    fig.legend(handles=legend_handles(), loc="upper left", bbox_to_anchor=(0.06, 0.863), ncol=4, frameon=False, labelcolor=WHITE, fontsize=10)
    save(fig, "attack-detection-ranking")


def heatmap():
    rows = ordered()
    categories = list(rows[0]["category"])
    labels = [
        "Physical\nharm",
        "Financial\nharm",
        "Data security\nharm",
        "Physical\ndata",
        "Financial\ndata",
        "Other",
    ]
    matrix = [[row["category"][category][0] for category in categories] for row in rows]
    cmap = LinearSegmentedColormap.from_list("detection", ["#edf2f9", "#9ec2ee", "#3268cf"])
    fig = plt.figure(figsize=(16, 10.9))
    heading(
        fig,
        "Where each method detects the attack",
        "Six InjecAgent attack categories  •  every cell is detected attacks out of 10  •  all 15 methods shown",
        "Source: pinned InjecAgent validation cohort  •  A detection-only breakdown; see the ranking chart for hard-benign false alarms",
    )
    ax = fig.add_axes([0.23, 0.11, 0.70, 0.73])
    ax.imshow(matrix, cmap=cmap, vmin=0, vmax=10, aspect="auto", interpolation="nearest")
    ax.set_xlim(-0.5, 6.65)
    ax.set_xticks(range(6), labels, fontsize=10)
    ax.xaxis.tick_top()
    ax.tick_params(axis="x", length=0, pad=13)
    ax.set_yticks(range(len(rows)), [NAMES[r["id"]] for r in rows], fontsize=11)
    ax.tick_params(axis="y", length=0, pad=11)
    for spine in ax.spines.values():
        spine.set_visible(False)
    for i, row in enumerate(rows):
        for j, detected in enumerate(matrix[i]):
            ax.text(j, i, f"{detected}/10", ha="center", va="center", color="#ffffff" if detected >= 8 else WHITE, fontsize=10, fontweight="bold")
        ax.text(6.12, i, f'{row["caught"]}/60', ha="center", va="center", color=WHITE, fontsize=10.5, fontweight="bold")
    ax.text(6.12, -1.15, "TOTAL", ha="center", va="center", fontsize=9, color=MUTED, fontweight="bold")
    ax.set_xticks([j - 0.5 for j in range(1, 7)], minor=True)
    ax.set_yticks([j - 0.5 for j in range(1, len(rows))], minor=True)
    ax.grid(which="minor", color=BG, linewidth=4)
    ax.tick_params(which="minor", bottom=False, left=False)
    save(fig, "attack-category-heatmap")


# Point-label offsets are hand-tuned for this pinned snapshot, keeping every method named.
COST_OFFSETS = {
    "c4": (8, -21),
    "google/gemma-3-4b-it": (8, -6),
    "meta-llama/llama-3.2-3b-instruct": (-8, -18),
    "mistralai/ministral-3b-2512": (-8, 11),
    "qwen/qwen3-30b-a3b-instruct-2507": (9, 10),
    "openai/gpt-4o-mini": (8, -17),
    "google/gemini-2.5-flash-lite": (8, 9),
    "deepseek/deepseek-v3.2": (8, 10),
    "deepseek/deepseek-v4.1-flash": (9, -14),
    "z-ai/glm-5.3-flash": (8, 13),
    "google/gemini-3.5-flash-lite": (8, -13),
    "openai/gpt-6-luna": (8, -12),
    "qwen/qwen3.8-flash": (9, -11),
    "qwen/qwen3.8-27b": (-8, 11),
}

LATENCY_OFFSETS = {
    "c4": (8, -19),
    "google/gemma-3-4b-it": (-8, -14),
    "meta-llama/llama-3.2-3b-instruct": (8, 8),
    "mistralai/ministral-3b-2512": (8, 10),
    "qwen/qwen3-30b-a3b-instruct-2507": (8, -16),
    "openai/gpt-4o-mini": (8, 11),
    "google/gemini-2.5-flash-lite": (8, -17),
    "deepseek/deepseek-v3.2": (8, 9),
    "deepseek/deepseek-v4.1-flash": (8, -13),
    "z-ai/glm-5.3-flash": (8, 13),
    "google/gemini-3.5-flash-lite": (8, 10),
    "openai/gpt-6-luna": (8, -32),
    "qwen/qwen3.8-flash": (-8, 11),
    "qwen/qwen3.8-27b": (-8, -15),
}


def scatter(kind):
    cost = kind == "cost"
    fig = plt.figure(figsize=(16, 9.2))
    title = "Safety quality vs observed API cost" if cost else "Safety quality vs observed API latency"
    subtitle = "Higher and farther left is better  •  13 chat models plus C4  •  each point directly labeled"
    footer = (
        "Balanced accuracy = mean of attack recall and easy-control specificity; all easy controls passed. Cost includes retries; see hard-benign false alarms in ranking."
        if cost
        else "Median successful API-call latency; network/provider effects included. Earlier and newer runs used different output-token/reasoning settings."
    )
    heading(fig, title, subtitle, footer)
    ax = fig.add_axes([0.095, 0.17, 0.82, 0.65])
    ax.set_facecolor(PANEL)
    ax.set_ylim(0.46, 1.05)
    ax.set_yticks([0.5, 0.6, 0.7, 0.8, 0.9, 1.0], ["50%", "60%", "70%", "80%", "90%", "100%"])
    if cost:
        ax.set_xscale("log")
        ax.set_xlim(0.008, 0.8)
        ax.set_xticks([0.01, 0.02, 0.05, 0.1, 0.2, 0.5], ["$0.01", "$0.02", "$0.05", "$0.10", "$0.20", "$0.50"])
        ax.set_xlabel("Reported USD per 1,000 valid checks (log scale)", fontsize=11, labelpad=11)
    else:
        ax.set_xlim(250, 3600)
        ax.set_xticks([500, 1000, 1500, 2000, 2500, 3000, 3500], ["0.5s", "1s", "1.5s", "2s", "2.5s", "3s", "3.5s"])
        ax.set_xlabel("Median API-call latency", fontsize=11, labelpad=11)
    ax.set_ylabel("Balanced accuracy", fontsize=11, labelpad=12)
    ax.grid(True, which="major", color=GRID, linewidth=0.7, alpha=0.75)
    ax.tick_params(length=0, pad=8)
    for spine in ax.spines.values():
        spine.set_visible(False)
    offset = COST_OFFSETS if cost else LATENCY_OFFSETS
    for row in METHODS:
        if row["id"] == "action-rule":
            continue  # Zero API spend and no API-call latency; shown in the ranking/heatmap.
        x = row["cost_per_1000_valid"] if cost else row["median_latency_ms"]
        y = row["balanced_accuracy"]
        hue = color(row)
        ax.scatter(x, y, s=115 if row["id"] == "c4" else 72, c=hue, edgecolors=WHITE if row["id"] == "c4" else PANEL, linewidths=1.3, zorder=4)
        dx, dy = offset[row["id"]]
        ax.annotate(
            NAMES[row["id"]],
            (x, y),
            xytext=(dx, dy),
            textcoords="offset points",
            ha="left" if dx > 0 else "right",
            va="center",
            fontsize=9.1,
            fontweight="bold" if row["id"] == "c4" else "normal",
            color=WHITE if row["id"] == "c4" else "#2864a4" if row["family"] == "2026 model" else "#56647a",
            bbox={"boxstyle": "round,pad=0.16", "fc": PANEL, "ec": "none", "alpha": 0.86},
            zorder=5,
        )
    fig.legend(
        handles=[Line2D([0], [0], marker="o", color="none", markerfacecolor=c, markersize=9, label=label) for c, label in [(BLUE, "C4"), (CYAN, "Newer 2026 models"), (GREY, "Earlier baselines")]],
        loc="upper left", bbox_to_anchor=(0.06, 0.865), ncol=3, frameon=False, labelcolor=WHITE, fontsize=10,
    )
    save(fig, "accuracy-vs-cost" if cost else "accuracy-vs-latency")


def main():
    verify_metrics()
    assert len(METHODS) == len(NAMES) == 15
    assert all(row["id"] in NAMES for row in METHODS)
    ranking()
    heatmap()
    scatter("cost")
    scatter("latency")
    print(f"Rendered four PNG/SVG figure pairs from benchmarks/metrics.json into {OUT}")


def verify_metrics():
    """Fail before drawing if a metric no longer matches the public per-attempt data."""
    snapshot = json.loads((ROOT / "benchmarks" / "results.json").read_text())
    assert snapshot["source"] == DATA["source"]
    cases = {case["id"]: case for case in snapshot["cases"]}
    common_ids = {case_id for case_id, case in cases.items() if case["category"] != "Hard benign"}
    assert len(common_ids) == 120
    attempts = defaultdict(list)
    for attempt in snapshot["attempts"]:
        attempts[(attempt["model"], attempt["id"])].append(attempt)
    for row in METHODS:
        method = row["id"]
        final = {case_id: attempts[(method, case_id)][-1] for case_id in cases}
        valid = lambda item: item["error"] is None and item["prediction"] is not None
        caught = sum(valid(final[case_id]) and final[case_id]["prediction"] is True for case_id in common_ids if cases[case_id]["label"] == "attack")
        allowed = sum(valid(final[case_id]) and final[case_id]["prediction"] is False for case_id in common_ids if cases[case_id]["label"] == "benign")
        hard = [final[case_id] for case_id, case in cases.items() if case["category"] == "Hard benign"]
        hard_valid = sum(valid(item) for item in hard)
        hard_fp = sum(valid(item) and item["prediction"] is True for item in hard)
        assert (caught, allowed, hard_valid, hard_fp) == (row["caught"], row["allowed"], row["hard_valid"], row["hard_false_alarms"]), method
        assert abs((caught / 60 + allowed / 60) / 2 - row["balanced_accuracy"]) < 1e-12, method
        for category, (detected, total) in row["category"].items():
            category_ids = [case_id for case_id in common_ids if cases[case_id]["category"] == category and cases[case_id]["label"] == "attack"]
            assert len(category_ids) == total == 10
            assert sum(valid(final[case_id]) and final[case_id]["prediction"] is True for case_id in category_ids) == detected, method
        cost = sum(item["reportedCostUsd"] for case_id in common_ids for item in attempts[(method, case_id)]) / 120 * 1000
        assert abs(cost - row["cost_per_1000_valid"]) < 1e-10, method
        if row["median_latency_ms"] is not None:
            latency = median(final[case_id]["latencyMs"] for case_id in common_ids if valid(final[case_id]))
            assert abs(latency - row["median_latency_ms"]) < 1e-10, method


if __name__ == "__main__":
    main()
