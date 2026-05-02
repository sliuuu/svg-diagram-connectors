# svg-diagram-connectors

Deterministic formulas for computing SVG `<path>` endpoints in HTML+SVG architecture
diagrams. Distributed as a [Claude Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
so an LLM can compute connector geometry instead of guessing.

## Problem

When an LLM is asked to draw or fix connector lines in an architecture diagram
(`<div>` boxes positioned over an `<svg>` canvas), it typically:

- Eyeballs path coordinates from the visual instead of computing them from layout
- Anchors paths to inner element midpoints (pills, icons) instead of container borders
- Picks an arbitrary fan-out source Y for each path, breaking the shared origin
- Centers the destination *bounding box* but leaves interior destinations off-axis

The result is connectors that miss boxes, terminate inside padding, or splay
asymmetrically — visible to anyone but invisible to a model lacking a deterministic
procedure.

This skill replaces guessing with four formulas: **border midpoints**, a **bezier
template**, and a **two-step vertical centering rule** for fan-outs. Coordinates are
derived from the HTML `style` attribute of each group container — not from the
rendered image.

## Geometry model

The pattern this skill assumes:

```
┌── div.diagram-canvas (fixed pixel size) ──────────────┐
│  ┌── svg.diagram-svg (absolute, viewBox matches) ──┐  │
│  │                                                  │  │
│  │     <path d="..." />                             │  │
│  │                                                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│   div.group  (position:absolute; left,top,width,height)│
│     div.node (absolute, relative to group)             │
│   div.group ...                                        │
└────────────────────────────────────────────────────────┘
```

With `preserveAspectRatio="none"` and a `viewBox` matching the canvas pixel size,
**SVG coordinates equal CSS pixels 1:1**. A group at CSS `left:410px` has SVG
x = 410. No transforms required.

## Border midpoint formulas

For container-to-container connectors, use only these:

```
right-wall mid:   x = group.left + group.width,        y = group.top + group.height/2
left-wall mid:    x = group.left,                      y = group.top + group.height/2
top-wall mid:     x = group.left + group.width/2,      y = group.top
bottom-wall mid:  x = group.left + group.width/2,      y = group.top + group.height
```

Never use inner-node coordinates for container-to-container connections.

## Bezier path template (horizontal flow)

For a line from box A's right wall to box B's left wall:

```svg
<path d="M {Ax} {Ay} C {Cx} {Ay} {Cx} {By} {Bx} {By}" />
```

Control point: `Cx = Ax + (Bx - Ax) / 2`. Produces a smooth S-curve that touches
both walls exactly.

## Fan-out vertical centering rule

For one source fanning out to N destination boxes, **two conditions must hold**:

1. **Bounding-box centered on source** — `(min dest mid Y + max dest mid Y) / 2 == source mid Y`
2. **Interior destinations evenly spaced** — equal gaps between consecutive `dest mid Y` values

Step 1 alone is insufficient: if input gaps were unequal, interior destinations
land off-axis even when the outer envelope is symmetric. Apply both:

```
# Step 1 — shift bounding box
total_span     = last_dest_bottom - first_dest_top
first_dest_top = source_mid_y - total_span / 2

# Step 2 — redistribute interior dest tops (skip when N < 3)
first_mid = first_dest_top + dest[0].height / 2
last_mid  = first_dest_top + total_span - dest[N-1].height / 2
mid_step  = (last_mid - first_mid) / (N - 1)

for i in 0..N-1:
    dest[i].top = first_mid + i * mid_step - dest[i].height / 2
```

See [`SKILL.md`](SKILL.md) for the full reference and [`examples/smoke-test-walkthrough.md`](examples/smoke-test-walkthrough.md)
for a worked example.

## Smoke test

The repo ships with a self-contained smoke test that exercises the rule in the
browser. It builds three panels from the same off-center input — RAW, Step 1
only, Step 1 + 2 — and prints PASS/FAIL coordinate assertions below each canvas.

![smoke test output](docs/smoke-test-output.png)

The expected output:

| Panel | (a) bbox center | (b) gap-spread | D2 on axis |
|---|---|---|---|
| RAW             | FAIL (Δ=30) | FAIL (gaps 140/160) | NO (-20px) |
| STEP 1 only     | PASS (Δ=0)  | FAIL (gaps 140/160) | NO (-10px) |
| STEP 1 + 2      | PASS (Δ=0)  | PASS (gaps 150/150) | **YES**    |

Run it locally:

```bash
npm install
npm test                          # uses Playwright's bundled chromium
USE_SYSTEM_CHROME=1 npm test      # or use a locally-installed Chrome
# Or open smoke-test/index.html in any browser
```

The headless runner (`smoke-test/run.js`) uses Playwright to assert that the RAW
and STEP 1 panels contain `FAIL` (proving the test exercises the failure case)
and that the STEP 1 + 2 panel contains only `PASS`. CI runs the same script on
every push — see [`.github/workflows/smoke-test.yml`](.github/workflows/smoke-test.yml).

## Install as a Claude Skill

Drop the skill into your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills/svg-diagram-connectors
curl -fsSL https://raw.githubusercontent.com/sliuuu/svg-diagram-connectors/main/SKILL.md \
  -o ~/.claude/skills/svg-diagram-connectors/SKILL.md
```

Or clone and symlink:

```bash
git clone https://github.com/sliuuu/svg-diagram-connectors.git
ln -s "$(pwd)/svg-diagram-connectors" ~/.claude/skills/svg-diagram-connectors
```

Restart Claude Code. The skill auto-triggers on prompts like "fix connector
lines", "lines not touching the box", "SVG path alignment", or "diagram
connectors". You can also invoke it explicitly with `/svg-diagram-connectors`.

## Repository layout

```
svg-diagram-connectors/
├── SKILL.md                          # Skill reference (loaded by Claude)
├── README.md                         # This file
├── smoke-test/
│   ├── index.html                    # Self-contained 3-panel smoke test
│   └── run.js                        # Playwright headless runner
├── docs/
│   └── smoke-test-output.png         # Expected output
├── examples/
│   └── smoke-test-walkthrough.md     # Step-by-step worked example
└── .github/workflows/
    └── smoke-test.yml                # CI: runs run.js on every push
```
