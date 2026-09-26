# WhatsApp Message Intelligence

Listens to one WhatsApp group through WhatsApp Web (whatsapp-web.js), stores text/image messages once, classifies them with Gemini, and lets a person review uncertain results. Plain JavaScript (ES modules), npm workspaces: `server` (Express 5, MongoDB/Mongoose, Socket.IO) and `client` (React 19, Vite). See `README.md` and `docs/` for architecture and decisions.

## Commands

- `npm run db:up` — MongoDB in Docker
- `npm run dev` — API on :4000 and UI on :5173
- `npm test` — server tests (Vitest, in-memory MongoDB)
- `npm run eval` — 20 labelled messages through the real model
- `VITE_MOCK=1 npm run dev -w client` — UI with fixture data, no server or WhatsApp needed

## Working rules

- Build one part at a time; explain it simply; commit and push only after the user approves.
- Server layers: routes → controller → service → repository/model. Only repositories build Mongo queries. Objects are wired in `server.js` (dependency injection).
- Validation: express-validator for URL params, query filters and simple bodies; zod for env, AI output and the review body (shared with the AI schema).
- Never overwrite the original message or the `ai` block; human corrections go in `review`.
- Keep the plan file (`*Implementation Plan.md`) and `.env` out of git.

## Client

### Structure

- `src/api/` — every HTTP call (`http.js`, `messages.js`, `whatsapp.js`); `src/api/mock/` serves fixtures when `VITE_MOCK=1`.
- `src/hooks/` — `useSocket` (socket connection + events), `useMessages` (list state), `useLive` (shared WhatsApp status + queue counts), `useHotkeys`.
- `src/components/ui/` — base components (Button, SegmentedControl, Toggle, Chip, ChipInput, Dot, Kbd, Drawer, Skeleton, EmptyState, Menu, Lightbox).
- `src/components/layout/` — Shell, Sidebar, TopBar, CommandPalette, ShortcutSheet.
- `src/components/message/` — MessageDetail, ReviewForm, CategoryLabel, StatusLabel, Confidence.
- `src/pages/` — InboxPage, MessagesPage, ConnectionPage.
- API calls, socket events and data shapes must match the server; the redesign is frontend-only.

### Design system

A dark, dense operations tool in the spirit of Linear, the Vercel dashboard, Raycast and Superhuman. It must not look AI-generated.

**Banned:** purple/indigo gradients, gradient text, glows, glassmorphism or backdrop blur on cards; emoji in the UI; hero headers, "Welcome back", marketing copy; everything in rounded-2xl shadowed cards, cards inside cards; saturated rainbow badges; a different bright colour per button; centred single-column layouts with lots of empty space; an icon next to every label; full-page spinners; lorem ipsum or fake stats.

**Tokens** live in `client/src/styles/tokens.css` as CSS variables. Components use only these variables, never hard-coded colours.

- Background `#0A0A0B`, surface `#111113`, raised `#17171A`, hover `#1C1C20`, border `#232327`, strong border `#2E2E33`
- Text: primary `#EDEDEF`, secondary `#A1A1AA`, muted `#6B6B74`
- One accent: `#3ECF8E`, only for primary actions, focus rings and the "connected" state. Nothing else is green.
- Semantic: danger `#F2555A`, warning `#F5A524`, info `#5B9BF8`
- Categories are a 6px dot + text label, never filled pills: Incident `#F2555A`, Change Request `#F5A524`, Question `#5B9BF8`, Resource Update `#A78BFA`, Routine Update `#8B8B94`, Irrelevant `#4A4A52`
- Fonts: Geist Sans for UI; Geist Mono for timestamps, IDs, confidence numbers, counts and key hints
- Type scale 12 / 13 / 14 / 16 / 20 px; base 13px; headings weight 500, never 700, never above 20px
- 4px spacing grid; radius 6px (inputs, buttons) and 8px (panels); 1px borders separate things; shadows only on floating layers (menus, palette, toasts, drawer)
- Motion 120–180 ms ease-out, opacity and translate only; no bounce, no scale on hover
- Visible focus ring on every interactive element: 2px accent, 2px offset

**Dependencies (only these):** lucide-react (16px, stroke 1.5, sparingly), sonner (toasts), cmdk (command palette), @tanstack/react-virtual (only if a list gets long), @fontsource/geist-sans and @fontsource/geist-mono. Styling is plain CSS Modules (`Component.module.css`). No Tailwind, MUI, shadcn or framer-motion. No Redux.

**Copy:** short, plain, sentence case ("Approve", not "Approve Message"). Relative times in lists ("4m", "2h"), absolute in detail views ("25 Sep, 14:32"). Numbers in mono.

**Layout:** 220px sidebar (collapses to 56px, and automatically below 900px), 44px top bar with the live status strip, content fills the rest with no max-width. Must work down to 1280px.

**Loading and errors:** skeleton rows shaped like the real rows; toasts (sonner, bottom-right) show the server's `error.message`; a thin warning bar under the top bar when the socket drops.
