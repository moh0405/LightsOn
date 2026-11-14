#!/usr/bin/env python3
"""LLM council for Lights On, after karpathy/llm-council, using local agent CLIs instead of OpenRouter.

Stage 1: every member answers the question independently (read-only, in the repo).
Stage 2: every member ranks the anonymized answers (Response A, B, ...) and ends with a FINAL RANKING list.
Stage 3: the chairman synthesizes one answer from all responses plus the aggregate ranking.
Output: docs/council/<timestamp>-<slug>.md (committable; contains no keys).
"""
from __future__ import annotations

import argparse, concurrent.futures as cf, datetime as dt, re, string, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]

# name -> argv prefix; the prompt is appended as the last argument. Read-only modes only.
MEMBERS = {
    "codex": ["codex", "exec", "-m", "gpt-6.1-sol", "-s", "read-only"],
    "claude-opus": ["claude", "-p", "--model", "claude-opus-5-5"],
    "grok": ["grok", "-p"],
    "agy-sonnet": ["agy", "--model", "claude-sonnet-4-6", "-p"],
    "agy-gemini": ["agy", "--model", "gemini-3.8-flash-high", "-p"],
}
DEFAULT_MEMBERS = ["codex", "claude-opus", "grok", "agy-gemini"]

STAGE1 = """You are one member of an independent LLM council reviewing the hackathon project in this repository
(Lights On, HackPrinceton Fall 2026). Read what you need (docs/PRD.md, AGENTS.md, docs/overnight-log.md, the code) but
change nothing. Answer the question below directly, with concrete reasons and specific recommendations. Be honest about
risks and what to cut. Keep it under 600 words.

QUESTION:
{question}
{context}"""

STAGE2 = """You are on an LLM council. The question was:

{question}

Here are anonymized answers from council members:

{answers}

Evaluate each answer for accuracy, insight, and usefulness to a team with ~20 hours left before a hackathon demo.
Briefly critique each one (2-4 sentences each). Then end your reply with exactly this block, best first, listing every
response label once:

FINAL RANKING:
1. Response X
2. Response Y
..."""

STAGE3 = """You are the chairman of an LLM council. The question was:

{question}

Council answers (anonymized):

{answers}

Aggregate peer ranking (lower average = better): {ranking}

Write the council's final answer: the consensus, the important disagreements and who is likely right, and a short,
prioritized action list (what to build, what to cut, what to say to judges). Under 700 words."""


def run(member: str, prompt: str, timeout: int) -> str:
    try:
        out = subprocess.run(MEMBERS[member] + [prompt], cwd=ROOT, capture_output=True, text=True,
                             timeout=timeout, stdin=subprocess.DEVNULL)
        text = (out.stdout or "").strip()
        if out.returncode != 0 or not text:
            return f"[{member} failed: exit {out.returncode}: {(out.stderr or '').strip()[-300:]}]"
        return text
    except subprocess.TimeoutExpired:
        return f"[{member} timed out after {timeout}s]"
    except FileNotFoundError:
        return f"[{member} CLI not installed]"


def parallel(members, prompts, timeout):
    with cf.ThreadPoolExecutor(len(members)) as ex:
        futs = {m: ex.submit(run, m, prompts[m], timeout) for m in members}
        return {m: f.result() for m, f in futs.items()}


def parse_ranking(text: str, labels: list[str]) -> list[str]:
    tail = text.split("FINAL RANKING:")[-1] if "FINAL RANKING:" in text else ""
    found = re.findall(r"Response ([A-Z])", tail)
    seen = []
    for l in found:
        if l in labels and l not in seen:
            seen.append(l)
    return seen


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("question")
    ap.add_argument("--context-file", action="append", default=[], help="extra file(s) to quote into the prompt")
    ap.add_argument("--members", default=",".join(DEFAULT_MEMBERS), help=f"comma list from {list(MEMBERS)}")
    ap.add_argument("--chairman", default="claude-opus")
    ap.add_argument("--timeout", type=int, default=900)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    members = [m.strip() for m in a.members.split(",") if m.strip()]
    bad = [m for m in members + [a.chairman] if m not in MEMBERS]
    if bad:
        sys.exit(f"unknown members: {bad}")
    context = "".join(f"\n--- {p} ---\n{Path(p).read_text()[:20000]}" for p in a.context_file)
    if a.dry_run:
        print("members:", members, "chairman:", a.chairman)
        print(STAGE1.format(question=a.question, context=context)[:1500])
        return

    print(f"stage 1: {members}", file=sys.stderr)
    s1 = parallel(members, {m: STAGE1.format(question=a.question, context=context) for m in members}, a.timeout)
    ok = {m: t for m, t in s1.items() if not t.startswith("[")}
    labels = list(string.ascii_uppercase[: len(ok)])
    label_of = dict(zip(ok, labels))
    answers = "\n\n".join(f"Response {label_of[m]}:\n{t}" for m, t in ok.items())

    print("stage 2: peer ranking", file=sys.stderr)
    s2 = parallel(list(ok), {m: STAGE2.format(question=a.question, answers=answers) for m in ok}, a.timeout) if len(ok) > 1 else {}
    scores: dict[str, list[int]] = {l: [] for l in labels}
    for m, t in s2.items():
        for pos, l in enumerate(parse_ranking(t, labels), 1):
            scores[l].append(pos)
    avg = {l: (sum(v) / len(v) if v else None) for l, v in scores.items()}
    order = sorted(labels, key=lambda l: (avg[l] is None, avg[l] or 0))
    ranking = ", ".join(f"Response {l} ({avg[l]:.2f})" if avg[l] is not None else f"Response {l} (unranked)" for l in order)

    print(f"stage 3: chairman {a.chairman}", file=sys.stderr)
    final = run(a.chairman, STAGE3.format(question=a.question, answers=answers, ranking=ranking), a.timeout)

    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M")
    slug = re.sub(r"[^a-z0-9]+", "-", a.question.lower())[:40].strip("-")
    out = ROOT / "docs" / "council" / f"{stamp}-{slug}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    reveal = ", ".join(f"Response {l} = {m}" for m, l in label_of.items())
    parts = [f"# LLM council: {a.question}\n", f"Members: {', '.join(members)}. Chairman: {a.chairman}. {stamp}.\n",
             "## Final answer (chairman)\n", final, "\n## Aggregate ranking\n", ranking, f"\n\nIdentities (revealed after ranking): {reveal}\n",
             "\n## Stage 1 answers\n"] + [f"### {m}\n{t}\n" for m, t in s1.items()] + \
            ["\n## Stage 2 peer reviews\n"] + [f"### {m}\n{t}\n" for m, t in s2.items()]
    out.write_text("\n".join(parts))
    print(out)


if __name__ == "__main__":
    main()
