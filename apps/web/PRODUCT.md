# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Incident responders, service owners, and project administrators who need to monitor incidents, coordinate response, and operate notification and automation settings.

## Product Purpose

PagerWho is an incident management workspace for creating, triaging, acknowledging, resolving, and reviewing incidents. It brings incident context, services, responders, notifications, workflows, and operational diagnostics into one project-scoped application.

## Positioning

PagerWho connects service ownership, on-call coverage, escalation policies, and notification delivery in a responder-controlled incident workflow.

## Operating Context

Users work inside a selected project. They move between overview, incidents, services, on-call, escalation, workflows, operations, and project or user settings. The product supports both normal browser use and narrow mobile layouts, with background workers processing notifications, workflows, and operational jobs.

## Capabilities and Constraints

- The frontend is a React 19 and Vite application written in TypeScript.
- Tailwind CSS v4 and shared CSS variables provide the styling foundation.
- Shared UI primitives live under `src/shared/components`; app shell and cross-page surfaces live under `src/shared/layouts`.
- REST APIs are accessed through the shared typed API client and React Query queries.
- The default product language is English; i18n resources also include Korean and Chinese.
- The incident response model includes status, severity, priority, ownership, timeline, notifications, and response actions.
- The interface must remain usable with keyboard interaction and on narrow viewports.

## Brand Commitments

- The product name is PagerWho.
- The existing interface uses a dark operational workspace with restrained blue accent signals and semantic status colors.
- Product UI copy is English by default and should remain concise and action-oriented.

## Evidence on Hand

- `src/app/App.tsx` defines the authenticated route structure.
- `src/shared/layouts/AppLayout.tsx` and `src/shared/layouts/ActionCenter.tsx` define the app shell and global operational surfaces.
- `src/shared/components` contains the reusable Button, Panel, Badge, PageHeader, Dialog, Skeleton, StateBlock, DataTable, and form components.
- Feature pages under `src/features` implement incidents, overview, services, workflows, operations, on-call, projects, and settings.
- `e2e` contains Playwright coverage for incident response, mobile behavior, services, on-call, and operations.
- No customer testimonials, external proof claims, or marketing assets are part of this product context.

## Product Principles

- Make the next incident response action easy to identify.
- Show operational state and failure context without hiding important details behind unnecessary navigation.
- Prefer shared patterns so the product feels consistent across operational surfaces.
- Treat narrow viewports and keyboard interaction as supported usage contexts.

## Accessibility & Inclusion

The interface uses semantic headings, labels, roles, focus-visible states, keyboard-dismissible menus and dialogs, and responsive layouts. Interactive controls should retain accessible names, usable touch targets, and predictable focus behavior as the UI evolves.
