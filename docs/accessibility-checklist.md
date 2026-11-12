# ICEPik accessibility checklist (WCAG 2.2 AA)

Checked on 12 November 2026, on the work branch after the style pass (glass cards, lava lamp, field edges). Every line of the owner's checklist is below, in the owner's order, with a status, the evidence and the file or screen it refers to.

**Statuses.** **Pass**: met as it was. **Fixed**: met after a change in this pass. **Not applicable**: nothing in ICEPik that the line is about. **Needs a person**: only a person on a real device can check it; the test script at the end says how. **Not in this pass**: the fix is a new feature or is outside this pass's scope; what it would need is written down.

**How it was checked.** All checks ran against a production build (`next build`, `next start`) and the stand-in database (`scripts/mock-supabase.mjs`, 8 fixture sightings). Map tiles were blocked in every check; the place search and reverse lookup were stubbed. Sizes: 1280×800, 1024×768, 820×1180, 768×1024, 390×844, 360×667 and 844×390, in light and dark mode, plus 320×568 and 320×200 (1280×800 at 400%).

- `npx eslint`: no errors, no warnings.
- axe-core 4.10.3 (downloaded once into a temporary folder outside the repo), rule tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22a`, `wcag22aa`, 19 screen states × 7 sizes × 2 schemes = 272 runs. See [axe](#axe-results).
- `node scripts/a11y-audit.mjs` (new): contrast on opaque surfaces, target size, reflow at 320 px and text spacing, on 23 screen states at the 7 sizes in both schemes and at the two 320 px sizes (354 states). It runs `scripts/glass-contrast.mjs` for the see-through surfaces.
- `node scripts/glass-contrast.mjs`: 161 of 161 pass.
- `node scripts/capture-layout.mjs --compare`: no differences above 1 px in 188 screen states (baseline commit b6297c7).
- A keyboard-only pass (Tab, Shift+Tab, Enter, Space, Escape, arrows) of every screen at 1280×800 and 390×844, and a scripted check of every fix at those sizes and at 1024×768, 820×1180, 844×390 and 360×667.
- The W3C "Understanding" pages for 2.2.2, 2.4.11, 2.5.7, 2.5.8, 3.3.7 and 3.3.8, read on 12 November 2026.

Nothing was tested with a real screen reader, a real phone or a real user. Those lines say **Needs a person**.

## Changes in this pass

The "Fix now" changes keep every element where it was. The owner then approved eight of the nine Ask-first changes (see [Ask-first findings](#ask-first-findings)); with the test data none of them moves anything either, and `capture-layout.mjs --compare` still reports no difference above 1 px in 188 screen states.

| Change | Files | Checklist lines |
|---|---|---|
| Dialogs take focus when they open; the rail and the map are `inert` behind them, so Tab stays in the dialog layer (the lamp's pause button and the account message stay in reach); focus returns to the control that opened the dialog, or to the nearest one that does the same job. On phones the tab bar stays in reach beside Know Your Rights. Settings pages (Log in, Save account, Terms, Clear, Delete) focus their heading when they open. | `map-app.tsx`, `settings-dialog.tsx`, `globals.css` | 2.2 |
| Escape also closes the report form and the alert card (F11). The order is unchanged: dialog, report form, place being named, choosing a spot, card. | `map-app.tsx` | 2.2 |
| A "Skip to main content" link is the first Tab stop. It shows only while it has focus, is fixed (moves nothing), and focuses `<main>` without changing the URL. No ring is drawn round the map. | `map-app.tsx`, `globals.css` | 2.2 |
| A hidden `<h1>` ("ICEPik map") on the map screens. | `map-app.tsx` | 1.2, 2.1 |
| Choosing a spot with the keyboard: Submit a report, Set on map and Add a place move focus to the map; the arrow keys move it and Enter or Space puts the pin at its center. The banner's words describe the map while it waits (`aria-describedby`), with a hidden line on how to do it by keyboard. "Move pin" focuses the map, and coming back focuses "Move pin". | `map-app.tsx` | 2.2, 4.5 |
| Enter or Space on a focused pin or cluster opens it (Leaflet marks them `role="button"` but only listens for clicks). This was P2. | `map-app.tsx` | 2.2 |
| On upright phones, while the Reports sheet covers the map, the map, its pins, its credits, Submit and the map buttons leave the Tab order (P17). Submit also leaves it while the account set-up message covers it. | `map-app.tsx` | 2.2, 4.8 |
| The search results close when focus leaves the search box, as they do on a click elsewhere, where they float over the map. In the phone's Reports sheet they are the sheet's content and stay. | `map-app.tsx` | 2.2 |
| Screen readers hear the search: "Searching…", "N places found", "No places found", "Search is unavailable right now" (F13). | `map-app.tsx` | 2.1 |
| Notices ("Account saved", "Logged in", "Sighting posted"…) are read from a live region outside the map and the dialogs, so screen readers hear them while a dialog makes the map inert (part of problem 7). | `map-app.tsx` | 2.1 |
| Know Your Rights links say "(opens in a new tab)" to screen readers. | `map-app.tsx` | 2.4 |
| Form errors are tied to their fields with `aria-invalid` and `aria-describedby`: the report form (what you saw, the counts), Save account (username, password, repeat), Log in (both fields). | `report-form.tsx`, `settings-dialog.tsx` | 2.4 |
| Home and Work buttons in Settings have the place in their name ("Show Home", "Remove Home", "Set on map: Home"). | `settings-dialog.tsx` | 2.4 |
| The duplicate id `nearby-title` (report form and panel) is gone: the form uses `useId()`. | `report-form.tsx` | 2.1 |
| The terms box on the consent screen is a named region (`role="region"`), so its label is read. | `consent-screen.tsx` | 2.1 |
| `scroll-padding` keeps a focused control clear of the phone's title bar and the terms' Back bar. | `globals.css` | 2.2, 3.8 |
| Contrast on solid report rows (phones and tablets): verified text `#ff8085` (was 4.49:1, now 5.14:1), the verified icon `#ff5f65` (was 2.94:1, now 3.82:1), and the selected row's grey line and red (were 3.87:1 and 3.41:1, now 4.75:1 and 4.66:1). | `globals.css` | 2.3 |
| Light map: the credits' links `#00567a` (Leaflet's `#0078a8` was 3.1:1 where the map under the box is dark; now at least 5.0:1). | `globals.css` | 2.3 |
| The search box's focus ring is 2 px outside its edge, like the other fields (it was two 1 px lines, under 2 px at desktop sizes). | `globals.css` | 2.2 |
| `scripts/a11y-audit.mjs` (new). | `scripts/` | 1.5, 2.3, 3.2, 3.4 |
| **Approved A, placed by the owner.** Notices show on top of everything, dialogs included ("Account saved" was hidden under Settings): at the top right on desktop (just left of the alert card while one is open), and at the top center on tablets and phones, under the bar across the top of the map (under the title bar while a phone dialog is open). On upright phones they are narrow enough to clear the map buttons. They now sit outside the map in the page, so their pause button works while a dialog is open. | `map-app.tsx`, `globals.css` | 2.1, 2.2 |
| **Approved B, as changed by the owner.** Notices stay 20 seconds instead of 6. Each has a pause button (keyboard, touch and mouse) that keeps it until it is played again; the time also stops while the pointer is over it or focus is in it. | `map-app.tsx`, `globals.css` | 2.2 |
| **Approved D, as changed by the owner.** The alert card's heading keeps its one line on desktop (two on phones and tablets). When it is cut short, a chevron button ("Full address", `aria-expanded`) or a click on the heading shows all of it (problem 14). | `sighting-card.tsx`, `globals.css` | 2.4, 3.1, 4.4 |
| **Approved E.** A report row's summary and status line wrap instead of being cut short. | `globals.css` | 3.1, 4.4 |
| **Approved F.** Under 260 px tall (1280×800 at 400%) the + and − buttons, which sat under "Submit a report", are hidden. | `globals.css` | 3.2 |
| **Approved G.** A search that finds nothing says "No places found." | `map-app.tsx` | 2.1 |
| **Approved H.** While the map has keyboard focus, the banner says "Press Enter to put the pin at the center of the map." | `map-app.tsx`, `globals.css` | 2.2 |
| **Approved I.** The root font size is in rem, so the browser's font size setting works; at the default 16 px nothing changes (problem 11). | `globals.css` | 3.1 |

