# Overturn — Brand Kit

## The Logo

The mark is a two-tone diagonal-split "o" — upper-right in navy, lower-left in emerald — that *is* the leading letter of the wordmark. The diagonal cut reads as a state change: the moment a claim flips from denied to recovered. The same mark stands alone as the favicon and app icon so the brand is recognizable across every surface.

## Files

| File | Use |
|------|-----|
| `overturn-logo.svg` | Primary horizontal logo for light backgrounds (website header, business cards, deck cover slides) |
| `overturn-logo-dark.svg` | Same lockup with the wordmark in white, for dark backgrounds |
| `overturn-mark.svg` | Just the split "o" on a transparent background — for spots where the wordmark would be redundant |
| `overturn-mark-dark.svg` | Mark with white + emerald, for dark backgrounds |
| `overturn-favicon.svg` | Split "o" on a rounded navy tile — favicon, app icon, social profile picture |
| `overturn-favicon-{16,32,48,64,192,512}.png` | Rasterized favicons for `<link rel="icon">` and `apple-touch-icon` |
| `overturn-logo.png`, `overturn-logo-dark.png`, `overturn-mark.png` | 1400-px-wide / 512-px PNG rasters for places that don't accept SVG |
| `overturn-preview.png` | At-a-glance showcase — keep this one in your investor folder |

The SVGs reference the **Inter** typeface with `Helvetica Neue → Arial` fallbacks. Before final production handoff, outline the wordmark text in Figma (*Type → Outline Stroke*) or Illustrator (*Type → Create Outlines*) so the logo renders identically regardless of which fonts the viewer has installed.

## Colors

| Role | Hex | Use |
|------|-----|-----|
| Navy (primary) | `#0B1F3A` | Wordmark, body text, the upper-right half of the mark, dark backgrounds |
| Emerald (accent) | `#10B981` | The lower-left half of the mark — *the turn*. Used sparingly elsewhere to signal action / recovery / a positive outcome |
| White | `#FFFFFF` | Backgrounds, reversed wordmark on dark surfaces |
| Slate (muted) | `#7A8599` | Captions, secondary UI text |
| Ice (surface) | `#E8EDF5` | Light background panels, section dividers |

Follow a 60/30/10 rule: navy dominates (60% visual weight), white surfaces (30%), emerald only on action moments (10%).

## Typography

- **Wordmark / display headings:** Inter, weight 800, tight letter-spacing (-2.4 to -2.6)
- **Body:** Inter or Helvetica Neue, weight 400/500
- **Captions:** weight 400, color slate

## Tone of voice

*Calm, competent, no-jargon. We do the boring work so doctors don't have to.* Avoid AI clichés — no robots, no glowing brains, no neural-network meshes, no "sparkles" emojis. Healthcare buyers trust serious typography over hype.

## Web usage

```html
<!-- favicons -->
<link rel="icon" type="image/svg+xml" href="/overturn-favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/overturn-favicon-32.png" />
<link rel="icon" type="image/png" sizes="192x192" href="/overturn-favicon-192.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/overturn-favicon-192.png" />

<!-- header -->
<img src="/overturn-logo.svg" alt="Overturn" height="40" />

<!-- dark-mode header -->
<img src="/overturn-logo-dark.svg" alt="Overturn" height="40" />
```

## Files you can ignore / delete

These were earlier alternative concepts that didn't get picked. Safe to delete:

- `alt1-*` — wordmark-with-period direction
- `alt2-*` — emerald-leading-"o" direction
- `alt3-*` — split-mark-beside-wordmark direction (the diagonal mark concept is now integrated into the main logo)
- `overturn-wordmark.{svg,png}` — wordmark-only version from the first pass
- `overturn-comparison.png` — the three-way comparison sheet
- `overturn-logo-dark-preview.png` — old preview from the spinner version
