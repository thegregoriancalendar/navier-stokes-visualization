# Vortex study

An interactive, explanatory animation inspired by the vortex illustration in [OpenAI’s Navier–Stokes announcement](https://openai.com/index/navier-stokes-solution/), presented against a black background. The reference composition was inspected through [Nature’s credited reproduction](https://www.nature.com/articles/d41586-026-02842-5). No reference bitmap is embedded in the app; the strands are generated in 3D.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates `dist/` for static hosting. Dependencies are pinned; fonts load from Google Fonts with local fallbacks.

## Controls

- Play/pause or Space; replay with the circular-arrow button or R.
- Scrub the evolution timeline (scrubbing pauses the animation).
- Cycle playback through 0.5×, 1×, and 2×.
- Drag to orbit; scroll or pinch to zoom; reset the camera with the view toolbar.
- Toggle **Vector field** to show 192 small arrows sampled from the field that moves the strands.
- Save the current 3D frame as PNG, or enter full screen.
- The animation pauses when its About dialog is open and does not autoplay when reduced motion is requested.

## Scope and model

This is a schematic, not a numerical reconstruction of the theorem or a Navier–Stokes solver. The source repository is [openai/NavierStokesAndEuler](https://github.com/openai/NavierStokesAndEuler); the physical description is in [§2 of the paper](https://cdn.openai.com/pdf/32d9f210-8b73-45e0-91bc-82a30aef8a9a/navier-stokes.pdf).

The equation callouts around the animation quote the construction’s governing system:

```text
∂t u + (u · ∇)u − νΔu + ∇p = f
∇ · u = 0
u(·, 0) = 0
```

For `τ = 1 − t` and `0 < h < 1/100`, the paper gives radial and axial core scales `ℓr ≍ τ^(1/2)` and `ℓz ≍ τ^(1/2−h)`. Characteristic azimuthal and axial speeds scale like `τ^(−1/2−h)` and therefore diverge as `t ↑ 1`. Meanwhile, core kinetic energy is of order `τ^(1/2−3h)`, which tends to zero. This shrinking-volume/increasing-speed balance explains how peak velocity can blow up while total kinetic energy remains uniformly bounded. The displayed field below this panel is explanatory and does not solve those profile equations.

`src/flow.js` defines a time-dependent, incompressible velocity field. With `y` along the axis and `r² = x² + z²`:

```text
v(x,y,z,s) = (-a x - Ω z, 2a y, -a z + Ω x)
Ω(r,s) = ω / (1 + r²/c(s)²)
c(s) = c₀ exp(-κ s)
```

The strain has zero trace, and the axisymmetric swirl has zero divergence. Angular rotation is finite at the axis and decreases outward. `src/vortex.js` releases each trail from one point. Its leading tip follows an exact trajectory of the field while sampled trajectory history fills in behind it. Before the history window is full, the tail stays at the release point and the line grows. Afterward, both ends advance at the same history rate, producing a moving fixed-duration trail. Radial compression brings the head inward while axial strain carries it upward or downward. Centerline positions and tube normals are rebuilt and uploaded each frame. No scrolling texture or global mesh transform is used.

The optional layer in `src/vector-field.js` samples 192 fixed positions on a sparse cylindrical lattice spanning the rendered flow. Keeping the bases fixed makes it an Eulerian field display: each arrow rotates in place as `velocityAt` changes. Arrow length, brightness, and opacity increase with the displayed velocity, with capped lengths so the layer remains unobtrusive. Direction is physical; length communicates magnitude qualitatively. The transparent, depth-tested layer starts hidden.

Advection uses the exact integral of `dX/ds = v(X,s)`, rather than a frame-dependent numerical step. For a point released at time `b`, age `u = s-b`, and initial radius `r₀`, height `y₀`, and angle `θ₀`:

```text
r = r₀ exp(-a u)
y = y₀ exp(2a u)
B = (r₀/c(b))²
δ = a - κ
θ = θ₀ + ω/(2δ) log(1 + (exp(2δu)-1)/(1+B))
```

The OpenAI construction begins from rest: its theorem states `u(·,0) = 0`, with a smooth compactly supported force initiating the motion. The 32-second display window begins shortly after that mathematical endpoint, at the first visible filaments, rather than holding on a completely empty frame. Its first phase introduces more filaments before reaching the populated composition of the source illustration. This formation prelude represents the theorem-level story; it does not reconstruct the paper’s actual force or early-time velocity profile.

Each trail is released once, grows from a point, moves along its recorded trajectory, and tapers out as it exits. A fresh trail is then released near the inlet. This reseeding keeps the later illustration populated; trails are not connected across a reset. The injection region narrows radially faster than axially. Tube thickness and birth/exit tapers are display glyphs, not a volume-accurate fluid surface. In unsteady flow this moving history curve is technically a pathline trail rather than an instantaneous streamline; “streamline” remains the simpler interface label.

Later trails remain visible farther along the upper and lower axial outflow, making the displayed paths grow taller. Release times and lifetimes are precomputed so extending their visibility never changes a particle's trajectory or tip velocity. This growing observation window illustrates material outflow, not growth of the paper's intense core: both of that core's characteristic lengths shrink, with its radius shrinking faster than its height. The camera remains fixed during playback so the visible elongation can be compared directly.

A deterministic clock maps the 32-second timeline to field time, so seeking restores exactly the same geometry. The display starts 20% into the longer model history, when a small number of blue filaments first become visible. The fixed teal → cyan → blue → ochre → orange palette uses local angular velocity at each material point. This model remains smooth throughout the animation and does **not** reproduce the paper's small-h similarity law or a singularity.

The oscillatory corrections, forcing, pressure, viscosity dynamics, energy estimates, and proof verification are outside this visualization's scope. No quantitative physical measurements are claimed.

## Verification

```sh
npx playwright install chromium
npm test
npm run build
```

Field checks compare trajectory derivatives to the velocity field and verify incompressibility, inward motion, axial stretching, and differential rotation. Browser checks track the rendered centerline coordinates and changing vertex buffers, plus playback, deterministic scrubbing, replay, camera reset, image download, the About dialog, reduced motion, and mobile layout.
