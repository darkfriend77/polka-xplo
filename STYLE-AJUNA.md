# Ajuna Network — Style Guide

> Chain-specific style reference for the **Ajuna Network** block explorer. This document extends the base [STYLE.md](STYLE.md) with every value that differs from the generic/Polkadot defaults. Anything not mentioned here remains identical to the base guide.

---

## Table of Contents

1. [Chain Identity](#chain-identity)
2. [Accent Color](#accent-color)
3. [CSS Custom Properties](#css-custom-properties)
4. [Brand Assets](#brand-assets)
5. [Header Rendering](#header-rendering)
6. [Token & Address Configuration](#token--address-configuration)
7. [Chain Badge](#chain-badge)
8. [Derived Color Usage](#derived-color-usage)
9. [Social Links](#social-links)
10. [Chain Metadata](#chain-metadata)
11. [Full ThemeConfig Object](#full-themeconfig-object)
12. [Quick-Start Overrides](#quick-start-overrides)

---

## Chain Identity

| Property | Value |
|----------|-------|
| Chain ID | `ajuna` |
| Display Name | **Ajuna Network** |
| Page Title | `Ajuna Network Explorer` |
| Footer Text | `Ajuna Network Explorer — Powered by PAPI` |

---

## Accent Color

The Ajuna accent replaces Polkadot Pink everywhere `--color-accent` is referenced.

| | Polkadot (default) | **Ajuna** |
|---|---|---|
| Accent hex | `#E6007A` | **`#6290AF`** |
| Hue family | Pink / Magenta | Steel Blue |

This single change propagates to **every** accent-dependent element documented in STYLE.md:

- All `text-accent` links (blocks, extrinsics, accounts, "View All")
- Active tab underline (`border-bottom-color`)
- Active pagination button background (`accent/20`)
- Search input focus ring & border
- Token indicator dot
- Chain badge text, border, and background tint
- Spec version value text
- Chain data icons (`text-accent`)
- Header banner gradient fallback
- Loading spinner top border

### Accent with Opacity (Ajuna-specific hex values)

| Pattern | Polkadot | **Ajuna** | Usage |
|---------|----------|-----------|-------|
| Full | `#E6007A` | `#6290AF` | Link text, tab border |
| `/50` | `rgba(230,0,122,0.5)` | `rgba(98,144,175,0.5)` | Focus border |
| `/30` | `rgba(230,0,122,0.3)` | `rgba(98,144,175,0.3)` | Focus ring |
| `/20` | `rgba(230,0,122,0.2)` | `rgba(98,144,175,0.2)` | Active page bg |
| `/10` | `rgba(230,0,122,0.1)` | `rgba(98,144,175,0.1)` | Chain badge bg |
| `{hex}40` | `#E6007A40` | `#6290AF40` | Chain badge border |
| `{hex}18` | `#E6007A18` | `#6290AF18` | Banner gradient start |
| `{hex}10` | `#E6007A10` | `#6290AF10` | Chain badge background |

---

## CSS Custom Properties

Override on the `<html>` element:

```html
<html lang="en" class="dark" style="--color-accent: #6290AF">
```

```css
:root {
  --color-bg:      #09090b;   /* unchanged */
  --color-surface: #18181b;   /* unchanged */
  --color-border:  #27272a;   /* unchanged */
  --color-accent:  #6290AF;   /* ← Ajuna steel blue */
}
```

All other base palette colors (zinc-950 through zinc-100) remain **identical** to STYLE.md.

---

## Brand Assets

| Asset | Path | Usage |
|-------|------|-------|
| Logo | `/logos/ajuna.svg` | Header (24×24 rounded), chain overview (40×40 rounded) |
| Banner | `/banners/ajuna.svg` | Full-bleed background behind header (`object-cover`) |
| Brand wordmark | `/brand/ajuna.svg` | Replaces logo + chain name text in header (140×28, `h-6 w-auto`) |

Since Ajuna provides a **brand wordmark** (`/brand/ajuna.svg`), the header renders:

```
┌────────────────────────────────────────────────────────────┐
│ [ajuna wordmark]    Blockchain ▾  Governance ▾  ...       │
│ [search bar]                                    [AJUN •]  │
└────────────────────────────────────────────────────────────┘
```

Instead of the fallback `[logo] + "Ajuna Network"` text combination.

### Brand Logo Container

The wordmark sits inside the same frosted container as the generic guide:

```css
display: flex;
align-items: center;
gap: 0.5rem;
padding: 0.375rem 0.75rem;     /* px-3 py-1.5 */
border-radius: 0.5rem;
background: rgba(255, 255, 255, 0.1);
border: 1px solid rgba(255, 255, 255, 0.1);
/* hover: background rgba(255, 255, 255, 0.2) */
```

---

## Header Rendering

### Banner Background

Because Ajuna provides a banner image (`/banners/ajuna.svg`), the header uses:

```css
/* Banner image — absolutely positioned behind header */
position: absolute;
inset: 0;
overflow: hidden;
pointer-events: none;

/* Image properties */
object-fit: cover;
object-position: center;

/* Readability overlay on top of the banner */
background: rgb(9 9 11 / 0.6);  /* bg-zinc-950/60 */
```

The gradient fallback (`linear-gradient(180deg, #6290AF18 0%, transparent 100%)`) is **not used** when the banner image is present.

### Header Structure

```
Row 1 (h-12, z-20):
  Left:  [Brand wordmark in frosted container]
  Right: [Nav dropdowns] [Chain badge: "Ajuna Network"] [SS58 prefix selector]

Row 2 (h-11, z-10):
  Left:  [Search bar]
  Right: [Token badge: "• AJUN"]
```

Both rows use `backdrop-blur-md` and sit over the banner + overlay.

---

## Token & Address Configuration

| Property | Value |
|----------|-------|
| Token Symbol | `AJUN` |
| Token Decimals | `12` |
| SS58 Address Prefix | `1328` |

### Impact on UI

- **Token badge** in header displays `AJUN` with the steel blue dot
- **Balance formatting** uses 12 decimals: `formatBalance(raw, 12, "AJUN")`
  - Example: `1'000.0001 AJUN`
- **Existential deposit** label shows `… AJUN`
- **Transfers table** amount column: `formatBalance(amount, 12, "AJUN")`
- **Address display** encodes hex public keys with SS58 prefix `1328`
  - Ajuna addresses start with `a` (SS58 prefix 1328 produces addresses beginning with lowercase `a`)

---

## Chain Badge

The chain badge in the navigation bar renders with Ajuna's accent:

```css
display: inline-flex;
align-items: center;
gap: 0.375rem;
border-radius: 0.375rem;
padding: 0 0.5rem;
font-size: 0.75rem;
font-weight: 500;

/* Ajuna-specific computed values: */
color: #6290AF;
border: 1px solid #6290AF40;           /* 25% opacity */
background-color: #6290AF10;           /* 6% opacity */
```

Badge text: **Ajuna Network**

---

## Derived Color Usage

Every component that uses the accent color will display in **steel blue** (`#6290AF`) instead of pink. Here is a summary of the most visible changes:

### Links

```css
/* All block/extrinsic/account links */
color: #6290AF;
/* hover: text-decoration: underline; */
```

### Active Tab

```css
border-bottom: 2px solid #6290AF;
```

### Active Pagination Page

```css
background: rgba(98, 144, 175, 0.2);  /* #6290AF at 20% */
color: #6290AF;
font-weight: 600;
```

### Search Input Focus

```css
border-color: rgba(98, 144, 175, 0.5);
box-shadow: 0 0 0 1px rgba(98, 144, 175, 0.3);
```

### Loading Spinner

```css
border: 2px solid #52525b;
border-top-color: #6290AF;
```

### Chain Data Icons (Overview Panel)

```css
color: #6290AF;  /* was accent pink */
```

### Spec Version Value

```css
color: #6290AF;
font-family: "JetBrains Mono", "Fira Code", monospace;
font-weight: 600;
font-size: 0.75rem;
```

### Token Indicator Dot

```css
width: 0.5rem;
height: 0.5rem;
border-radius: 9999px;
background-color: #6290AF;
```

### Footer Heart Icon

The heart SVG in the footer remains Polkadot pink (`#E6007A`) — this is intentional branding for the "We ♥ Polkadot!" tagline regardless of chain.

---

## Social Links

Ajuna provides a full set of social links rendered in the Chain Overview panel:

| Platform | URL | Icon Style |
|----------|-----|-----------|
| Website | https://ajuna.io | Stroke link icon, 16×16 |
| X (Twitter) | https://x.com/AjunaNetwork | Fill X logo, 16×16 |
| Discord | https://discord.gg/ajuna | Fill Discord logo, 16×16 |
| Telegram | https://t.me/AjunaNetwork | Fill Telegram logo, 16×16 |
| GitHub | https://github.com/AjunaNetwork | Fill GitHub logo, 16×16 |

Icon colors: `text-zinc-500` → hover `text-zinc-300`, with `transition-colors`.

---

## Chain Metadata

Displayed in the Chain Overview panel:

| Field | Value |
|-------|-------|
| Relay Chain | **Polkadot** (capitalized) |
| Is Parachain | Yes |
| Para ID | *(fetched from API at runtime)* |
| Token Symbol | AJUN |
| Token Decimals | 12 |

---

## Full ThemeConfig Object

```typescript
const ajunaTheme: ThemeConfig = {
  chainId: "ajuna",
  name: "Ajuna Network",
  accentColor: "#6290AF",
  logo: "/logos/ajuna.svg",
  banner: "/banners/ajuna.svg",
  brand: "/brand/ajuna.svg",
  tokenSymbol: "AJUN",
  tokenDecimals: 12,
  addressPrefix: 1328,
  socialLinks: {
    website: "https://ajuna.io",
    twitter: "https://x.com/AjunaNetwork",
    discord: "https://discord.gg/ajuna",
    telegram: "https://t.me/AjunaNetwork",
    github: "https://github.com/AjunaNetwork",
  },
  isParachain: true,
  relayChain: "polkadot",
};
```

---

## Quick-Start Overrides

To apply the Ajuna theme on top of the base CSS from STYLE.md, add only these overrides:

```css
/* ── Ajuna Network Theme Overrides ── */

:root {
  --color-accent: #6290AF;
}
```

That single variable change propagates everywhere through the `var(--color-accent)` references already built into the base stylesheet.

For inline-style elements that use the hex value directly (chain badge, banner gradient), use:

```css
/* Chain badge */
.chain-badge {
  color: #6290AF;
  border-color: #6290AF40;
  background-color: #6290AF10;
}

/* Banner gradient fallback (only if no banner image) */
.banner-gradient {
  background: linear-gradient(180deg, #6290AF18 0%, transparent 100%);
}
```

### Comparison: Default vs Ajuna

| Element | Default (Polkadot) | Ajuna |
|---------|-------------------|-------|
| Accent color | `#E6007A` (pink) | `#6290AF` (steel blue) |
| Chain name | Block Explorer | Ajuna Network |
| Token | UNIT / DOT | AJUN |
| Decimals | 12 | 12 |
| Address prefix | 42 | 1328 |
| Logo | none | `/logos/ajuna.svg` |
| Banner | none (gradient) | `/banners/ajuna.svg` |
| Brand | none (text) | `/brand/ajuna.svg` |
| Social links | minimal | full set (5 platforms) |
| Relay chain | — | Polkadot |
| Parachain | No | Yes |

---

*Everything else — the zinc palette, font families, font sizes, spacing, component dimensions, badge variants, table styling, pagination, skeletons, animations, responsiveness, accessibility, scrollbars, chart config, and interaction patterns — is identical to [STYLE.md](STYLE.md).*
