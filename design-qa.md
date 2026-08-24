# Design QA

- Source visual truth: `tmp/prosewire-self-hosted-variation-3.png`
- Implementation screenshot: unavailable because the collaborative preview could not navigate to the local environment
- Source pixels: 1586 x 992
- Intended comparison viewport: 1280 x 800 CSS pixels at device scale factor 1
- State: signed out, self-hosted deployment, registration open
- Full-view comparison evidence: blocked; the source image opened successfully, but no browser-rendered implementation capture was available
- Focused region comparison evidence: blocked for the same reason
- Primary interactions tested: server-rendered links were verified in the HTML and `/sign-in` and `/sign-up` both returned HTTP 200; browser interaction could not be tested
- Console errors checked: no; preview automation could not load the local page

## Findings

- QA blocker: the collaborative preview opened public URLs but failed on the local environment at ports 3000, 4173, and 4180. This prevented desktop and mobile screenshots, interaction checks, console inspection, and a visual comparison against the selected mockup.

## Implementation checklist

- Restore local-environment navigation in the collaborative preview.
- Capture the root page at 1280 x 800 and compare it with the source image.
- Capture a mobile viewport and check the stacked layout and auth links.
- Test all five links and inspect browser console errors.

## Comparison history

- No visual comparison iteration was possible because the implementation capture is unavailable.

final result: blocked
