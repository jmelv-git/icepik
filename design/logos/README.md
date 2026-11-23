# ICEPik logo source files

Cleaned-up SVG versions of the ICEPik logo, kept here for future work. This folder is outside `public/`, so the site doesn't serve these files.

Each logo has these versions:

- `-faithful.svg`: smoothed, and closest to the original artwork. This is the preferred version.
- `-geometric.svg`: straightened edges and square pixel corners.
- `-faithful-dark-text.svg` and `-geometric-dark-text.svg`: dark lettering (#1e1e2e) for white or light backgrounds. Logos without text (the icon, cube and camera) have none.
- `-white-backing.svg` (added to any of the above): the same logo with a white fill behind the ice cube, cut to the cube's outline, so the see-through ice reads as ice on dark backgrounds. Only the cube gets the backing, not the text. Every logo with the cube has these (`icepik_01` to `icepik_10`, `icepik_icon` and `ice_cube_clean`); the wordmarks, ICE, PIK and the camera on its own don't.

`summary.md` explains the cleanup, the colour choices and the checks behind it.

## White-backing versions

`node scripts/white-backing.mjs` makes every `-white-backing.svg` from the file next to it, and `node scripts/white-backing.mjs --check` fails if any is missing or out of date. Run it again after changing a logo with the cube. The backing is a copy of the first path in the cube's luminance mask (`ice-alpha`, or `alpha` in `ice_cube_clean`), which is the cube's outline: a plain white path, no filter, so design tools show it too. It is drawn just before the camera and the cube, so it sits exactly under them. Checked by render: every solid pixel of the cube and camera is on the backing; only anti-aliased edge pixels fall outside it.

The app doesn't use these files yet: `public/brand/`, `app/icon.svg`, `app/favicon.ico` and `app/apple-icon.png` are unchanged.

## Used by the app

| File in the app | Copied from |
| --- | --- |
| `public/brand/icepik-logo.svg` | `icepik_01_stacked_text-right/icepik_01_stacked_text-right-faithful.svg` |
| `public/brand/icepik-logo-dark-text.svg` | `icepik_01_stacked_text-right/icepik_01_stacked_text-right-faithful-dark-text.svg` |
| `public/brand/icepik-logo-tall.svg` | `icepik_07_inline_text-bottom/icepik_07_inline_text-bottom-faithful.svg` |
| `public/brand/icepik-logo-tall-dark-text.svg` | `icepik_07_inline_text-bottom/icepik_07_inline_text-bottom-faithful-dark-text.svg` |
| `app/icon.svg` | `icepik_icon/icepik_icon-faithful.svg` |

`app/_components/brand-logo.tsx` shows the dark-text logo only in high contrast mode with a light theme. Everywhere else the logo sits on a dark background.

`app/favicon.ico` (16, 32 and 48 px) and `app/apple-icon.png` (180 px, on #1d1f26) were rendered from `app/icon.svg`.

## Notes

- The `icepik_icon (1)` folder and its files were renamed to `icepik_icon`. The notes in `summary.md` still use the old name.
- The comparison PNGs from the original pack (about 8 MB) are not included.
- Every SVG here was checked before it was added: no scripts, event handlers, external links or embedded images.
