# ICEPik logo source files

Cleaned-up SVG versions of the ICEPik logo, kept here for future work. This folder is outside `public/`, so the site doesn't serve these files.

Each logo has these versions:

- `-faithful.svg`: smoothed, and closest to the original artwork. This is the preferred version.
- `-geometric.svg`: straightened edges and square pixel corners.
- `-faithful-dark-text.svg` and `-geometric-dark-text.svg`: dark lettering (#1e1e2e) for white or light backgrounds. Logos without text (the icon, cube and camera) have none.

`summary.md` explains the cleanup, the colour choices and the checks behind it.

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
