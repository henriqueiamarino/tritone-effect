# Tritone Effect

A Gutenberg block-editor filter that adds a third color stop to Duotone — shadow, midtone, highlight — without losing the original image. This repository is a working prototype intended to support an implementation discussion in the [Gutenberg](https://github.com/WordPress/gutenberg) repository.

> **Status:** Prototype. Not a polished plugin. Ships as a no-build single-file plugin so it can be inspected, run, and modified in seconds.

> **Upstream:** Draft PR for inclusion in core Gutenberg: [WordPress/gutenberg#78167](https://github.com/WordPress/gutenberg/pull/78167). This repo remains the fastest way to try the effect in a regular WordPress install.

## Demo

**Toolbar dropdown**
Pick a preset or fine-tune each stop from the block toolbar — same flow as Duotone.

https://github.com/user-attachments/assets/23c62863-fd01-4f10-b080-4561d208896e

**Styles panel**
Or reach the same controls from the Styles tab in the block inspector.

https://github.com/user-attachments/assets/8411271c-5e68-43aa-878c-2ac59574aa1b

## What it does

- Adds a **Tritone** toolbar button to Image, Cover, Site Logo, Post Featured Image, and Avatar blocks — the same set Duotone supports.
- Renders a panel that mirrors Duotone's UI (presets, color stops, clear) using Gutenberg's own component classes so spacing, sizing, hover, and selection states match pixel-for-pixel.
- Reads presets from `theme.json` so themes can ship their own palettes.
- Renders the effect on the front end via an SVG `feComponentTransfer` filter — the same primitive Duotone uses, with one extra stop in `tableValues`.

## Why this approach

Tritone is a clean superset of Duotone, not a parallel feature. The data shape (`colors[]`) and the rendering primitive (`feComponentTransfer` with a `table`-type function) are identical to Duotone's; the only change is the number of stops in `tableValues`. This is why the prototype is small (~400 lines total) and why an upstream implementation would touch a narrow surface.

**Why three stops, not N.** Photographers describe tonal range with three names — shadows, midtones, highlights. They're the regions the human eye actually parses in an image, and they map cleanly to the luminance buckets a `feComponentTransfer` table addresses. Three stops is the smallest extension to Duotone that adds expressive range without surrendering this mental model. Generalizing to N stops would gain technical flexibility but lose the named-stop UX that makes Duotone learnable; this prototype deliberately stops at three.

Tritone is positioned as an **upgrade** to the existing filter, not a replacement. Duotone stays available as a deliberate two-tone artistic choice.

## Quick start

```bash
cd path/to/wp-content/plugins
git clone <repo-url> tritone-effect
```

Activate **Tritone Effect** in `Plugins → Installed Plugins`. No build step, no dependencies — the plugin uses the `wp.*` globals already available in the editor.

Open any image block and you'll see a new ink-drop icon in the toolbar next to **Replace**.

## Defining presets

By default the plugin ships five built-in presets so it works out of the box. Themes can override them via `theme.json`:

```json
{
  "version": 3,
  "settings": {
    "custom": {
      "tritone": [
        {
          "slug":   "blue-dusk",
          "name":   "Blue Dusk",
          "colors": ["#001133", "#00BFFF", "#FF3333"]
        },
        {
          "slug":   "ember-glow",
          "name":   "Ember Glow",
          "colors": ["#0D0221", "#B5451B", "#F5C518"]
        }
      ]
    }
  }
}
```

The `colors` array is `[shadow, midtone, highlight]`, mirroring Duotone's existing `colors[]` convention. The `custom.tritone` location is provisional — if this lands in core it should probably move to `settings.color.tritone` for consistency with `settings.color.duotone`.

## How the filter works

For a given block instance the plugin emits an inline SVG filter:

```xml
<filter id="te-XXXXXXXX" color-interpolation-filters="sRGB">
  <feColorMatrix type="saturate" values="0" result="gray"/>
  <feComponentTransfer in="gray">
    <feFuncR type="table" tableValues="<sR> <mR> <hR>"/>
    <feFuncG type="table" tableValues="<sG> <mG> <hG>"/>
    <feFuncB type="table" tableValues="<sB> <mB> <hB>"/>
  </feComponentTransfer>
</filter>
```

The image is desaturated to luminance, then each channel is mapped through a 3-point lookup table. The mapping is identical to Duotone's, with one additional stop. The filter is applied via a CSS rule scoped to the block instance (`[data-block="<clientId>"]`) so multiple tritones — or a tritone alongside a duotone — coexist on the same page without interference.

## Open questions for the discussion

These are the API decisions the upstream PR will need answers for. The prototype takes a position on each, but none are settled:

- **Midtone position.** Fixed at 50% (current) or a configurable stop position?
- **Naming.** Worth raising even if it feels late: rename the existing **Duotone** control to **Recolor** as a more accurate umbrella name for what is, technically, a tonal-mapping filter. **Tritone** then sits inside it as the 3-stop variant; Duotone-style 2-stop presets remain available as an artistic choice within the same control. *Why "Recolor" specifically:* it reads as an action a non-technical user understands, it's already a familiar verb in design tools, and it avoids the technical baggage of alternatives like "Color grading" or "Tonemap." If a rename is too disruptive at this point, the fallback is keeping "Duotone" and "Tritone" as sibling toolbar entries.
- **Coexistence with Duotone.** If the rename above doesn't land: separate toolbar entry (current) or unified toggle?
- **theme.json shape.** `settings.color.tritone` for consistency with `settings.color.duotone` is the obvious target.
- **Block coverage.** Same five blocks as Duotone, or extend (e.g. Group with background image)?

## File layout

```
tritone-effect/
├── tritone-effect.php   # Plugin bootstrap + frontend SVG filter rendering
├── editor.js            # Block editor integration (toolbar + sidebar + preview)
└── README.md            # This file
```

## License

GPL-2.0-or-later, same as WordPress.
