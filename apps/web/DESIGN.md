---
name: PagerWho operations UI
description: "A dark, information-dense incident response workspace with restrained blue interaction signals, semantic status colors, and reusable operational surfaces."
colors:
  canvas-dark: "#090909"
  canvas-raised-dark: "#101010"
  surface-1-dark: "#141414"
  surface-2-dark: "#1c1c1c"
  surface-3-dark: "#242424"
  hairline-dark: "#262626"
  hairline-soft-dark: "#1a1a1a"
  ink-dark: "#ffffff"
  ink-muted-dark: "#999999"
  ink-subtle-dark: "#707070"
  accent-dark: "#0099ff"
  danger-dark: "#ff5577"
  warning-dark: "#ffb020"
  orange-dark: "#ff7a3d"
  success-dark: "#22c55e"
  canvas-light: "#f6f7fb"
  canvas-raised-light: "#ffffff"
  surface-1-light: "#ffffff"
  surface-2-light: "#edf1f7"
  surface-3-light: "#dfe5ee"
  hairline-light: "#d5dce8"
  hairline-soft-light: "#e6ebf3"
  ink-light: "#111827"
  ink-muted-light: "#5e6878"
  ink-subtle-light: "#8a94a3"
  accent-light: "#0077cc"
  danger-light: "#d92d50"
  warning-light: "#b77900"
  orange-light: "#d45f17"
  success-light: "#168a43"
typography:
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0"
  body-sm:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
    letterSpacing: "0"
  heading:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(26px, 3vw, 34px)"
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  section-heading:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "0.04em"
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "9999px"
spacing:
  hair: "1px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "30px"
components:
  button-primary:
    backgroundColor: "{colors.ink-dark}"
    textColor: "{colors.canvas-dark}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "0 15px"
  button-secondary:
    backgroundColor: "{colors.surface-2-dark}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "0 15px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted-dark}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
  panel:
    backgroundColor: "{colors.surface-1-dark}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "16px"
  status-badge:
    backgroundColor: "{colors.surface-2-dark}"
    textColor: "{colors.ink-muted-dark}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
  text-input:
    backgroundColor: "{colors.surface-1-dark}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
---

## Overview

PagerWho is an operational web interface for incident response. Its visual language is a dark, compact workspace built for scanning state quickly: near-black canvas, slightly lifted surfaces, thin borders, restrained blue interaction signals, and semantic colors reserved for status and severity. A light theme is also implemented through the same token roles, so components should consume semantic variables rather than hard-coded theme-specific values.

**The Operational Clarity Rule.** Every surface should make current state, next action, and supporting context distinguishable without decorative noise.

**The Surface Ladder Rule.** Use canvas, raised canvas, surface 1, and surface 2 as progressive layers; do not add arbitrary panel colors when an existing layer communicates the hierarchy.

## Colors

The source of truth is `src/shared/styles/globals.css` under the Tailwind `@theme` block and the light/dark root theme selectors. Dark mode is the default. Light mode maps the same roles to light values.

### Role-based palette

- **Canvas:** `#090909` dark / `#f6f7fb` light. Page background and large empty areas.
- **Raised canvas:** `#101010` dark / `#ffffff` light. Floating and modal surfaces.
- **Surface 1:** `#141414` dark / `#ffffff` light. Primary panels, inputs, and cards.
- **Surface 2:** `#1c1c1c` dark / `#edf1f7` light. Selected controls and secondary panels.
- **Ink:** `#ffffff` dark / `#111827` light. Primary content and headings.
- **Muted/subtle ink:** `#999999`/`#707070` dark and `#5e6878`/`#8a94a3` light. Supporting metadata and labels.
- **Accent:** `#0099ff` dark / `#0077cc` light. Focus, links, selected states, and active workflow signals.
- **Semantic colors:** danger, warning, orange, and success are used for incident and delivery state, not decoration.

**The Signal Color Rule.** Blue and semantic colors communicate interaction or operational state; they should not become general-purpose decoration or large background fills.

## Typography

The application uses the system Inter stack declared as `--font-sans`. Typography is compact and scan-oriented rather than display-oriented.

