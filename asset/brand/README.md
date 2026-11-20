# Saf0o brand library

`saf0o-app-icon-master.png` is the master for every app icon (`exports/app/`, `exports/web/`, and the runtime copies). `saf0o-mark.svg` is the vector master for the marks and tray icons. Do not edit generated PNGs
or SVGs in `exports/` directly. Regenerate them with:

```sh
npm run brand:generate
npm run brand:verify
```

## Export map

- `exports/app/` — application icons from 16 to 1024px, Lanczos-resampled from
  the PNG master (`scripts/brand-resample.mjs`). A 96px master means 128px and
  up are upscaled. The plate reaches the canvas edges and keeps transparent
  rounded corners. To change the icon, replace the master and regenerate.
  `exports/mark/` and the social images still show the previous bird.
- `exports/mark/` — transparent full-color, monochrome-light, and
  monochrome-dark marks as SVG and PNG from 32 to 1024px.
- `exports/tray/` — optically corrected Windows color, macOS black template,
  and Linux light tray assets at native 24px and 48px source sizes.
- `exports/web/` — 16px and 32px favicons, a 180px Apple touch icon, and 192px
  and 512px web-app icons.
- `saf0o-brand-sheet.png` — visual proof of the family at full and native sizes.
- `source/saf0o-character-flat-reference.png` — approved generated concept kept
  as provenance only.

The generated runtime copies under `main/windows/` and `build/icons/` must be
byte-identical to the matching durable exports. macOS template icons are
intentionally black with transparency so the operating system can apply its
light or dark tint. Generate all release artwork from the vector master.