## 1. Next.js and Vercel setup

### 1.1 Set `<html lang>` in the root layout. For more than one language, use `app/[lang]/layout.tsx` with `<html lang={lang}>` and `generateStaticParams`.
- **Status:** Pass (one language).
- **Evidence:** `<html lang="en">`. ICEPik is English only in this pass, so there is no `[lang]` segment. A second language is under 4.1–4.3.
- **Where:** `app/layout.tsx`.

### 1.2 Give every route a unique, descriptive, translated `<title>` with the Metadata API. The route announcer reads `document.title`, then `<h1>`, then the URL path.
- **Status:** Pass, with notes.
- **Evidence:** There is one route (`/`) and its title is "ICEPik", set with the Metadata API. It is short on purpose: it shows in tabs and in the browser history, and it never names a street (comment in `app/layout.tsx`). The app never changes route, so the route announcer has nothing to announce; the consent screen and the map are the same route. The consent screen has an `<h1>`; the map screens now have one too (hidden, "ICEPik map"). Translated titles: Not in this pass (English only). Changing the title is an Ask-first decision (decision 4) and was not proposed.
- **Where:** `app/layout.tsx`, `consent-screen.tsx`, `map-app.tsx`.

### 1.3 Use `next/link` for internal navigation, so client-side transitions are announced.
- **Status:** Not applicable.
- **Evidence:** There are no internal links: one route, and every screen is a state of it. The only links are the three Know Your Rights links and the map credits, which go to other sites. The skip link is a same-page link that moves focus by script.
- **Where:** whole app.

### 1.4 Keep the default viewport (`width=device-width, initial-scale=1`). Do not set `maximumScale: 1` or `userScalable: false`.
- **Status:** Pass.
- **Evidence:** `width: "device-width", initialScale: 1, viewportFit: "cover"`. No `maximumScale`, no `userScalable`. `viewportFit` only lets the page reach under a notch.
- **Where:** `app/layout.tsx`.

### 1.5 Linting: `eslint-config-next` includes jsx-a11y, which finds only some problems. On Next 16, run `eslint .` in CI, because `next build` no longer lints.
- **Status:** Pass for linting; CI is Not in this pass.
- **Evidence:** `npx eslint` passes with no errors or warnings. `eslint-config-next` 16.2.4 turns on only six jsx-a11y rules (`alt-text`, `aria-props`, `aria-proptypes`, `aria-unsupported-elements`, `role-has-required-aria-props`, `role-supports-aria-props`); the Next 16 upgrade guide confirms that `next build` no longer lints. The repo has no CI workflow and adding one is out of scope. **What it would need:** a GitHub Actions workflow that runs `npm ci`, `npx eslint .`, `npx tsc --noEmit` and `npx next build` on every pull request; `scripts/a11y-audit.mjs` could run there too, with the stand-in database.
- **Where:** `eslint.config.mjs`, `package.json`.

### 1.6 Use the Vercel Toolbar's Accessibility Audit on previews. It uses axe and checks WCAG 2.0 A and AA, so the 2.2 items (target size, dragging) need manual checks.
- **Status:** Needs a person.
- **Evidence:** The toolbar runs on Vercel previews, which this session can't open. The same engine (axe-core, with the 2.1 and 2.2 rules as well) ran locally on every screen state: see [axe results](#axe-results). Target size is measured by `scripts/a11y-audit.mjs`; dragging is 3.5 below. Test script: [T1](#t1-vercel-toolbar-audit-on-a-preview).
- **Where:** Vercel preview of this branch.

