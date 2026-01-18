# Extension Icons

Place your extension icons here:

- `icon-16.png` - 16x16 pixels (toolbar icon)
- `icon-32.png` - 32x32 pixels (Windows taskbar)
- `icon-48.png` - 48x48 pixels (extension management page)
- `icon-128.png` - 128x128 pixels (Chrome Web Store, installation)

## Design Guidelines

- Use a simple, recognizable design
- Works well at small sizes
- Consistent with the MarkSyncr brand
- Transparent background recommended

## Generating Icons

You can use tools like:

- Figma
- Adobe Illustrator
- GIMP
- Online icon generators

Or generate from an SVG using ImageMagick:

```bash
# From an SVG source
convert -background none icon.svg -resize 16x16 icon-16.png
convert -background none icon.svg -resize 32x32 icon-32.png
convert -background none icon.svg -resize 48x48 icon-48.png
convert -background none icon.svg -resize 128x128 icon-128.png
```
