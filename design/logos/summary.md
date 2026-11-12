# ICEPik logo cleanup: summary

18 converter SVGs, each with a **faithful** and a **geometric** version plus a comparison image (original | before | faithful | geometric, on white and on Catppuccin Mocha Base #1e1e2e).

## Reference image
Only one original image was supplied (`icepik_01`-style lockup, 452×276 px). It is the reference for the cube, ICE and PIK shapes in every file. For other layouts and for the standalone pieces, each piece (cube, ICE, PIK) was registered against that image on its own. The camera can't be isolated in the image (it sits inside the cube), so `camera_clean` was checked against the converter SVG only. The image's layout differs from `icepik_01`'s SVG (the text is smaller beside the cube there); the SVG layout was kept.

## What changed (both versions)
- Staircase edges smoothed: the camera's 10.5k sub-pixel curve segments were refit as smooth curves; ledges on the ICE stems were blended out.
- Colours: 86 near-duplicate camera colours were merged to 37 Catppuccin colours (most of them Mocha neutrals); the cube and wordmark were remapped to Catppuccin too. Every visible colour is now an exact Catppuccin hex. The cube's luminance-mask greys are transparency levels, not colours, and were left as they were.
- Ice cube: the dark backing (#1A1E24) was removed, so the ice is see-through. The cube layers were remapped to distinct Catppuccin blues so the face shading survives on white as well as dark.
- 3 sub-pixel specks were removed (one each in the mask, camera and cube), plus 1 hidden camera shape (2 in geometric); 12–13 overlapping same-colour camera shapes were merged, verified by render.
- Wordmark: white → Catppuccin Latte Base #eff1f5, with a thin Mocha Surface1 #45475a outline drawn underneath (a `<use>` element) so it reads on white. Text stays as shapes; no font was substituted.
- C2PA provenance metadata removed (its signature would no longer match the edited files). No scripts, event handlers, external links or images were found in any input.
- Width, height and viewBox are unchanged in every file. Every file is smaller than its converter original.

## Geometric adds
Straight ICE stems, 48 square PIK pixel corners (the converter had rounded them), and straight near-straight cube and camera edges. No lens ring was round enough to replace with a true circle without moving edges beyond 2 px, so the lens rings keep their curves.

## Checks (all rendered with cairosvg, cross-checked with rsvg)
- Edge offsets vs the converter (in original-image px, 99.9th percentile): faithful ≤ 0.25 px on outlines; geometric ≤ 0.8 px.
- Inner colour edges: 99th percentile ≤ 0.35 px (faithful), ≤ 0.5 px (geometric). A few faint hairlines on the cube's back edge show 1–2.4 px at the 99.9th percentile because the edge detector counts them on one side and not the other; they look identical side by side.
- Vs your image: the converter itself is 1.0–1.4 px off your image; the cleaned versions add at most +0.25 px (faithful) and +0.52 px (geometric).
- 32 px: nothing breaks or vanishes. 2000 px: no staircase edges visible.

## Flags (judgment calls for you)
1. **Cube rim** is Latte Sky #04a5e5 so the edge holds up on white. Mocha Sapphire #74c7ec is closer to the old look on dark (one hex to swap).
2. **Lens blues** have no close Catppuccin match. A hand-picked ladder (Latte Sky, Frappé Blue, Mocha Sapphire, Macchiato Blue and Sapphire) keeps the shading, but it is brighter than before.
3. **Wordmark outline** was added for white backgrounds. To remove it, delete the `<use>` lines. On white at very small sizes the wordmark is still faint; a dark wordmark variant would suit light pages better.
4. Mixed Catppuccin flavours: neutrals are mostly Mocha, and accents come from whichever flavour is nearest.

## Per-logo results
| Logo | Faithful | Geometric | Converter size | Outline offset f / g (px) | Flags |
|---|---|---|---|---|---|
| ICE_PIK_combined_clean | pass (8 KB) | pass (4 KB) | 16 KB | 0.25 / 0.56 | outline added so the text shows on white; layout differs from your image, so each piece was checked on its own |
| ICE_clean | pass (3 KB) | pass (3 KB) | 12 KB | 0.25 / 0.25 | outline added so the text shows on white |
| PIK_clean | pass (4 KB) | pass (1 KB) | 11 KB | 0.25 / 0.56 | outline added so the text shows on white |
| camera_clean | pass (99 KB) | pass (92 KB) | 411 KB | 0.25 / 0.25 | lens uses Latte Sky (nearest Catppuccin); layout differs from your image, so each piece was checked on its own |
| ice_cube_clean | pass (36 KB) | pass (29 KB) | 61 KB | 0.25 / 0.25 | rim uses Latte Sky (nearest Catppuccin) |
| icepik_01_stacked_text-right | pass (143 KB) | pass (126 KB) | 475 KB | 0.25 / 0.71 | rim & lens use Latte Sky (nearest Catppuccin); outline added so the text shows on white; your image sets the text smaller; SVG layout kept |
| icepik_02_stacked_text-left | pass (143 KB) | pass (126 KB) | 475 KB | 0.25 / 0.71 | rim & lens use Latte Sky (nearest Catppuccin); outline added so the text shows on white; layout differs from your image, so each piece was checked on its own |
| icepik_03_stacked_text-bottom | pass (143 KB) | pass (126 KB) | 475 KB | 0.25 / 0.56 | rim & lens use Latte Sky (nearest Catppuccin); outline added so the text shows on white; layout differs from your image, so each piece was checked on its own |
| icepik_04_stacked_text-top | pass (143 KB) | pass (126 KB) | 476 KB | 0.25 / 0.57 | rim & lens use Latte Sky (nearest Catppuccin); outline added so the text shows on white; layout differs from your image, so each piece was checked on its own |
| icepik_05_inline_text-right | pass (143 KB) | pass (126 KB) | 475 KB | 0.25 / 0.79 | rim & lens use Latte Sky (nearest Catppuccin); outline added so the text shows on white; layout differs from your image, so each piece was checked on its own |
| icepik_06_inline_text-left | pass (143 KB) | pass (126 KB) | 476 KB | 0.25 / 0.78 | rim & lens use Latte Sky (nearest Catppuccin); outline added so the text shows on white; layout differs from your image, so each piece was checked on its own |
| icepik_07_inline_text-bottom | pass (142 KB) | pass (125 KB) | 475 KB | 0.25 / 0.35 | rim & lens use Latte Sky (nearest Catppuccin); outline added so the text shows on white; layout differs from your image, so each piece was checked on its own |
| icepik_08_inline_text-top | pass (142 KB) | pass (125 KB) | 475 KB | 0.25 / 0.35 | rim & lens use Latte Sky (nearest Catppuccin); outline added so the text shows on white; layout differs from your image, so each piece was checked on its own |
| icepik_09_split_horizontal | pass (143 KB) | pass (126 KB) | 476 KB | 0.25 / 0.78 | rim & lens use Latte Sky (nearest Catppuccin); outline added so the text shows on white; layout differs from your image, so each piece was checked on its own |
| icepik_10_split_vertical | pass (143 KB) | pass (126 KB) | 476 KB | 0.25 / 0.71 | rim & lens use Latte Sky (nearest Catppuccin); outline added so the text shows on white; layout differs from your image, so each piece was checked on its own |
| icepik_11_wordmark_stacked | pass (8 KB) | pass (4 KB) | 16 KB | 0.25 / 0.56 | outline added so the text shows on white; layout differs from your image, so each piece was checked on its own |
| icepik_12_wordmark_inline | pass (8 KB) | pass (4 KB) | 16 KB | 0.25 / 0.56 | outline added so the text shows on white; layout differs from your image, so each piece was checked on its own |
| icepik_icon (1) | pass (135 KB) | pass (122 KB) | 466 KB | 0.25 / 0.25 | rim & lens use Latte Sky (nearest Catppuccin); geometric: a few hairlines move up to 2.4 px |

## Dark-text variation (added)
For white or light backgrounds and very small sizes, every logo that has text now has two more files: `<name>-faithful-dark-text.svg` and `<name>-geometric-dark-text.svg`, plus `<name>-dark-text-comparison.png`, which shows light vs dark text on white at 360, 160, 96, 64 and 32 px wide.
- Wordmark colour: Catppuccin Mocha Base #1e1e2e, about 17:1 contrast on white. Latte Text #4c4f69 was also tested but looked grey and soft at 32 px.
- The thin outline is removed; it was only there to make light text show on white.
- The shapes are identical to the faithful and geometric versions (silhouettes match pixel for pixel); the icon is unchanged. All colours are Catppuccin and every file is smaller than its converter original.
- Not made for `icepik_icon (1)`, `ice_cube_clean` or `camera_clean`, which have no text.
- Flag: in the side-by-side layouts (05, 06, 09), at 32 px wide the text is only about 5 px tall, so it reads as a shape rather than words. At that size the icon alone, or a stacked layout, works better.

| Logo | Faithful dark | Geometric dark | Converter size |
|---|---|---|---|
| ICE_PIK_combined_clean | 8 KB | 4 KB | 16 KB |
| ICE_clean | 3 KB | 3 KB | 12 KB |
| PIK_clean | 4 KB | 1 KB | 11 KB |
| icepik_01_stacked_text-right | 143 KB | 125 KB | 475 KB |
| icepik_02_stacked_text-left | 143 KB | 125 KB | 475 KB |
| icepik_03_stacked_text-bottom | 143 KB | 125 KB | 475 KB |
| icepik_04_stacked_text-top | 143 KB | 125 KB | 476 KB |
| icepik_05_inline_text-right | 143 KB | 126 KB | 475 KB |
| icepik_06_inline_text-left | 143 KB | 126 KB | 476 KB |
| icepik_07_inline_text-bottom | 142 KB | 125 KB | 475 KB |
| icepik_08_inline_text-top | 142 KB | 125 KB | 475 KB |
| icepik_09_split_horizontal | 143 KB | 126 KB | 476 KB |
| icepik_10_split_vertical | 143 KB | 125 KB | 476 KB |
| icepik_11_wordmark_stacked | 8 KB | 4 KB | 16 KB |
| icepik_12_wordmark_inline | 8 KB | 4 KB | 16 KB |