## 2. Core accessibility

### 2.1 Semantic HTML first (`button`, `nav`, `main`, real headings). ARIA only when native elements cannot do the job.
- **Status:** Fixed.
- **Evidence:** Every control is a `<button>`, `<a>`, `<input>` or `<textarea>`; landmarks are `<nav aria-label="ICEPik">` and `<main>`; dialogs are `<section role="dialog" aria-modal="true">` with a labelled title. Fixed here: the map screens had no `<h1>` (problem 3, now a hidden one); the id `nearby-title` was used twice (problem 4); the terms box had an `aria-label` with no role (problem 5, now `role="region"`); notices and search changes are now in live regions screen readers hear (F13, part of problem 7). Left as they are: the terms' headings are `<h3>` under the consent screen's `<h1>` (they live in `policy.tsx`, which this pass doesn't edit); map pins come from Leaflet as `<div role="button">` with a `title` (the map files stay as they are).
- **Where:** `map-app.tsx`, `report-form.tsx`, `consent-screen.tsx`; screens: map, consent, report form.

### 2.2 Everything works by keyboard: logical order, no traps, a skip link, and a visible `:focus-visible` outline. Modals move focus in and restore it on close.
- **Status:** Fixed.
- **Evidence:**
  - **Modals:** Settings, Know Your Rights and the report form now take focus on opening, keep Tab inside the dialog layer (`inert` on the rail and the map, not a focus trap), and return focus to the control that opened them (problem 1, F10). Fallbacks when that control is gone: Settings → the Settings button that shows; Know Your Rights → its tab; the report form → the new sighting's card (after posting, or after choosing a sighting nearby), else "Submit a report"; "Set on map" and "Add a place" → the map, ready for Enter. Checked by script at six sizes: Tab never leaves the dialog layer in 30 presses; Escape and Close return focus.
  - **Skip link:** the first Tab stop on the map screens; it moves focus to `<main>`, shows only while focused, moves nothing (problem 2). The consent screen has no navigation before its content, so it has none.
  - **Order:** desktop: skip link, rail, map (arrows pan, + and − zoom), pins, credits, search, report rows, Know your rights link, Submit, map buttons. Phones: skip link, tab bar, map, pins, credits, Settings, search, Submit, map buttons. The map comes before the search box because it comes first in the page. With the skip link that order is workable; moving the search first would change what keyboard users meet, so it is left as it is.
  - **No traps:** none found; Escape closes, in order, a dialog, the report form, the place being named, choosing a spot, then a card (F11).
  - **Things that didn't work by keyboard and now do:** placing a pin for a report, home, work or a new place (needed a click on the map; now Enter on the map, and the banner says so while the map has keyboard focus); opening a pin or cluster (P2); the Settings pages (focus was lost when the button that opened them went away).
  - **Focus ring:** a 3 px blue outline (`--blue`), 3.3:1 or more on every surface (glass-contrast.mjs); fields add a 2 px blue ring. The search box's ring was thinner and now matches. Focus put on the dialog, `<main>` or a Settings heading by the app shows no ring; the next Tab lands on a control that has one.
  - **Notices (2.2.1):** they stay 20 seconds and have a pause button that keyboard, touch and pointer users can reach; the second Tab stop on the page, and one Shift+Tab from a dialog.
  - **Focus not obscured (2.4.11):** `scroll-padding` keeps focus clear of the phone's title bar and the terms' Back bar (problem 6). Behind the phone's Reports sheet nothing is reachable any more (P17); search results close when focus leaves them. The keyboard pass found nothing fully hidden behind author content except the cases the W3C note allows: pins under the docked alert card and under the place-name form, which Escape now closes without moving focus. At 400% zoom the + and − buttons were hidden under "Submit a report"; they are now left out below 260 px of height (3.2).
- **Where:** `map-app.tsx`, `settings-dialog.tsx`, `globals.css`; every screen.

### 2.3 Contrast: 4.5:1 for text and 3:1 for UI components. Never rely on colour alone.
- **Status:** Fixed.
- **Evidence:**
  - `scripts/a11y-audit.mjs` measured 4,837 text elements, 1,139 icons and 454 field edges on opaque surfaces across 354 screen states: no failure. Text over the map (the credits) is measured over white and over black.
  - The 1,396 elements on glass or on the lava lamp can't be measured from the page (the backdrop is the map or an animation). `scripts/glass-contrast.mjs` proves them from the tokens, with the blur not counted: 161 of 161 pass; worst text 4.78:1, worst icon 3.11:1, worst field edge 3.26:1, focus ring 3.31:1.
  - Fixed here: verified text on the solid report rows of phones and tablets (4.49:1, the one axe violation), the verified icon there (2.94:1) and the selected row's grey line and red (3.87:1, 3.41:1); the light map's credit links (3.1:1 over dark map). New values are in the table above.
  - Colour alone: status is shown by colour plus a word (Verified, Unverified, Disputed), an icon (tick, "!", "?") and, on pins and phone rows, a shape or border style (disputed is dashed). Errors have words. The selected row has a white bar (desktop) or a lighter fill and is `aria-pressed`.
- **Where:** `globals.css`; report rows, credits.

### 2.4 Alt text on every image (`alt=""` if decorative), a label on every form field, and descriptive link text.
- **Status:** Fixed.
- **Evidence:** The logo `<img>` has `alt="ICEPik"`; every icon SVG is `aria-hidden`; the lava lamp is `aria-hidden`; map tiles get `alt=""` from Leaflet; pins are named by their `title` (address and status). Every field is inside its `<label>`; the search box has an `aria-label`; the switch has `aria-labelledby` and `aria-describedby`. Fixed: form errors now point at their field (problem 13); the three new-tab links say so (problem 9); Home/Work buttons name their place. Link text: "View resources", the three organisations' names, and the credits' names.
- **Where:** `brand-logo.tsx`, `icons.tsx`, `report-form.tsx`, `settings-dialog.tsx`, `map-app.tsx`.

### 2.5 Respect `prefers-reduced-motion`.
- **Status:** Pass.
- **Evidence:** With `prefers-reduced-motion: reduce` the app's transitions are off and the lamp is still, with no pause button. Otherwise the lamp moves for more than 5 seconds, so WCAG 2.2.2 applies (decorative motion is not exempt): the pause button (on the consent screen and on Log in and Save account) stops it, and the "Moving background" switch in Settings turns it off on the device. The pause button is reachable by keyboard in both places, including while the Settings dialog is open.
- **Where:** `globals.css` ("Motion", "Lava lamp"), `lava-lamp.tsx`, `settings-dialog.tsx`.

## 3. Mobile web

### 3.1 Pinch-zoom is allowed, and text scales to 200%.
- **Status:** Fixed.
- **Evidence:** The viewport doesn't block zoom (1.1). On the map, a pinch zooms the map (Leaflet), elsewhere it zooms the page. Playwright has no page zoom, so 200% was emulated as a window half as wide and high at twice the pixel density, and text sizes were compared in device pixels (problem 11):
  - From 1280×800, every measured text is at least 2.02× larger at 200% (the layout becomes the sideways-phone one, at 16 px to the rem).
  - From 1920×1080, every text is 2.02× larger except "Submit a report" and the rail labels, at 1.73× and 1.75×: the tablet layout sets them smaller than desktop does. They reach 2× at about 240% zoom.
  - No sideways scroll and no loss at either.
  - Browser zoom is enough for 1.4.4 (W3C technique G142), so this passed. But the root font size was set in pixels at every width (`clamp(12px, …, 22px)` on desktop, `16px` below 1280), so a browser's default-font-size setting was ignored; EN 301 549 11.7 asks software to follow it. Fixed with the owner's approval (I): the same sizes in rem. With the browser set to 20 px, the root goes from 12.66 to 15 px at 1280×800 and from 16 to 20 px at 390×844; at the default nothing changes.
  - Text spacing (1.4.12, checked by `scripts/a11y-audit.mjs`): the report rows' summary and status lines and the desktop card heading were cut off with the WCAG spacing. Fixed with the owner's approval: the rows' lines wrap (E); the card heading keeps its one line (two on phones and tablets) and, when cut short, has a button that shows all of it (D), so nothing is lost. The audit counts a heading with that button as not cut off.
- **Where:** `globals.css` (`html` font size).

### 3.2 No horizontal scrolling at 320 CSS px (400% zoom).
- **Status:** Fixed.
- **Evidence:** `scripts/a11y-audit.mjs` checks the page and every scroll box at 320×568 and 320×200 (1280×800 at 400%): no sideways scroll on any of the 23 states. All controls are on screen and every state can be reached. At 320×200 the map is small (31% of it free on the home screen, 13% while choosing a spot) but a pin can still be placed by tap or by Enter. At 320×200 the + and − buttons sat under "Submit a report": fully covered, but still Tab stops (2.4.11). Fixed with the owner's approval (F): below 260 px of height they are hidden and so leave the Tab order; a pinch, the wheel, or + and − on the focused map still zoom, and "Show where I am" stays.
- **Where:** home screen at 320×200.

### 3.3 Do not lock orientation.
- **Status:** Pass.
- **Evidence:** No `screen.orientation.lock`, no web manifest with an orientation, no CSS that hides content in one orientation. Every state works at 390×844 and 844×390 and at 768×1024 and 1024×768 (layout capture, audit and keyboard checks).
- **Where:** whole app.

### 3.4 Tap targets are at least 24×24 CSS px, ideally 44×44.
- **Status:** Pass.
- **Evidence:** `scripts/a11y-audit.mjs` measured 3,018 pointer targets on 354 states. Below 1280 px every target is at least 44 px high. On desktop two kinds of text button are 16.6 px high ("Move pin" in the report form; Show/Remove/Set on map in Settings): they pass by the spacing exception (a 24 px circle on each touches no other target) (problem 10; the owner chose to leave them, C). Exempt by the W3C rules: map pins (essential: their position is the information) and the credit links (inline in a line of text).
- **Where:** report form, Settings (desktop).

### 3.5 A single-tap alternative to pinch or path gestures, and a non-drag alternative to dragging.
- **Status:** Pass for pinch and the report pin; Not in this pass for moving the map freely (problem 12).
- **Evidence:** Pinch: + and − buttons. The report pin can be dragged, or moved with a tap elsewhere ("Drag the pin, or tap somewhere else to move it"). Moving the map needs a drag; the W3C page says keyboard panning doesn't count and gives pan buttons as the example. Ways to move the map without a drag today: search an address; tap a report row, a pin or "Show all N reports"; tap a cluster (zooms to it); "Show where I am"; a saved place in "Your places" or Settings; + and −. These reach any address and every sighting, but not "a bit to the left". **What it would need:** pan buttons (out of scope: "no map pan buttons"), or tap-to-center (a new behaviour that would clash with tapping to place a pin). Both are new features.
- **Where:** map.

### 3.6 Nothing works only by shake or tilt.
- **Status:** Not applicable.
- **Evidence:** No `devicemotion` or `deviceorientation` listener anywhere.
- **Where:** whole app.

### 3.7 Do not make people retype information. Allow paste and password managers in login.
- **Status:** Pass.
- **Evidence:** 3.3.7: a failed post keeps everything typed in the report form; "Repeat password" is the security exception the W3C page allows. 3.3.8: Log in and Save account fields have `autoComplete` (`username`, `current-password`, `new-password`), nothing blocks paste, and there is no puzzle. Remembering a password is a cognitive test, and password managers and paste are the "mechanism" the W3C page accepts. If CAPTCHA is turned on (Cloudflare Turnstile), it is normally a non-interactive check. There is no password reset (stated in Save account): Needs a person to decide whether that is acceptable (it is a product decision, not a WCAG line).
- **Where:** `settings-dialog.tsx`, `report-form.tsx`, `captcha.tsx`.

### 3.8 Test sticky headers and footers with zoom and with the on-screen keyboard open.
- **Status:** Fixed in the browser; Needs a person on a phone.
- **Evidence:** Sticky parts: the phone's dialog title bar, the terms' Back bar, the phone tab bar, the account message. `scroll-padding` now keeps focused fields clear of the title bar and the Back bar (problem 6); the keyboard pass at 390×844 and 360×667 found no focused field more than partly hidden. Emulation can't open an on-screen keyboard. Test script: [T3](#t3-the-on-screen-keyboard-over-the-forms).
- **Where:** report form, Settings, Log in, Save account on phones.

## 4. Non-English speakers

### 4.1 Set `lang` on the page and on passages in another language (WCAG 3.1.1 and 3.1.2).
- **Status:** Pass.
- **Evidence:** `lang="en"`; all text is English. Street names and organisation names are proper names, which 3.1.2 exempts. Text people type (descriptions, place names) has no language marked; it is user content.
- **Where:** `app/layout.tsx`.

### 4.2 Translate hidden strings too (aria-labels, alt text, titles), and prefer visible labels.
- **Status:** Not in this pass (English only, decision 3).
- **Evidence:** Hidden strings in use: aria-labels on icon buttons (Settings, Search, Clear search, Save this place, Close, Close sighting, Show where I am, Zoom in, Zoom out, Pause/Play background motion, Show/Remove/Delete <place>), pin titles from `map-pins.ts`, the hidden `<h1>`, the skip link, the hidden status lines (search, notices, searched place, pick hint, "opens in a new tab"), `alt="ICEPik"`, `nav aria-label`. **What it would need:** all of these, and every visible string, moved into per-language message files; most icon buttons have no visible label (Ask first if visible labels are wanted).
- **Where:** `map-app.tsx`, `settings-dialog.tsx`, `sighting-card.tsx`, `lava-lamp.tsx`, `map-pins.ts`.

### 4.3 Add a language switcher that names each language in itself (Deutsch, Français).
- **Status:** Not in this pass (a new feature).
- **Evidence:** **What it would need:** `app/[lang]/` routes with `generateStaticParams` (1.1), a switcher in Settings and on the consent screen listing languages by their own names with `lang` on each name, the choice kept on the device like the other settings (and added to the terms' "What this device keeps"), translated terms with their own `POLICY_VERSION`, and translated titles. Spanish would be the first to consider for Philadelphia; a person should decide which languages.
- **Where:** none yet.

### 4.4 For right-to-left languages, set `dir="rtl"`, mirror the layout, and use CSS logical properties. Avoid fixed-size text boxes, because translations run long.
- **Status:** Not in this pass.
- **Evidence:** `globals.css` names a physical side (`left`, `right`, `padding-left`…) in about 134 places and uses logical properties in 4 (the new rules in this pass use `inset-inline-start` and `scroll-padding-block`). Map buttons, the rail and the panel are placed by side. Fixed sizes that would cut translations: the card heading (one line on desktop, two on phones and tablets, with a button to show all of it), the rail labels, the tab bar labels, the Reports tabs. **What it would need:** `dir` from the language on `<html>`, the physical properties rewritten as logical ones, the chevrons and arrows mirrored, Leaflet's controls checked in RTL (the map itself stays as it is), and a pass with long translations.
- **Where:** `globals.css`.

### 4.5 Accept names in native scripts, and keep character limits fair across languages.
- **Status:** Pass for free text; Needs a person for usernames.
- **Evidence:** Descriptions (280), location labels (120) and saved place names (40) accept any script. The database counts characters (`char_length`); browsers count UTF-16 units for `maxLength`, so text in scripts outside the basic plane (and emoji) stops a little earlier in the field than in the database, never later. Place names are cut without splitting an emoji. Usernames allow only `a–z`, `0–9` and `_`: they become a login ID on a reserved domain (`lib/accounts.ts`). That's a design choice with a security reason (no lookalike names); a person should decide whether to allow other scripts.
- **Where:** `lib/sightings.ts`, `lib/device-storage.ts`, `lib/accounts.ts`, `database/`.

### 4.6 Write in plain language: short sentences, active voice, no idioms.
- **Status:** Needs a person.
- **Evidence:** The interface text is mostly short and direct ("Tap the map where you saw ICE.", "You need to be within 1 km."). The terms are longer and include legal ideas (subpoena, warrant); they are a draft the team must review (`policy.tsx`). Test script: [T5](#t5-a-session-with-real-users).
- **Where:** all screens, `policy.tsx`.

## 5. Testing order

### 5.1 ESLint.
- **Status:** Pass. `npx eslint`: 0 problems. See 1.5.

### 5.2 The Vercel Toolbar audit.
- **Status:** Needs a person. See 1.6 and [T1](#t1-vercel-toolbar-audit-on-a-preview).

### 5.3 A keyboard-only pass.
- **Status:** Fixed. Done at 1280×800 and 390×844; every fix re-checked at six sizes. See 2.2.

### 5.4 VoiceOver (iOS) and TalkBack (Android) in mobile browsers.
- **Status:** Needs a person. See [T2](#t2-voiceover-on-ios-and-talkback-on-android).

### 5.5 320 px and 400% zoom.
- **Status:** Fixed. See 3.2.

### 5.6 Real users, including non-English speakers.
- **Status:** Needs a person. See [T5](#t5-a-session-with-real-users).

## 6. Laws

### 6.1 Check whether the European Accessibility Act or similar laws apply. This is not legal advice. The app is for the United States, so it need not follow European law, but it should take the European accessibility rules as a guide.
- **Status:** Needs a person (a lawyer). See [Laws to check](#laws-to-check).

## Ask-first findings

The owner was asked once, with a screenshot and a recommendation for each, and answered on 12 November 2026.

| | Finding | Recommendation | Owner | Result |
|---|---|---|---|---|
| A | Notices show under dialogs: "Account saved" can't be seen (problem 7). Screen readers already hear it (Fix now). | Show the notice on top of the dialog, in the same place. | Yes: "every notice should be on top"; then "on desktop, the top right; on tablets and phones, the top center" | Done. Notices are above everything at every size, and no longer share a place with the account set-up message at the bottom. Desktop: the top right corner, over the map, clear of the dialogs; while an alert card is open (it is docked at the top right), just to the left of it, clear of its heading and Close button. Tablets and phones: centered under the bar across the top of the map, or under a phone dialog's title bar; on upright phones narrow enough to leave the map buttons and Settings clear. |
| B | Notices disappear after 6 seconds (problem 8; WCAG 2.2.1 Timing Adjustable). | Keep each notice until the person's next tap, click or key. | No: "extend the duration or other solutions"; then "let keyboard and touch users pause, with the longer duration" | Done. Notices stay 20 seconds; a pause button keeps one until it is played again (the same pattern as the lava lamp's button: "Keep this message" / "Let this message close"); focus or the pointer in the notice also stops the time. The notice comes right after the skip link in the page, so it is the second Tab stop, and Shift+Tab from a dialog's first control reaches it. 2.2.1 is met by the pause (a person can stop the time limit). |
| C | Desktop text buttons ("Move pin"; Show/Remove/Set on map) are 16.6 px high (problem 10). They pass 2.5.8 by spacing. | Leave them. | Yes | Left as they are. |
| D | The alert card's heading is cut short on desktop, with the rest only in a `title` tooltip (problem 14); the WCAG text spacing cuts it too. | Let it wrap to two lines, as on phones. | Yes; then "click-to-expand, but stop the wrap at one line" | Done. One line on desktop, as before (phones and tablets keep their two lines from the redesign). Cut short, a chevron button beside it, or a click on it, shows the whole address; the button is there only when the heading is cut short, and it notices text spacing and font size changes. The `title` tooltip is gone. |
| E | A report row's summary and status line are cut short with the WCAG text spacing (1.4.12) on phones and tablets, and the "already reported nearby" status line is cut at 320 px. | Let them wrap; rows grow only when the text doesn't fit. | Yes | Done. `scripts/a11y-audit.mjs` reports no text spacing failure. |
| F | 1280×800 at 400% zoom (320×200): the + and − buttons sit under "Submit a report" but are still Tab stops. | Below 260 px of height, hide them. | Yes | Done (3.2). |
| G | A search that finds nothing shows nothing. Screen readers hear "No places found" (Fix now). | Show "No places found." in the results, like the error. | Yes | Done. |
| H | The keyboard way to place a pin is told only to screen readers. | Show "Press Enter to put the pin at the center of the map." while the map has keyboard focus. | Yes | Done. For home, work and new places it says "Press Enter to choose the center of the map." It shows only for keyboard focus, not after a tap or click. |
| I | The root font size is in px: the browser's font size setting is ignored, and at 200% from 1920×1080 two labels grow only 1.73× (problem 11). | The same sizes in rem. | Yes | Done (3.1). At 200% from 1920×1080 the two labels still grow 1.73–1.75×, because the tablet layout sets them smaller than desktop; they reach 2× at about 240% zoom, which browser zoom allows. |

### The known problems from the handoff

| # | Problem | Result |
|---|---|---|
| 1 | Dialogs don't take, keep or give back focus | Fixed (2.2) |
| 2 | No skip link | Fixed (2.2) |
| 3 | No `<h1>` on the map screens | Fixed (2.1) |
| 4 | `nearby-title` used twice | Fixed (2.1) |
| 5 | `.consent-text` label with no role | Fixed (2.1) |
| 6 | Sticky bars can cover the focused control | Fixed (2.2, 3.8) |
| 7 | A notice that appears while a dialog is open is behind it | Fixed: screen readers (Fix now); on screen, on top of everything (A) |
| 8 | Notices disappear after 6 seconds | Fixed: 20 s, with a pause button for every input (B) |
| 9 | New-tab links don't say so | Fixed (2.4) |
| 10 | Desktop text buttons under 24 px | Pass by spacing; left as is (C) |
| 11 | Desktop text size from the window size | Pass by zoom; the browser's font size setting now works (I) |
| 12 | Moving the map needs a drag | Not in this pass (3.5) |
| 13 | Form errors not tied to fields | Fixed (2.4) |
| 14 | Alert card heading cut short on desktop | Fixed: click-to-expand (D) |

## Problems known from earlier rounds

The codes come from the previous handoffs (branches `claude/handoff-icepik-map-1` and `claude/handoff-icepik-map`). They were found before the phone and tablet layouts changed. Only the ones marked "rechecked" were tested in this pass; the others are listed as they were reported and are not regressions of the style pass.

| Code | Problem | This pass |
|---|---|---|
| F10 | Dialogs don't take or keep focus | Fixed (2.2) |
| F11 | Escape doesn't close the report dialog or the cards | Fixed (2.2) |
| F13 | Screen readers hear none of the search changes | Fixed (2.1) |
| P2 | Enter/Space on a focused pin does nothing | Rechecked: still true; Fixed in `map-app.tsx` (2.2) |
| P17 | Phone Tab reaches buttons behind the panel | Rechecked: still true; Fixed (2.2) |
| P3 | Pin focus lost on the 15 s refresh | Not rechecked; needs `sightings-map.tsx` (Ask first, decision 6) |
| P4 | Report rows never toggle off | Not rechecked |
| P5 | Credit links blocked at 280 px | Not rechecked (280 px is below the 320 px the checklist asks for) |
| P9 | Panel padding blocks the map | Not rechecked |
| P11, P12 | Long label under the panel or buttons | Not rechecked |
| P15 | Bad coordinates keep the old place | Not rechecked |
| P16 | Focus lost after a mouse pick of a result | Not rechecked |
| P19 | The same place isn't re-announced | Not rechecked |
| P20 | Keyboard search hides the selected pin | Not rechecked |
| P21 | Sideways card is 98 px tall | Not rechecked (the phone layouts changed) |
| P23 | Know Your Rights scrolls at 568×320 | Not rechecked |
| R7 | Sideways banner hides the searched place | Not rechecked |
| E1, E2, E3 | Map stays moved after the card closes; a saved place with a card open zooms out; rotating leaves the pin off screen | Not rechecked |
| M1 | "+" not disabled at zoom 18 | Not rechecked |
| M2 | Group card covers its cluster | Not rechecked |
| M4 | Credit focus ring clipped | Not rechecked |
| S1–S4 | Search: late results, Escape while searching, Escape on a result, Escape cancels placing Home | Not rechecked |
| F2–F20 (others) | Not described in any file in the repo or on its branches | Can't be reported without their descriptions |

## axe results

Run with axe-core 4.10.3 on every screen state (19 states: consent, home, map only, alert card, Reports, phone Search tab, search results, choosing a spot, naming a place, report form, report form with an error, Settings, Terms, Clear this device, Delete my account, Log in, Log in with an error, Save account, Know Your Rights, account set-up), at the 7 sizes, in light and dark: 272 runs.

| | Before this pass | After |
|---|---|---|
| Violations | 1 rule, on 12 of the 14 size and scheme pairs (every size below 1280 px): `color-contrast` on verified text in solid report rows, 4.49:1 | **0** |
| Needs review: `color-contrast` | 1,040 elements (text on glass with a gradient, text over the map or partly covered) | 680 elements, same reasons |
| Needs review: `aria-prohibited-attr` | 14 (the terms box: `aria-label` with no role) | 0 |
| Needs review: `duplicate-id-aria` | 4 (`nearby-title` twice) | 0 |

The "needs review" contrast items are on glass or over the map, where axe can't see the background. `scripts/glass-contrast.mjs` proves the glass (161 of 161 pass); `scripts/a11y-audit.mjs` measures text over the map over white and over black. Only rule ids, counts and CSS targets were recorded, never HTML or URLs.

## Test script for the owner

What only a person can check. Use a Vercel preview of this branch (or a local build with the stand-in database). Write down the device, the browser and its version, and what you heard or saw.

### T1. Vercel Toolbar audit on a preview
1. Open the preview, sign in to Vercel, open the toolbar, choose **Accessibility Audit**.
2. Run it on: the consent screen; the map; Reports open; an alert card; Submit a report → the form; Settings; Settings → Log in; Know Your Rights.
3. Turn on **Recording mode**, then hover and Tab over the report rows, the pins, the buttons and the fields, and open and close each dialog, so hover and focus states are audited too.
4. Expected: no violations. "Needs review" on contrast over the glass and the map is expected: `scripts/glass-contrast.mjs` is the proof for those. The toolbar checks WCAG 2.0 only: target size and dragging are in 3.4 and 3.5.

### T2. VoiceOver on iOS and TalkBack on Android
Use Safari on an iPhone and Chrome on an Android phone, held upright.
1. **Consent:** swipe through. Expect "Before you start, heading level 1", then the intro, then "Terms and privacy, region". Double-tap "I agree" before reaching the end: expect "dimmed" or "disabled" and the hint "Scroll to the end of the terms to agree". Scroll the terms to the end (three-finger swipe), then agree.
2. **Map:** expect "ICEPik map, heading level 1" near the top. The tab bar: "Home, selected", "Reports, collapsed", "Know Your Rights". Swipe to the pins: each says its street and status ("Market Street & 15th, verified"). Double-tap one: its card opens; expect the card's heading. With a long address, expect "Full address, button, collapsed" beside it; double-tap: "expanded", and the heading shows all of the address.
3. **Reports:** double-tap Reports: "expanded". Swipe: the map and its pins should not be reachable now. Each row says its street, what was seen, the status and the time.
4. **Search:** type "city hall" and search. Expect "2 places found, listed after the search box" (or "No places found"). Choose one: expect "Searched place marked on the map".
5. **Settings:** open it. Expect "Settings, dialog" and the title. Swiping should never leave the dialog. Open Log in: expect "Log in to a saved account, heading". Submit empty: expect "Username or password is wrong" and the fields "invalid". Go Back: you land on the Log in button. Close: you land on the Settings button.
6. **Save account:** save with a username and password. Back in Settings, expect "Account saved. Your username is …" to be read. Swipe back from the dialog's Close button: expect the notice and "Keep this message, button". Double-tap it: the notice stays until "Let this message close" is double-tapped.
7. **Know Your Rights:** each link ends with "opens in a new tab". The tab bar stays reachable.
8. **Submit a report:** expect the banner to be read ("Tap the map where you saw ICE…"). Place the pin by double-tapping the map, Use this spot, then the form: "Report a sighting, dialog". Post with nothing chosen: expect "Choose what you saw" and the choices "invalid".
9. Note anything read twice, skipped, or read in the wrong order.

### T3. The on-screen keyboard over the forms
On both phones, upright and sideways: open Submit a report → the form, Settings → Save account, Settings → Log in, and Name this place (Settings → Add a place → tap the map). Tap each field in turn. Expect: the field you type in is never under the keyboard, the title bar or the Back bar; you can scroll to every button with the keyboard open; nothing is cut off at the right edge. Repeat with the browser's text size at its largest (iOS: aA → larger text; Android Chrome: Settings → Accessibility → Text scaling 200%).

### T4. The glass and the lava lamp on a mid-range phone
On a mid-range Android phone (for example 3–4 years old) in Chrome:
1. Open the consent screen and Settings → Log in. Watch the lamp for 30 seconds: does it stutter, heat the phone, or slow down typing? Press the pause button: it stops at once.
2. Turn on the system "Remove animations" (Android) or "Reduce motion" (iOS): the lamp is still and the pause button is gone.
3. Open the map with Reports, then an alert card: is the text on the glass cards easy to read over busy parts of the map (river, parks, labels)? Try in sunlight.
4. Turn on "Reduce transparency" (iOS) or high contrast text (Android): the cards should become solid.

### T5. A session with real users
Five to eight people, including at least two who don't read English well, one who uses a screen reader, and one who uses only a keyboard or switch control. Use fixture data, never real reports.
- Tasks: read the terms and agree; find the reports near you; open one and say what its status means; submit a report at a spot you choose; save your home; save the account; find legal help.
- Ask: which words were hard; what "Verified", "Unverified" and "Disputed" mean to them; whether they knew a notice had appeared; whether the moving background bothered them.
- For people who don't read English well: which language they would want first, and whether a browser's built-in translation made the app usable (it translates visible words, not the hidden ones in 4.2).

## Laws to check

This is not legal advice and states no legal conclusion. It lists what the sources say and the questions to ask a lawyer. Sources were read on 12 November 2026.

### European Accessibility Act (Directive (EU) 2019/882)
- **What it covers.** Article 2(2) lists the services it covers, "provided to consumers after 28 June 2025": electronic communications, access to audiovisual media, parts of passenger transport, consumer banking, e-books, and "e-commerce services". Article 3 defines e-commerce services as services "provided at a distance, through websites and mobile device-based services by electronic means" at the consumer's request "with a view to concluding a consumer contract", and a "service" by reference to Directive 2006/123/EC (an economic activity normally provided for pay). [Article 2](https://www.legislation.gov.uk/eudr/2019/882/article/2), [Article 3](https://www.legislation.gov.uk/eudr/2019/882/article/3).
- **Who is exempt.** Article 4(5): "Microenterprises providing services shall be exempt" (fewer than 10 people and no more than EUR 2 million turnover or balance sheet). Article 14 allows exceptions for a fundamental alteration or a disproportionate burden. [Article 4](https://www.legislation.gov.uk/eudr/2019/882/article/4).
- **What it asks for.** The accessibility requirements of Annex I (in practice EN 301 549, which contains WCAG 2.1 AA), and, in Annex V, information on how the service meets them, in the "general terms and conditions, or equivalent document". [Annex V](https://www.legislation.gov.uk/eudr/2019/882/annex/V).
- The text on EUR-Lex (CELEX 32019L0882) could not be read from this session; the legislation.gov.uk copy of the Directive as adopted was used.

### United States
- **ADA Title III (businesses and nonprofits open to the public).** The Department of Justice's guidance of 18 March 2022 says Title III covers online offerings and that "The Department of Justice does not have a regulation setting out detailed standards"; it points to WCAG and the Section 508 standards as "helpful guidance". [DOJ guidance](https://www.ada.gov/resources/web-guidance/). Courts differ on whether a website with no physical place is a "place of public accommodation". [CRS Legal Sidebar LSB10845](https://www.everycrsreport.com/reports/LSB10845.html), [Morgan Lewis, April 2022](https://www.morganlewis.com/pubs/2022/04/doj-breaks-silence-on-ada-web-accessibility-with-new-guidance).
- **ADA Title II (state and local government).** The 2024 rule adopts WCAG 2.1 AA for state and local governments' websites and apps ([Federal Register, 24 April 2024](https://www.govinfo.gov/content/pkg/FR-2024-04-24/pdf/2024-07758.pdf)). An interim final rule of 20 April 2026 moved the dates to 26 April 2027 for entities serving 50,000 people or more and to 2028 for smaller ones, as reported in secondary sources ([Consumer Financial Services Law Monitor](https://www.consumerfinancialserviceslawmonitor.com/2026/04/doj-extends-title-ii-ada-web-accessibility-rule-compliance-deadlines-for-state-and-local-governments/)); the Federal Register text should be read before relying on the dates. This matters only if a city office or another public body runs or pays for ICEPik.
- **Section 504 of the Rehabilitation Act and Section 508.** Section 504 applies to programs that receive federal money; Section 508 to federal agencies' own technology. Neither applies unless ICEPik takes federal money or works for a federal agency.
- **States.** Some states have their own laws (for example California's Unruh Act). Not researched in this pass.

### Ideas from EN 301 549 (V3.2.1) that go beyond WCAG
- **11.7 User preferences:** software "shall follow the values of the user preferences for platform settings for: units of measurement, colour, contrast, font type, font size, and focus cursor"; for web content the platform is the browser. ICEPik ignores the browser's default font size (3.1). [EN 301 549 V3.2.1](https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf).
- **12.1.1 Product documentation:** documentation "shall list and explain how to use the accessibility and compatibility features"; the note names an accessibility statement and help pages. ICEPik has neither. A statement could list the keyboard features (skip link, Enter on the map, Escape), the moving-background switch, what isn't accessible yet (moving the map without a drag, Not in this pass), and how to report a problem.
- **12.2 Support services:** support must give information on the accessibility features and "accommodate the communication needs of individuals with disabilities". ICEPik has no contact or support channel.
- **5.3 Biometrics:** no single biometric as the only way in. ICEPik uses none. Not applicable.
- **5.2 Activation of accessibility features:** turning on an accessibility feature must not need the ability it supports. The moving-background switch and pause button are reachable by keyboard and screen reader: met.

### Questions for a lawyer
1. Is ICEPik, a free community map run by volunteers, a "service" or an "e-commerce service" under the European Accessibility Act, and does that matter for a United States project that people in the EU may open?
2. Is the team or its fiscal sponsor a business or nonprofit "open to the public" under ADA Title III, and does Title III reach a web-only service with no physical place in Pennsylvania's federal courts (Third Circuit)?
3. If a city office, a school or another public body links to, funds or runs ICEPik, does the Title II rule (WCAG 2.1 AA, with the 2027/2028 dates) apply, and to whom?
4. Does Pennsylvania or Philadelphia have rules on the accessibility of websites run by nonprofits or with city partners?
5. Should ICEPik publish an accessibility statement and a way to report barriers, and what should it promise?
6. Does any grant or funder require WCAG 2.1 or 2.2 AA, or Section 508?
7. Is "no password reset" acceptable where a person with a memory-related disability loses access to their account?
