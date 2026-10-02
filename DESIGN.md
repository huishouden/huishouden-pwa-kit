# Huishouden design language

Every Huishouden app (the portal, spending, tasks, and whatever comes next) looks and behaves like
one product. A person moving between them should feel they never left. This file is the source of
truth; `pwa-design-check` enforces what code can check, the `huishouden/design-language` reviewer
judges the rest, and `expectHuishoudenFrame` checks the running app.

## Principles

1. **Calm.** The apps live on a shared wall tablet. Nothing shouts: no gradients, no glow, no
   rainbow badges, no exclamation marks. Colour carries meaning, never decoration.
2. **Glanceable.** The one number or list that matters is readable from across the room. One
   primary action per screen.
3. **Plain words.** Short sentences that say what happens. No marketing ("sleek", "seamless",
   "powerful"), no emoji in headings, buttons or labels.
4. **One frame.** Every app opens inside the same Huishouden app bar, so the suite feels like one place.

## Frame

- Top: the Huishouden app bar (`<hh-app-bar>` from `@piekstra/pwa-kit/app-bar` when available;
  until then the same anatomy by hand): house mark that links to the portal, the app's name, the
  app switcher, and the signed-in profile photo (`.hh-avatar`) on the right.
- Page background `--hh-cream`; content on white surfaces; max content width 1200px, centred;
  24px page padding (16px on phones), honouring safe-area insets.
- Tablet landscape (1280×800) first, then phone portrait. Nothing important below the fold on the tablet.

## Colour

Only these, from `@piekstra/pwa-kit/theme.css` (Tailwind names in brackets):

| Role | Light | Dark |
|---|---|---|
| Page | cream `#faf9f5` (`bg-cream`) | forest-900 |
| Surface (cards, dialogs, bars) | white | forest-800 |
| Text | stone-800 | stone-100 |
| Secondary text | stone-600 (never lighter than stone-500 on white) | stone-300 |
| Borders, dividers | stone-200 | forest-600 |
| Primary (buttons, links, selected, focus) | forest-700, hover forest-600 | forest-400 on forest-900 text |
| Positive values, success | forest-600 | forest-300 |
| Attention (over budget, needs today) | terracotta `#c86d51`, tint terracotta-light | terracotta |
| Error (failed action only) | red-700 | red-300 |

Charts and categories use the muted categorical set, in this order:
forest-600, terracotta, `#b08d57` (ochre), `#5b7a99` (slate blue), `#8a6f9e` (heather),
`#6f8f72` (sage), `#a8735a` (clay), stone-500. Never more than eight; group the rest as "Other".

**Not allowed:** gradients of any kind; Tailwind colour families other than forest, cream,
terracotta, stone, white, black (for scrims), red (errors) and amber only for a pending/warning dot;
raw hex colours outside the theme and the chart set; translucent "glass" panels (`backdrop-blur`);
neon or saturated accents.

## Type

- Inter (400, 500, 600, 700), loaded once; `font-sans` everywhere. No second typeface.
- Sizes: 14 small, 16 body, 18 lead, 20/24 headings, 32–48 for the one big number. Headings 600.
- Numbers that change (money, counts) use `tabular-nums`. Money shows the currency symbol and two
  decimals except the headline figure, which rounds to whole units.
- Sentence case everywhere. Uppercase only for tiny overline labels (12px, tracking-wide), sparingly.

## Shape and depth

- Radius: 12px controls (`rounded-xl`), 16–24px cards (`rounded-2xl`), 24px dialogs and sheets
  (`rounded-3xl`), full pills for chips and avatars.
- Borders: 1px stone-200. Shadow: one soft level for cards (`shadow-sm`), a stronger one only for
  dialogs and menus. No coloured shadows, no inner glows.
- Spacing on a 4px grid; 16–24px inside cards, 24–32px between sections.

## Components

Use these shapes (class strings mirror the tasks app's `ui.tsx`):

- **Primary button:** forest-700 fill, white text, `rounded-xl px-4 py-2.5 font-medium`, min height
  44px. One per screen region.
- **Ghost button:** stone-600 text, no border, stone-100 hover.
- **Chip / filter:** pill, white with stone-200 border; selected = forest-700 fill, white text.
- **Input:** white, stone-200 border, `rounded-xl px-3 py-2.5`, focus forest-500 border + forest-200 ring.
- **Dialog:** white `rounded-3xl`, black/40 scrim; bottom sheet on phones, centred on tablets;
  title + close (X) row; Escape closes.
- **List row:** full-width, 44px+ tall, stone-200 divider, primary text stone-800, meta stone-600.
- **Card:** white, `rounded-2xl`, stone-200 border or `shadow-sm`, 20–24px padding, one heading.
- **Icons:** lucide-react, stroke 2–2.2, 16/20/24px, coloured by text colour; no emoji as icons.
- **Empty and loading states:** one sentence and, if useful, one action. No spinners longer than a
  second without text.

## Motion and feedback

- Transitions 120–200ms, ease-out, opacity/transform only; none when `prefers-reduced-motion`.
- Confirm destructive actions in words ("Remove Sam? They lose access to every household app.").
- Undo over confirm where the action is cheap to reverse.

## Accessibility

- Text contrast ≥ 4.5:1 (3:1 for 24px+). Targets ≥ 44px. Visible focus ring (forest or terracotta).
- Every icon-only button has an `aria-label`. Live regions for values that update on their own.

## Dark and ambient modes

Dark uses the forest scale, not grey: forest-900 page, forest-800 surfaces, stone-100 text,
forest-400 primary. Ambient/dock modes are dark with larger type and no interactive chrome
except an exit control.

## Enforcement

| Check | Where | Catches |
|---|---|---|
| `pwa-design-check` | CI build job, every PR | Off-palette Tailwind colours, gradients, raw hex, `backdrop-blur`, other fonts, emoji in UI text |
| `expectHuishoudenFrame` | Smoke tests against the live site | Cream page, Inter font, app bar present |
| `huishouden/design-language` reviewer | `cr review` on every PR | Everything above that needs judgment: hierarchy, copy tone, component shapes, consistency with the other apps |
