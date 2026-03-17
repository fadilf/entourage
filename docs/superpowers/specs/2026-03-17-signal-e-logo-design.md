# Signal "E" Logo Design

## Overview

Replace the existing pinwheel/diamond PNG logo with a new "Signal E" lettermark — five horizontal bars with staggered lengths forming a stylized "E", suggesting multiple voices/agents. Separate light and dark SVG versions using a teal color palette.

## Logo Mark

The mark is five horizontal bars with pill-shaped ends (`rx="4"`), left-aligned, with staggered widths that form the shape of an uppercase "E":

| Bar | Y offset | Width | Light fill   | Dark fill   |
|-----|----------|-------|-------------|-------------|
| 1   | 20       | 50    | teal-600 `#0d9488` | teal-400 `#2dd4bf` |
| 2   | 34       | 38    | teal-500 `#14b8a6` | teal-300 `#5eead4` |
| 3   | 48       | 46    | teal-600 `#0d9488` | teal-400 `#2dd4bf` |
| 4   | 62       | 32    | teal-500 `#14b8a6` | teal-300 `#5eead4` |
| 5   | 76       | 50    | teal-600 `#0d9488` | teal-400 `#2dd4bf` |

- All bars: height `8`, x-start `25`, border-radius `rx="4"`
- ViewBox: `0 0 100 100`
- Bars 1, 3, 5 (primary tone) are the top, middle, and bottom — forming the three horizontal strokes of the "E"
- Bars 2, 4 (secondary tone) are shorter, creating the staggered rhythm

## Color Palette

| Role            | Token       | Hex       |
|-----------------|-------------|-----------|
| Light primary   | teal-600    | `#0d9488` |
| Light secondary | teal-500    | `#14b8a6` |
| Dark primary    | teal-400    | `#2dd4bf` |
| Dark secondary  | teal-300    | `#5eead4` |

## Visual Reference

```
Bar 1: ██████████████████████████  (w=50, E top)
Bar 2: ████████████████            (w=38)
Bar 3: ████████████████████████    (w=46, E middle)
Bar 4: ██████████████              (w=32)
Bar 5: ██████████████████████████  (w=50, E bottom)
```

## File Deliverables

| File | Purpose |
|------|---------|
| `public/logo-light.svg` | Light mode logo (teal-600/teal-500 on transparent) |
| `public/logo-dark.svg`  | Dark mode logo (teal-400/teal-300 on transparent) |
| `public/icon-192.png`   | PWA icon 192px (generated from light SVG) |
| `public/icon-512.png`   | PWA icon 512px (generated from light SVG) |
| `public/favicon.png`    | 32px PNG fallback for Safari |

The old `public/logo.png` will be removed after the SVGs are in place. PNG icons are generated from the light variant using `sharp` or equivalent.

## Integration Points

### 1. Favicon and metadata (`src/app/layout.tsx`)

Update the `metadata.icons` to reference the new SVG with a PNG fallback for Safari:

```ts
icons: {
  icon: [
    { url: "/logo-light.svg", type: "image/svg+xml" },
    { url: "/favicon.png", type: "image/png", sizes: "32x32" },
  ],
  apple: "/logo-light.svg",
},
```

### 2. ThreadList header (`src/components/ThreadList.tsx`)

Replace the `<img src="/logo.png">` with an inline SVG component or `<img>` that switches between light and dark based on the current theme. Since the app uses `next-themes`, this can be done by reading the resolved theme.

### 3. README.md

Update the logo image reference from `public/logo.png` to `public/logo-light.svg`.

### 4. PWA manifest (`public/manifest.json`)

Replace `icon-192.png` and `icon-512.png` with new PNGs generated from the light SVG variant. Keep the existing manifest structure (separate `any` and `maskable` entries). For maskable icons, add extra padding so the bars stay within the 80% safe zone.

Update `theme_color` from `#7c3aed` (violet) to `#0d9488` (teal-600) for brand consistency.

### 5. Dark mode switching

The logo variant (light vs dark) should follow the app's theme. The simplest approach:
- Create a `Logo` component that reads the theme from `next-themes` and renders the appropriate SVG inline
- Use this component in `ThreadList.tsx` and anywhere else the logo appears
- Note: `next-themes` returns `undefined` on first render to avoid hydration mismatch. The component should default to the light variant and swap on mount, or use CSS `prefers-color-scheme` within the SVG itself for a flash-free experience

## Design Rationale

- **Signal "E" concept**: Five staggered bars suggest multiple agents/voices — aligns with the multi-agent nature of Entourage
- **Teal palette**: Connects to the original logo's teal tones while being a completely fresh mark
- **SVG format**: Scales perfectly at all sizes (16px favicon to 512px PWA icon) without artifacts
- **Light/dark variants**: Same mark, different colorways — maintains brand consistency across themes without complex CSS tricks