- Page titles use a responsive 26–34px, 650-weight treatment.
- Section headings use approximately 17px and 650 weight.
- Body text uses 15px with comfortable readable line height.
- Dense metadata and controls use 12–13px.
- Uppercase labels use approximately 10–11px, high weight, and modest tracking.

**The Hierarchy-by-Scale Rule.** Establish hierarchy with size, surface, and placement before adding heavier weights or brighter colors.

## Layout

The authenticated shell is defined in `src/shared/layouts/AppLayout.tsx`. It has a sticky global header, project-scoped navigation and actions, and a centered content container with a maximum width of approximately 1180px. Feature pages use `PageHeader`, `Panel`, tabs, tables, and responsive card alternatives.

- Desktop navigation expands at the wide `xl` breakpoint so the brand, navigation, project selector, and utility actions do not compete at tablet widths.
- Tablet and mobile layouts collapse primary navigation behind a menu while keeping project context and critical action controls available.
- Page layouts use small, consistent gaps and `min-w-0`/overflow handling for long incident names, project names, addresses, and technical identifiers.
- Dense desktop tables should have an intentional mobile card or scroll treatment rather than forcing all columns into a narrow viewport.

## Elevation & Depth

Depth is primarily communicated by surface changes and hairline borders. `Panel` uses a surface background with a thin border; dialogs and floating menus use raised canvas and a restrained shadow. Focus states use the accent outline defined globally in `globals.css`.

Avoid stacking multiple borders, shadows, and translucent backgrounds on the same small control. A selected state should normally use surface 2, ink contrast, or the accent focus ring—not all three at once.

## Shapes

The interface combines rounded pills for primary buttons and status badges with 6–10px corners for inputs, panels, menus, cards, and dense controls. The existing scale is `xs` 4px, `sm` 6px, `md` 8px, `lg` 10px, and `pill` 9999px.

**The Control Shape Rule.** Use pills for actions that behave like actions or statuses; use modest rounded rectangles for containers and fields. Do not make an entire page look like a collection of pills.

## Components

### Button

`src/shared/components/Button.tsx` is the shared action primitive. It provides primary, secondary, ghost, and danger variants, small and medium sizes, loading state, disabled state, and a consistent focus treatment. New actions should reuse it unless native semantics or an existing specialized control require otherwise.

### Panel

`src/shared/components/Panel.tsx` provides primary, secondary, and subtle surface tones plus standardized padding. It is the default container for feature sections and should not be replaced with one-off card styling without a clear reason.

### Badge and status components

`src/shared/components/Badge.tsx` maps service, incident, notification, severity, priority, and escalation states to semantic tones. Status color should remain consistent with these mappings.

### PageHeader and supporting primitives

`PageHeader`, `SectionHeader`, `DescriptionList`, `DataTable`, `Dialog`, `InfoTooltip`, `Skeleton`, `StateBlock`, `TabButton`, and form controls provide the shared page grammar. Prefer composition of these components over duplicating page-level equivalents.

### App shell

`AppLayout` and `ActionCenter` provide global navigation, project context, and operational alerts. These are cross-page surfaces and should remain visually lighter than the response workspace itself.

## Do's and Don'ts

### Do

- Reuse semantic CSS variables and shared components before introducing new tokens.
- Keep English as the default UI language and route user-facing copy through i18n where the surrounding surface already does so.
- Make status, ownership, priority, and next action scannable in incident workflows.
- Preserve visible focus states, Escape behavior, and predictable outside-click dismissal for menus and dialogs.
- Test narrow layouts with long names and technical values.

### Don't

- Do not copy the old Framer-oriented `DESIGN.md` visual language into the product UI.
- Do not add decorative gradients, glow effects, or large color fills to ordinary operational screens.
- Do not create a new button, card, badge, or panel style when a shared primitive already expresses the intent.
- Do not rely on color alone to communicate incident or delivery state.
- Do not put secondary billing or configuration details in the primary navigation if they can live in settings.
- Do not hide failure context, next action, or loading/error state behind ambiguous icon-only controls.
