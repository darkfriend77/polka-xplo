# Polka-Xplo Style Guide

> Comprehensive reference for reproducing the exact look, feel, and interaction patterns of the Polka-Xplo block explorer UI. Any alternative frontend can adopt this guide to achieve visual parity.

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Layout & Spacing](#layout--spacing)
5. [Component Catalog](#component-catalog)
6. [Interaction Patterns](#interaction-patterns)
7. [Responsive Breakpoints](#responsive-breakpoints)
8. [Animation & Transitions](#animation--transitions)
9. [Icons](#icons)
10. [Charts & Data Visualization](#charts--data-visualization)
11. [Theming & Customization](#theming--customization)
12. [CSS Custom Properties](#css-custom-properties)
13. [Accessibility](#accessibility)
14. [Quick-Start CSS Snippet](#quick-start-css-snippet)

---

## Design Philosophy

- **Dark-first**: The entire UI uses a dark zinc-based palette. There is no light mode.
- **Minimal chrome**: Borders are subtle (`border-zinc-800`), backgrounds use transparency and blur for depth.
- **Data-dense**: Tables, stats bars, and cards prioritize information density with compact spacing.
- **Polkadot ecosystem aesthetic**: Accent colors, identicons, and color coding align with Polkadot branding conventions.

---

## Color System

### Base Palette (Zinc Scale — Tailwind CSS)

| Token | Hex | Usage |
|-------|-----|-------|
| `zinc-950` | `#09090b` | Page background (`body`) |
| `zinc-900` | `#18181b` | Card & surface backgrounds, input backgrounds |
| `zinc-800` | `#27272a` | Borders, dividers, skeleton shimmer, button backgrounds |
| `zinc-700` | `#3f3f46` | Secondary borders (inputs, separators), scrollbar thumb |
| `zinc-600` | `#52525b` | Placeholder dash/em-dash, subtle icons |
| `zinc-500` | `#71717a` | Secondary text (labels, timestamps, metadata) |
| `zinc-400` | `#a1a1aa` | Tertiary text (nav links, table data) |
| `zinc-300` | `#d4d4d8` | Standard body text in tables |
| `zinc-200` | `#e4e4e7` | Hover-state text, input text, emphasized data |
| `zinc-100` | `#f4f4f5` | Primary text (headings, values, active elements) |

### CSS Custom Properties

```css
:root {
  --color-bg:      #09090b;   /* Page background */
  --color-surface: #18181b;   /* Card / panel backgrounds */
  --color-border:  #27272a;   /* Default border color */
  --color-accent:  #e6007a;   /* Dynamic — set per-chain */
}
```

The `--color-accent` variable is injected on the `<html>` element via `style` attribute from the chain's theme configuration. All accent-colored elements reference `var(--color-accent)`.

### Accent Color

The accent color is **chain-specific** and defaults to Polkadot Pink `#E6007A`. It is used for:

- Clickable links to blocks, extrinsics, accounts
- Active tab underlines
- Active pagination buttons (at 20% opacity background)
- Focus rings on inputs (`focus:border-accent/50 focus:ring-1 focus:ring-accent/30`)
- Chain badge text and border
- Token indicator dot
- Chart emphasis elements

**Usage patterns for accent with opacity:**
| Pattern | Example |
|---------|---------|
| Full accent | Link text, tab active border |
| `accent/50` | Focus border color |
| `accent/30` | Focus ring |
| `accent/20` | Active pagination bg, chain badge bg |
| `accent/10` | Chain badge background tint |
| `{accent}40` | Chain badge border (hex + alpha suffix) |
| `{accent}18` | Banner gradient start opacity |

### Polkadot Brand Colors

```
polkadot-pink:   #E6007A
polkadot-purple: #6D3AEE
polkadot-cyan:   #00B2FF
polkadot-green:  #56F39A
polkadot-lime:   #D3FF33
```

### Semantic Badge Colors

| Badge Variant | Background | Text | Border |
|---------------|-----------|------|--------|
| **Success** (finalized) | `bg-green-950` | `text-green-400` | `border-green-800/50` |
| **Error** | `bg-red-950` | `text-red-400` | `border-red-800/50` |
| **Info** | `bg-blue-950` | `text-blue-400` | `border-blue-800/50` |
| **Warning** (best/pending) | `bg-yellow-950` | `text-yellow-400` | `border-yellow-800/50` |
| **Neutral** | `bg-zinc-800/40` | `text-zinc-400` | `border-zinc-700/40` |
| **Purple** | `bg-purple-950` | `text-purple-400` | `border-purple-800/50` |

### Balance Display Colors

| Balance Type | Text Color |
|-------------|-----------|
| Transferable | `text-polkadot-green` (`#56F39A`) |
| Free | `text-zinc-100` |
| Reserved | `text-yellow-400` |
| Frozen | `text-blue-400` |

---

## Typography

### Font Families

```css
/* Primary body text */
font-family: system default (Tailwind sans — Inter, system-ui, sans-serif);

/* Monospace — hashes, addresses, block numbers, balances, code */
font-family: "JetBrains Mono", "Fira Code", monospace;
```

### Font Sizes & Weights

| Element | Size | Weight | Color | Extra |
|---------|------|--------|-------|-------|
| **Page heading** (h2) | `text-lg` (18px) | `font-semibold` (600) | `zinc-100` | — |
| **Section heading** (h3) | `text-sm` (14px) | `font-semibold` (600) | `zinc-400` | `uppercase tracking-wide` |
| **Mobile nav section title** | `text-xs` (12px) | `font-semibold` (600) | `zinc-500` | `uppercase tracking-wider` |
| **Body text** | `text-sm` (14px) | normal (400) | `zinc-300` – `zinc-100` | — |
| **Table header** | `text-xs` (12px) | normal | `zinc-500` | `text-left` |
| **Table cell** | `text-sm` (14px) or `text-xs` (12px) | normal | `zinc-300` – `zinc-400` | — |
| **Table cell (mono)** | `text-xs` (12px) | normal | `zinc-400` | `font-mono` |
| **Stat label** | `text-[11px]` (11px) | normal | `zinc-500` | `leading-tight truncate` |
| **Stat value** | `text-sm` (14px) | `font-semibold` (600) | `zinc-100` | `tabular-nums` |
| **Badge** | `text-xs` (12px) | `font-medium` (500) | per-variant | — |
| **Footer** | `text-xs` (12px) | normal | `zinc-500` | — |
| **Chain name in header** | `text-base` (16px) | `font-bold` (700) | `text-accent` | — |
| **Search input** | `text-sm` (14px) | normal | `zinc-100` | `placeholder-zinc-500` |
| **Nav link** | `text-sm` (14px) | normal | `zinc-400` | hover → `zinc-100` |
| **Dropdown menu item** | `text-sm` (14px) | normal | `zinc-400` | hover → `zinc-100` |
| **"View All" link** | `text-xs` (12px) | normal | `accent` | `hover:underline` |
| **Spec version value** | `text-xs` (12px) | `font-semibold` (600) | `accent` | `font-mono` |
| **JSON/code** | `text-xs` (12px) | normal | `zinc-300` | `font-mono whitespace-pre-wrap` |
| **Chart axis tick** | `11px` | normal | `#71717a` (zinc-500) | — |
| **Tooltip** | `12px` | normal | — | — |
| **Go-to-page label** | `text-xs` (12px) | normal | `zinc-500` | — |

### Text Rendering

```css
body {
  -webkit-font-smoothing: antialiased;  /* Tailwind: antialiased */
  -moz-osx-font-smoothing: grayscale;
}
```

### Number Formatting

- Thousand separators use **apostrophe** (`'`) not comma: e.g. `1'234'567`
- Balances show up to 4 decimal places, trailing zeros stripped
- `tabular-nums` on all numeric stat values for aligned columns
- Block numbers prefixed with `#`: `#1'234'567`

---

## Layout & Spacing

### Page Container

```
max-width: max-w-7xl (80rem / 1280px)
horizontal padding: px-4 (1rem)
vertical padding: py-6 (1.5rem)
centered: mx-auto
flex layout: min-h-screen flex flex-col (header, main flex-1, footer)
```

### Spacing Scale (used consistently)

| Token | Value | Common Usage |
|-------|-------|-------------|
| `gap-1` | 4px | Tab button gaps, nav button gaps |
| `gap-2` | 8px | Icon + text, inline element spacing |
| `gap-3` | 12px | Card internal, stat item spacing |
| `gap-4` | 16px | Grid gaps, section spacing, card padding |
| `gap-6` | 24px | Major section gaps |
| `py-2.5` | 10px | Table row cell vertical padding |
| `py-3` | 12px | List item vertical padding |
| `px-4` | 16px | Standard horizontal padding |
| `p-4` | 16px | Default card padding |
| `p-5` | 20px | Large card padding (overview, chart) |
| `space-y-6` | 24px | Page section vertical rhythm |
| `mb-3` | 12px | Section heading bottom margin |
| `mb-4` | 16px | Tab bar bottom margin |
| `mb-5` | 20px | Chain data heading bottom margin |

### Grid Layouts

```
/* Stats bar — responsive columns */
grid-cols-2 sm:grid-cols-3 lg:grid-cols-5

/* Home page two-column */
grid-cols-1 lg:grid-cols-2

/* Chain overview */
grid-cols-1 lg:grid-cols-3  (1fr left + 2fr right via lg:col-span-2)

/* Chain data items */
grid-cols-2 md:grid-cols-4

/* Balance display */
grid-cols-2

/* Skeleton stats */
grid-cols-2 md:grid-cols-4
```

---

## Component Catalog

### Card (`.card`)

```css
.card {
  border-radius: 0.5rem;        /* rounded-lg */
  border: 1px solid #27272a;    /* border-zinc-800 */
  background: rgb(24 24 27 / 0.5); /* bg-zinc-900/50 */
  padding: 1rem;                /* p-4 */
}
```

Large cards (overview, chart) use `p-5` (20px padding).

### Badge (`.badge`)

```css
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 0.375rem;     /* rounded-md */
  padding: 0 0.5rem;           /* px-2 */
  padding-top: 0.125rem;       /* py-0.5 */
  padding-bottom: 0.125rem;
  font-size: 0.75rem;          /* text-xs */
  font-weight: 500;            /* font-medium */
}
```

Badges always include a 1px border. See [Semantic Badge Colors](#semantic-badge-colors) for variants.

### Table

```css
/* Table container */
overflow-x: auto;

/* Table element */
width: 100%;
font-size: 0.875rem;           /* text-sm (14px) */

/* Header row */
text-align: left;
font-size: 0.75rem;            /* text-xs (12px) */
color: #71717a;                /* text-zinc-500 */
border-bottom: 1px solid #27272a; /* border-zinc-800 */
padding-bottom: 0.5rem;        /* pb-2 */

/* Body rows (.table-row) */
border-bottom: 1px solid rgb(39 39 42 / 0.5); /* border-zinc-800/50 */
transition: background-color 150ms;
/* hover: */
background-color: rgb(39 39 42 / 0.3); /* hover:bg-zinc-800/30 */

/* Table cells */
padding: 0.625rem 1rem 0.625rem 0; /* py-2.5 pr-4 */
/* Last column: no right padding */
```

### Search Bar (Header)

```css
/* Container */
flex: 1;
max-width: 42rem;              /* max-w-2xl */

/* Input */
width: 100%;
border-radius: 0.5rem;         /* rounded-lg */
border: 1px solid rgb(63 63 70 / 0.6); /* border-zinc-700/60 */
background: rgb(24 24 27 / 0.8); /* bg-zinc-900/80 */
padding: 0.375rem 2.25rem 0.375rem 0.75rem; /* pl-3 pr-9 py-1.5 */
font-size: 0.875rem;           /* text-sm */
color: #f4f4f5;                /* text-zinc-100 */

/* Placeholder */
color: #71717a;                /* placeholder-zinc-500 */

/* Focus */
border-color: accent/50;
box-shadow: 0 0 0 1px accent/30;  /* ring-1 ring-accent/30 */
outline: none;
transition: border-color 150ms, box-shadow 150ms;
```

### Omni-Search (Full-width)

```css
/* Input */
width: 100%;
border-radius: 0.5rem;
border: 1px solid #3f3f46;     /* border-zinc-700 */
background: #18181b;           /* bg-zinc-900 */
padding: 0.75rem 1rem;         /* px-4 py-3 */
font-size: 0.875rem;

/* Focus */
border-color: accent/50;
box-shadow: 0 0 0 2px accent/20; /* ring-2 ring-accent/20 */

/* Results dropdown */
border-radius: 0.5rem;
border: 1px solid #3f3f46;
background: #18181b;
box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); /* shadow-xl */
z-index: 50;
```

### Tabs

```css
/* Tab bar */
display: flex;
gap: 0.25rem;                  /* gap-1 */
border-bottom: 1px solid #27272a;

/* Tab button */
padding: 0.625rem 1rem;        /* px-4 py-2.5 */
font-size: 0.875rem;           /* text-sm */
font-weight: 500;              /* font-medium */
border-bottom: 2px solid transparent;
margin-bottom: -1px;           /* -mb-px (overlap container border) */
transition: color 150ms;

/* Active tab */
color: #f4f4f5;                /* zinc-100 */
border-bottom-color: var(--color-accent);

/* Inactive tab */
color: #71717a;                /* zinc-500 */
/* hover: color: #d4d4d8 (zinc-300) */

/* Tab count badge */
display: inline-flex;
align-items: center;
justify-content: center;
min-width: 20px;
height: 20px;
padding: 0 6px;
border-radius: 9999px;         /* rounded-full */
font-size: 0.75rem;
font-weight: 500;

/* Active count: bg-zinc-700 text-zinc-200 */
/* Inactive count: bg-zinc-800 text-zinc-500 */
```

### Pagination

```css
/* Nav button (First, Prev, Next, Last) */
padding: 0.375rem 0.625rem;    /* px-2.5 py-1.5 */
border-radius: 0.25rem;        /* rounded */
background: #27272a;           /* bg-zinc-800 */
color: #a1a1aa;                /* text-zinc-400 */
transition: background-color 150ms, color 150ms;
/* hover: bg-zinc-700 text-zinc-200 */

/* Page number button */
min-width: 2.25rem;
text-align: center;
padding: 0.375rem 0.5rem;      /* px-2 py-1.5 */
border-radius: 0.25rem;

/* Active page */
background: accent/20;
color: var(--color-accent);
font-weight: 600;

/* Inactive page */
background: #27272a;
color: #a1a1aa;
/* hover: bg-zinc-700 text-zinc-200 */

/* Ellipsis */
padding: 0.375rem;
color: #52525b;                /* text-zinc-600 */
user-select: none;

/* Go-to-page input */
width: 5rem;                   /* w-20 */
padding: 0.25rem 0.5rem;
border-radius: 0.25rem;
background: #27272a;
border: 1px solid #3f3f46;
color: #e4e4e7;
text-align: center;
font-size: 0.75rem;
/* Focus: border-accent/50 */
/* Hide spinner: appearance: textfield */
```

### Navigation Dropdown

```css
/* Dropdown container (desktop) */
position: absolute;
top: 100%;
margin-top: 0.5rem;
width: 11rem;                  /* w-44 */
border-radius: 0.5rem;
border: 1px solid rgb(63 63 70 / 0.5); /* border-zinc-700/50 */
background: #18181b;           /* bg-zinc-900 */
box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);
padding: 0.25rem 0;
z-index: 50;

/* Dropdown item */
display: block;
padding: 0.5rem 1rem;          /* px-4 py-2 */
font-size: 0.875rem;
color: #a1a1aa;                /* text-zinc-400 */
transition: color 150ms, background-color 150ms;
/* hover & focus: text-zinc-100, bg-zinc-800/60 */
```

### Mobile Slide-Out Menu

```css
/* Backdrop */
position: fixed;
inset: 0;
background: rgba(0, 0, 0, 0.6);
z-index: 40;

/* Panel */
position: fixed;
top: 0;
right: 0;
height: 100%;
width: 18rem;                  /* w-72 */
background: #18181b;           /* bg-zinc-900 */
border-left: 1px solid #27272a;
z-index: 50;
overflow-y: auto;

/* Panel header */
padding: 1rem;
border-bottom: 1px solid #27272a;

/* Nav item */
padding: 0.625rem 1rem;        /* px-4 py-2.5 */
font-size: 0.875rem;
color: #d4d4d8;                /* text-zinc-300 */
/* hover: text-zinc-100, bg-zinc-800/60 */
```

### Skeleton / Shimmer

```css
/* Bar shimmer */
animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
border-radius: 0.25rem;        /* rounded */
background: #27272a;           /* bg-zinc-800 */
```

Standard skeleton sizes:
- Title: `h-7 w-48`
- Subtitle: `h-4 w-32`
- Back link: `h-3 w-20`
- Table header cell: `h-3 flex-1`
- Table body cell: `h-4 flex-1`

### Loading Spinner

```css
width: 1rem;
height: 1rem;
border: 2px solid #52525b;     /* border-zinc-600 */
border-top-color: var(--color-accent);
border-radius: 9999px;
animation: spin 1s linear infinite;
```

### JSON / Code Viewer

```css
/* Container */
border-radius: 0.375rem;       /* rounded-md */
background: #18181b;           /* bg-zinc-900 */
border: 1px solid #27272a;     /* border-zinc-800 */
overflow: hidden;

/* Code content */
padding: 0.75rem;              /* p-3 */
font-size: 0.75rem;            /* text-xs */
color: #d4d4d8;                /* text-zinc-300 */
font-family: "JetBrains Mono", "Fira Code", monospace;
overflow-x: auto;
white-space: pre-wrap;

/* Expand/collapse toggle */
width: 100%;
padding: 0.375rem;             /* py-1.5 */
font-size: 0.75rem;
color: #71717a;                /* text-zinc-500 */
border-top: 1px solid #27272a;
/* hover: text-zinc-300 */
```

### Token Badge (Header)

```css
display: inline-flex;
align-items: center;
gap: 0.375rem;                 /* gap-1.5 */
border-radius: 0.375rem;
border: 1px solid rgb(63 63 70 / 0.5); /* border-zinc-700/50 */
background: rgb(39 39 42 / 0.6); /* bg-zinc-800/60 */
padding: 0.25rem 0.625rem;     /* px-2.5 py-1 */
font-size: 0.75rem;
font-weight: 500;
color: #e4e4e7;                /* text-zinc-200 */

/* Colored dot */
width: 0.5rem;
height: 0.5rem;
border-radius: 9999px;
background-color: var(--color-accent);
```

### Chain Badge

```css
display: inline-flex;
align-items: center;
gap: 0.375rem;
border-radius: 0.375rem;
padding: 0 0.5rem;             /* px-2 py-0.5 */
font-size: 0.75rem;
font-weight: 500;
border-color: {accentColor}40;  /* 25% opacity */
color: {accentColor};
background-color: {accentColor}10; /* 6% opacity */
```

### Brand Logo Container (Header)

```css
display: flex;
align-items: center;
gap: 0.5rem;
padding: 0.375rem 0.75rem;     /* px-3 py-1.5 */
border-radius: 0.5rem;
background: rgba(255, 255, 255, 0.1); /* bg-white/10 */
border: 1px solid rgba(255, 255, 255, 0.1);
transition: background-color 150ms;
cursor: pointer;
/* hover: bg-white/20 */
```

### Error / Warning Banner

```css
border-radius: 0.5rem;
border: 1px solid rgb(133 77 14 / 0.5); /* border-yellow-800/50 */
background: rgb(69 26 3 / 0.3); /* bg-yellow-950/30 */
padding: 0.75rem;
font-size: 0.875rem;
color: #fde047;                /* text-yellow-300 */
```

### Oversized Data Marker

```css
/* Badge inside code viewer */
display: inline-flex;
align-items: center;
border-radius: 0.25rem;
background: rgb(120 53 15 / 0.4); /* bg-amber-900/40 */
padding: 0 0.5rem;
color: #fbbf24;                /* text-amber-400 */
font-weight: 500;
```

### Block Icon (List Card)

```css
display: flex;
align-items: center;
justify-content: center;
width: 2.5rem;                 /* w-10 */
height: 2.5rem;                /* h-10 */
border-radius: 0.5rem;
background: rgb(39 39 42 / 0.6); /* bg-zinc-800/60 */
flex-shrink: 0;
```

### Stat Icon (Stats Bar)

```css
display: flex;
align-items: center;
justify-content: center;
width: 2.25rem;                /* w-9 */
height: 2.25rem;               /* h-9 */
border-radius: 0.5rem;
background: #27272a;           /* bg-zinc-800 */
```

### Identicon (Account Avatar)

```css
/* Uses @polkadot/react-identicon with theme="polkadot" */
/* Default size: 40×40px */
/* Loading placeholder: */
border-radius: 9999px;
background: #3f3f46;           /* bg-zinc-700 */
animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
```

---

## Interaction Patterns

### Links

| Context | Style |
|---------|-------|
| Block/extrinsic/account links | `text-accent hover:underline font-mono` |
| "View All" links | `text-xs text-accent hover:underline` |
| Nav links (desktop) | `text-zinc-400 hover:text-zinc-100 transition-colors` |
| Footer links | `text-zinc-500 hover:text-zinc-200 transition-colors` |
| Social links | `text-zinc-500 hover:text-zinc-300 transition-colors` |

### Buttons

| Type | Style |
|------|-------|
| Period selector (active) | `bg-zinc-700 text-zinc-100 rounded-md` |
| Period selector (inactive) | `text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50` |
| Metric toggle (active) | `bg-zinc-800 text-zinc-200 ring-1 ring-zinc-700 rounded-md` |
| Metric toggle (inactive) | `text-zinc-500 hover:text-zinc-400` |
| Pagination button | `bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded` |
| Go button | `bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded` |
| Hamburger (mobile) | `text-zinc-400 hover:text-zinc-100` |

### Focus States

All interactive elements use:
```css
outline: none;
/* For inputs: */
border-color: accent/50;
box-shadow: 0 0 0 1px accent/30;
```

Dropdown items use:
```css
/* focus: bg-zinc-800/60 text-zinc-100 outline-none */
```

### Hover States

| Element | Hover Effect |
|---------|-------------|
| Table row | `bg-zinc-800/30` (subtle highlight) |
| Nav link | `text-zinc-100` |
| Dropdown item | `bg-zinc-800/60 text-zinc-100` |
| Pagination button | `bg-zinc-700 text-zinc-200` |
| List item | `bg-zinc-800/30` |
| Search result | `bg-zinc-800` |

### Keyboard Navigation

- **Escape**: Close dropdowns, mobile menu
- **ArrowDown/ArrowUp**: Navigate dropdown items
- **Home/End**: Jump to first/last dropdown item
- **Enter/Space**: Open dropdown
- Body scroll is **locked** when mobile menu is open (`overflow: hidden`)

### Address Display

- Hex public keys are converted to SS58 format using the current address prefix
- Truncation: first 6 + `...` + last 6 characters
- When linked: `text-accent hover:underline font-mono`

---

## Responsive Breakpoints

Using Tailwind's default breakpoints:

| Breakpoint | Min Width | Usage |
|-----------|-----------|-------|
| `sm` | 640px | Show desktop nav, hide hamburger |
| `md` | 768px | 4-column grids |
| `lg` | 1024px | 2-column and 3-column layouts, 5-column stats |

### Navigation

- **< 640px (mobile)**: Hamburger icon → slide-out panel from right
- **≥ 640px (desktop)**: Horizontal nav bar with dropdowns

### Grid Adaptations

```
/* Stats bar */
< 640px:  2 columns
640-1023: 3 columns
≥ 1024:   5 columns

/* Home sections */
< 1024:   Single column, stacked
≥ 1024:   Two columns side by side

/* Chain overview */
< 1024:   Full width, stacked
≥ 1024:   1/3 + 2/3 split

/* Chain data items */
< 768:    2 columns
≥ 768:    4 columns
```

---

## Animation & Transitions

### Transition Defaults

```css
transition-property: color, background-color, border-color;
transition-duration: 150ms;
transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); /* Tailwind: ease-out */
```

All interactive elements use `transition-colors` (150ms).

### Animations

| Animation | Usage | CSS |
|-----------|-------|-----|
| `animate-pulse` | Skeleton loading | `2s cubic-bezier(0.4, 0, 0.6, 1) infinite` — opacity breathe |
| `animate-spin` | Loading spinner | `1s linear infinite` — 360° rotation |
| Chevron rotate | Dropdown trigger | `transition-transform` on `rotate-180` class toggle |

### Area Chart Gradients

```css
/* Each metric has a vertical linear gradient fill: */
stop offset="5%"  → stopColor={metricColor} stopOpacity=0.3
stop offset="95%" → stopColor={metricColor} stopOpacity=0
```

---

## Icons

All icons are inline SVGs with consistent properties:

### Standard Icon Size & Style

```css
/* Navigation / UI icons */
width: 20px;  height: 20px;
viewBox: "0 0 24 24";
fill: none;
stroke: currentColor;
stroke-width: 1.5;
stroke-linecap: round;
stroke-linejoin: round;

/* Stats bar / chain data icons */
width: 18-20px; height: 18-20px;
color: text-zinc-500;  /* Stats bar */
color: text-accent;    /* Chain data */

/* Social icons */
width: 16px; height: 16px;
fill: currentColor;

/* Small indicators (checkmark) */
width: 14px; height: 14px;
color: text-green-500;

/* Hamburger / close */
width: 20px; height: 20px;
stroke-width: 2;
```

### Dropdown Chevron

```css
width: 14px; height: 14px;     /* w-3.5 h-3.5 */
stroke-width: 2;
/* Rotates 180° when open */
transition: transform 150ms;
```

---

## Charts & Data Visualization

Uses **Recharts** library (React). Key styling tokens:

### Area Chart

```
Background: card component (bg-zinc-900/50 border-zinc-800)
Chart height: 280px
Margin: { top: 4, right: 8, left: 0, bottom: 0 }

Grid: strokeDasharray="3 3", stroke="#27272a", vertical=false

X-Axis:
  tick: { fontSize: 11, fill: "#71717a" }
  axisLine: { stroke: "#27272a" }
  tickLine: false
  minTickGap: 40

Y-Axis:
  tick: { fontSize: 11, fill: "#71717a" }
  axisLine: false
  tickLine: false
  width: 48

Tooltip:
  backgroundColor: "#18181b"
  border: "1px solid #3f3f46"
  borderRadius: "8px"
  fontSize: "12px"
  boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
  labelStyle: { color: "#a1a1aa", marginBottom: "4px" }

Area:
  strokeWidth: 2
  dot: false
  activeDot: { r: 4, strokeWidth: 0 }
```

### Metric Colors

| Metric | Color |
|--------|-------|
| Extrinsics | `#6366f1` (indigo) |
| Transfers | `#22d3ee` (cyan) |
| Events | `#a78bfa` (violet) |
| Blocks | `#4ade80` (green) |

---

## Theming & Customization

The UI supports per-chain theming via a `ThemeConfig` object:

```typescript
interface ThemeConfig {
  chainId: string;           // e.g. "polkadot", "kusama", "ajuna"
  name: string;              // Display name in header and titles
  accentColor: string;       // Primary accent hex (e.g. "#E6007A")
  logo: string | null;       // Path to chain logo (shown in header + overview)
  banner: string | null;     // Background image behind header
  brand: string | null;      // Full wordmark (replaces logo + name)
  tokenSymbol: string;       // e.g. "DOT", "KSM"
  tokenDecimals: number;     // e.g. 10, 12
  addressPrefix: number;     // SS58 prefix (e.g. 0, 2, 42)
  socialLinks: {
    website?: string;
    twitter?: string;
    discord?: string;
    telegram?: string;
    github?: string;
  };
  isParachain: boolean;
  relayChain: string | null; // "polkadot" | "kusama" | null
}
```

The accent color is injected as a CSS custom property on the `<html>` element:
```html
<html style="--color-accent: #E6007A">
```

### Header Banner

If a `banner` image is provided, it is rendered as an absolutely-positioned `object-cover` image behind the header, with a semi-transparent overlay (`bg-zinc-950/60`) for text readability.

If no banner is provided, a gradient fallback is rendered:
```css
background: linear-gradient(180deg, {accentColor}18 0%, transparent 100%);
```

---

## CSS Custom Properties

Complete list of CSS variables used:

```css
:root {
  --color-bg: #09090b;
  --color-surface: #18181b;
  --color-border: #27272a;
  --color-accent: #e6007a;    /* Overridden per chain */
}
```

In Tailwind config, `accent` maps to `var(--color-accent)`, enabling usage like:
```
text-accent
border-accent/50
bg-accent/20
focus:ring-accent/30
```

---

## Accessibility

- All interactive dropdowns use `aria-haspopup`, `aria-expanded`
- Dropdown menus use `role="menu"`, items use `role="menuitem"`
- Mobile menu uses `role="navigation"` and `aria-label="Mobile navigation"`
- Buttons include `aria-label` for icon-only controls (search, hamburger, close)
- Banner backgrounds use `aria-hidden="true"` and `pointer-events: none`
- Focus management: dropdown focus moves to first item on open; Escape returns focus to trigger
- Body scroll lock on mobile menu open prevents background scroll
- Tab indices managed for keyboard navigation through dropdown items

---

## Scrollbar Styling

```css
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: #18181b;        /* bg-zinc-900 */
}
::-webkit-scrollbar-thumb {
  background: #3f3f46;        /* bg-zinc-700 */
  border-radius: 9999px;      /* rounded-full */
}
```

---

## Quick-Start CSS Snippet

Minimal CSS to bootstrap the same visual foundation without Tailwind:

```css
/* ── Polka-Xplo Base Theme ── */

:root {
  --color-bg: #09090b;
  --color-surface: #18181b;
  --color-border: #27272a;
  --color-accent: #e6007a;
  --color-text-primary: #f4f4f5;
  --color-text-secondary: #a1a1aa;
  --color-text-muted: #71717a;
  --color-text-dim: #52525b;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: var(--color-bg);
  color: var(--color-text-primary);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  min-height: 100vh;
}

/* Card */
.card {
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  background: rgb(24 24 27 / 0.5);
  padding: 1rem;
}

/* Badge */
.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 0.375rem;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.badge-success { background: #052e16; color: #4ade80; border: 1px solid rgb(22 101 52 / 0.5); }
.badge-error   { background: #450a0a; color: #f87171; border: 1px solid rgb(153 27 27 / 0.5); }
.badge-info    { background: #172554; color: #60a5fa; border: 1px solid rgb(30 64 175 / 0.5); }
.badge-warning { background: #422006; color: #facc15; border: 1px solid rgb(133 77 14 / 0.5); }
.badge-neutral { background: rgb(39 39 42 / 0.4); color: #a1a1aa; border: 1px solid rgb(63 63 70 / 0.4); }
.badge-purple  { background: #3b0764; color: #c084fc; border: 1px solid rgb(107 33 168 / 0.5); }

/* Table row hover */
.table-row {
  border-bottom: 1px solid rgb(39 39 42 / 0.5);
  transition: background-color 150ms;
}
.table-row:hover {
  background-color: rgb(39 39 42 / 0.3);
}

/* Accent link */
.accent-link {
  color: var(--color-accent);
  text-decoration: none;
  font-family: var(--font-mono);
}
.accent-link:hover {
  text-decoration: underline;
}

/* Focus ring */
input:focus,
select:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--color-accent) 50%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 30%, transparent);
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--color-surface); }
::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 9999px; }

/* Skeleton animation */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.skeleton {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  background: var(--color-border);
  border-radius: 0.25rem;
}
```

---

## Summary of Key Design Tokens

| Token | Value |
|-------|-------|
| Page max-width | `1280px` |
| Card border-radius | `8px` |
| Badge border-radius | `6px` |
| Button border-radius | `4px` (pagination) / `6px` (toggles) |
| Input border-radius | `8px` |
| Dropdown border-radius | `8px` |
| Default transition | `150ms ease-out` |
| Font size — body | `14px` |
| Font size — small | `12px` |
| Font size — tiny | `11px` |
| Font size — heading | `18px` |
| Font weight — heading | `600` |
| Font weight — badge | `500` |
| Font weight — bold | `700` |
| Icon stroke width | `1.5` (UI) / `2` (nav) |
| Spacing unit | `4px` (Tailwind's default) |
