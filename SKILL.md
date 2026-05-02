---
name: svg-diagram-connectors
description: >
  Correctly compute and fix SVG connector line endpoints for architecture diagrams
  where HTML nodes/groups are absolutely positioned over an SVG canvas. Use this
  skill any time connector lines need to touch container borders (not inner nodes or
  pills), lines are misaligned, lines overshoot or stop short of boxes, or paths need
  to connect group midpoints. Triggers on: "fix connector lines", "lines not touching
  the box", "connect containers not nodes", "SVG path alignment", "diagram connectors",
  "lines hitting wrong element", "paths misaligned", or any request to fix/redraw
  connecting lines in an HTML+SVG architecture diagram. Always load this skill before
  touching any SVG <path> in a diagram.
---

# SVG Diagram Connectors

Precise formulas for computing SVG `<path>` endpoints that connect absolutely-positioned
HTML group containers in an architecture diagram, where HTML sits on top of an SVG canvas.

---

## Core Geometry Model

The pattern is always:
- An outer `<div class="diagram-canvas">` with a fixed pixel size (e.g. `width:1240px; height:640px`)
- An `<svg class="diagram-svg">` absolutely inset over it with a matching `viewBox`
- HTML `<div class="group">` containers with `position:absolute; left:X; top:Y; width:W; height:H`
- HTML `<div class="node">` items inside groups, also absolutely positioned relative to their group
- SVG `<path>` elements that should visually connect the group containers

**Key insight**: SVG coordinates map 1:1 to the canvas pixel dimensions when `preserveAspectRatio="none"`. 
A group at CSS `left:410px` sits at SVG x=410. No transform needed.

---

## Border Midpoint Formulas

These are the ONLY coordinates you need for container-to-container connectors.

```
Group right-wall midpoint:
  x = group.left + group.width
  y = group.top  + group.height / 2

Group left-wall midpoint:
  x = group.left
  y = group.top  + group.height / 2

Group top-wall midpoint:
  x = group.left + group.width / 2
  y = group.top

Group bottom-wall midpoint:
  x = group.left + group.width / 2
  y = group.top  + group.height
```

**Never use inner node coordinates for container-to-container connections.**
**Never use the group's inner padding offset — measure from the outer border.**

---

## Node Center Formulas (only for node-to-node connections)

Standard `.node` height ≈ 52px. Standard `.node--small` height ≈ 38px.

```
Node center on canvas:
  x = group.left + node.left + node.width / 2
  y = group.top  + node.top  + node_height / 2
```

---

## SVG Path Template (horizontal flow, left→right)

For a line from box A's right wall to box B's left wall, use a cubic bezier:

```svg
<path d="M {Ax} {Ay} C {Cx1} {Ay} {Cx1} {By} {Bx} {By}" />
```

Where the control point x: `Cx1 = Ax + (Bx - Ax) / 2`

This creates a smooth S-curve. Example:

```
A right-wall: x=310, y=310
B left-wall:  x=410, y=335
Cx1 = 310 + (410-310)/2 = 360

→ d="M 310 310 C 360 310 360 335 410 335"
```

### Fan-out (one source → multiple destinations)

All paths share the SAME source point (right-wall midpoint of source group).
Each path fans to a different destination's left-wall midpoint.

```svg
<!-- Source midpoint: x=660, y=335 -->
<!-- Dest A center: x=770, y=158 -->
<!-- Dest B center: x=770, y=318 -->
<!-- Dest C center: x=770, y=508 -->

<path d="M 660 335 C 715 335 715 158 770 158" />
<path d="M 660 335 C 715 335 715 318 770 318" />
<path d="M 660 335 C 715 335 715 508 770 508" />
```

**Vertical centering rule**: When fanning out to N destination boxes on the right,
the destinations must be vertically distributed so (a) their group's collective center
aligns with the source box's right-wall midpoint AND (b) their left-wall midpoints
are evenly spaced — otherwise interior destinations drift off-axis even when the
outer envelope is symmetric.

