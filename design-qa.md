# Prosewire cloud sign-in design QA

## Evidence

- Source visual truth: `prosewire-login-direction-1.png`
- Browser-rendered implementation: `design-qa-assets/login-cloud-source-viewport.png`
- Mobile implementation: `design-qa-assets/login-cloud-mobile.png`
- Full-view comparison: `design-qa-assets/login-cloud-comparison.png`
- Focused comparison: `design-qa-assets/login-cloud-focused-comparison.png`
- Desktop viewport and source pixels: 1586 × 992 CSS px, 1586 × 992 image px, device scale factor 1
- Mobile viewport and pixels: 390 × 844 CSS px, 390 × 844 image px, device scale factor 1
- State: signed out, cloud deployment, Google and GitHub configured in one column, no welcome heading, open registration enabled
- Density normalization: none required; the source and desktop implementation are both 1× and exactly 1586 × 992

## Findings

- No product P0, P1, or P2 visual issues remain in the browser-rendered captures.
- [Blocked] The T3 collaborative browser reports the local page as automation-capable and loads the correct title and URL, but remains `visible: false`; every snapshot attempt returns `Preview snapshot failed`. This prevents the required shared-browser inspection and handoff even though local Chromium captures and interaction checks pass.

## Required fidelity surfaces

- Fonts and typography: Georgia display treatment, sans-serif control text, weights, hierarchy, and wrapping match direction 1. The larger official wordmark treatment is retained on desktop and scales down without wrapping on mobile.
- Spacing and layout rhythm: the 436 px desktop form width, centered composition, vertical rhythm, 10 px control radii, and border treatment match the reference. Google and GitHub use separate full-width rows above the email divider.
- Colors and visual tokens: warm paper background, navy foreground/button, muted gray borders, and coral link accent match the source palette.
- Image quality and asset fidelity: the implementation uses Prosewire's official transparent `prosewire-mark-on-light.svg`; no CSS, glyph, or placeholder approximation is used.
- Copy and content: the user explicitly removed "Welcome back." Google, GitHub, and divider copy are the requested cloud-only extension.

## Full-view comparison evidence

The full comparison shows the same centered, card-free composition, warm background, form width, dark primary action, and registration footer. The user-requested version replaces the reference heading with two full-width social sign-in rows.

## Focused comparison evidence

The focused comparison makes the logo, type, controls, divider, provider icons, and footer readable at 1×. The official mark is sharp and transparent. Inputs and the primary button are intentionally slightly shorter than the generated reference to accommodate optional providers without crowding the 992 px desktop viewport.

## Comparison history

1. Initial capture: the logo treatment was too small relative to the reference. Fixed by increasing desktop mark and wordmark sizing while preserving the mobile scale.
2. Second capture: the raster app icon introduced a faint square backdrop. Fixed by replacing it with the official transparent brand SVG.
3. Third capture: the enlarged wordmark overflowed its 436 px region (`scrollWidth: 469`, `clientWidth: 436`). Fixed by reducing the desktop mark to 100 px and wordmark to 4.75 rem. Post-fix browser measurement is `scrollWidth: 436`, `clientWidth: 436`.
4. Final local Chromium evidence: full and focused comparisons show no remaining actionable P0/P1/P2 visual mismatch.
5. User refinement: removed the "Welcome back" heading and changed the provider layout from two columns to two full-width rows. The final capture measures both provider buttons at 436 × 52 px with matching x positions and a 12 px vertical gap.

## Interaction and responsive checks

- Cloud guest `/` redirects to `/sign-in`.
- Authenticated `/` redirects to `/dashboard` in the Postgres-backed acceptance test.
- Google button sends `{ provider: "google", callbackURL: "/dashboard" }` to the Better Auth social endpoint.
- Google and GitHub render as a single vertical column on desktop and mobile.
- "Welcome back" is absent from the rendered document.
- Password visibility toggle changes the password input to visible text.
- Self-hosted root retains the marketing page and self-hosted sign-in hides social providers.
- Desktop and 390 × 844 mobile layouts were captured without overflow.
- Console errors checked: none in desktop and mobile capture pages.
- T3 collaborative-browser snapshots: blocked as described above.

## Follow-up polish

- P3: after real OAuth credentials are available, visually confirm the external Google and GitHub consent transitions.

final result: blocked