**Step 1 — center the bounding box on the source midpoint:**
```
total_span     = last_dest_bottom - first_dest_top
group_center_y = first_dest_top + total_span / 2
source_y       = this must equal group_center_y
```
If they don't match, set:
```
first_dest_top = source_midpoint_y - total_span / 2
```

**Step 2 — redistribute interior destinations so left-wall midpoints are evenly spaced:**
```
first_mid = first_dest_top + dest[0].height / 2
last_mid  = first_dest_top + total_span - dest[N-1].height / 2
mid_step  = (last_mid - first_mid) / (N - 1)

for i in 0..N-1:
    dest[i].top = first_mid + i * mid_step - dest[i].height / 2
```

This works for both equal- and mixed-height destinations. For equal heights it
collapses to uniform vertical gaps between boxes. Skip Step 2 only when N < 3
(no interior destinations to redistribute).

Then recompute each destination's left-wall midpoint Y using the updated top values.

---

## Step-by-Step Workflow

1. **Read the HTML** — find every `<div class="group">` with its `style` attribute. Extract `left`, `top`, `width`, `height` for each group involved in the connection.

2. **Compute border midpoints** using the formulas above. Write them down before touching any code.

3. **Identify connection topology**:
   - One-to-one: single path, right-wall → left-wall
   - One-to-many (fan-out): multiple paths all starting from same source right-wall midpoint
   - Many-to-one (fan-in): multiple paths all ending at same destination left-wall midpoint

4. **Write the bezier paths** using the template above.

5. **Smoke test fan-out symmetry** — for any fan-out, assert BOTH conditions:

   (a) **Bounding-box centered on source:**
   ```
   (min destination Y + max destination Y) / 2 == source right-wall midpoint Y
   ```

   (b) **Interior destinations evenly spaced** (only when N ≥ 3):
   ```
   max(|gap[i+1] - gap[i]|) ≤ 5px,  where gap[i] = mid_y[i+1] - mid_y[i]
   ```

   Flag a warning if either differs by more than 5px. If (a) fails apply Step 1 of the
   vertical centering rule; if (b) fails apply Step 2. Run both steps in order before
   continuing — Step 2 alone won't fix an off-center stack.

6. **Update particle `<animateMotion>`** elements to reference the new path ids. Match one particle per path.

7. **Verify in browser** — take a screenshot and confirm lines touch the outer container border only.

---

## Common Mistakes to Avoid

| Mistake | Correct approach |
|---|---|
| Using `group.left + node.left` as path endpoint | Use `group.left` (container wall) only |
| Ending path at `group.left` when target has inner padding | Still use `group.left` — line visually enters the box |
| Different Y values for fan-out source | All fan-out paths MUST share the same source X,Y |
| Forgetting to update `<animateMotion>` hrefs after renaming path ids | Always grep for old path ids and update all references |
| Path endpoints inside the box interior | Endpoint = wall coordinate exactly, not wall + padding |

---

## Quick Reference: Worked Example (Stage 2)

```
IBX group:     left:20,  top:120, width:290, height:380
  right-wall midpoint → x=310, y=310

Fabric group:  left:410, top:120, width:250, height:430
  left-wall midpoint  → x=410, y=335
  right-wall midpoint → x=660, y=335

Foundation Models: left:770, top:78,  height:160 → left-wall midpoint x=770, y=158
Neoclouds:         left:770, top:248, height:140 → left-wall midpoint x=770, y=318
CSPs:              left:770, top:438, height:140 → left-wall midpoint x=770, y=508
```

Resulting paths:
```svg
<!-- IBX → Fabric (single) -->
<path id="s2a" d="M 310 310 C 360 310 360 335 410 335" />

<!-- Fabric → destinations (fan-out) -->
<path id="s2b_fm"  d="M 660 335 C 715 335 715 158 770 158" />
<path id="s2b_nc"  d="M 660 335 C 715 335 715 318 770 318" />
<path id="s2b_csp" d="M 660 335 C 715 335 715 508 770 508" />
```

---

## Scaling Note

When the diagram uses `transform: scale()` for responsive sizing, the SVG coordinates
do NOT change — the scale applies to the whole canvas uniformly. Always compute
coordinates in the natural (unscaled) canvas pixel space.
