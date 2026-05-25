# AE Template Comp Structure

## What Are Template Comps?

Template compositions are the **master layouts** inside the After Effects project. Each supported dimension (aspect ratio) has its own template comp. The pipeline duplicates these templates and swaps content per CSV row.

## Naming Convention

Template comps must follow this exact naming pattern:
```
{dimension}_PROMO_TEMPLATE
```

Examples:
- `16x9_PROMO_TEMPLATE` — 1920×1080 (HD landscape)
- `9x16_PROMO_TEMPLATE` — 1080×1920 (vertical/mobile/stories)
- `1x1_PROMO_TEMPLATE` — 1080×1080 (square/social)

## Layer Structure Inside a Template Comp

Each template comp contains these layers (top to bottom in AE timeline):

| Layer Name | Type | Purpose |
|-----------|------|---------|
| `SUBTITLE_TEXT` | Text layer | SRT subtitle display — driven by expression |
| `TUNE_IN_TEXT` | Text layer | "Watch on [date] at [time]" overlay |
| `EPISODE_INFO` | Text layer | Episode/season information |
| `SHOW_TITLE` | Text layer | Show name display |
| `CHANNEL_LOGO` | Footage/image | Region-specific channel logo (PNG) |
| `OPENER` | Footage/video | Region-specific intro clip (MOV with alpha) |
| `MONTH` | Text layer | Month name overlay (optional, for monthly promos) |
| `BACKGROUND` | Footage/solid | Background plate |

## How the Pipeline Interacts with Layers

The pipeline script finds layers **by name** using:
```javascript
var layer = comp.layer("CHANNEL_LOGO");
```

This is why layer naming must be exact. If a layer is named `Channel_Logo` instead of `CHANNEL_LOGO`, the script will throw a "layer not found" error.

### Text Layers
Text layers are updated by setting `layer.property("Source Text").setValue(newText)`:
```javascript
comp.layer("SHOW_TITLE").property("Source Text").setValue("Crime Patrol S3");
comp.layer("TUNE_IN_TEXT").property("Source Text").setValue("Watch 15 Dec, 9 PM");
```

### Footage Layers (Logo, Opener)
Footage layers are replaced by swapping their source:
```javascript
var newFile = new ImportOptions(new File("D:/Assets/North_CHANNEL_LOGO_16x9.png"));
var newFootage = app.project.importFile(newFile);
comp.layer("CHANNEL_LOGO").replaceSource(newFootage, false);
```

### SRT Expression Layer
The `SUBTITLE_TEXT` layer has an After Effects expression (not a script — an expression runs per-frame) that:
1. Reads an external `.srt` file path from a layer comment or text source data
2. Parses SRT timecodes at the current frame time
3. Displays the matching subtitle text

This is powerful because subtitles are **live-linked** — change the SRT file and the comp updates without re-running the pipeline.

## Creating a New Template Comp

1. Create a new comp with the target resolution (e.g., 1080×1920 for 9x16)
2. Name it exactly: `9x16_PROMO_TEMPLATE`
3. Add all required layers with exact names from the table above
4. Design the layout — position text, logo, opener as needed for that aspect ratio
5. Add the SRT expression to the `SUBTITLE_TEXT` layer
6. The pipeline will handle the rest

## Asset Folder Structure

The pipeline expects assets organised by region:
```
Assets/
├── North/
│   ├── North_generic_16x9_Alpha.mov
│   ├── North_generic_9x16_Alpha.mov
│   ├── North_festive_16x9_Alpha.mov
│   ├── North_CHANNEL_LOGO_16x9.png
│   ├── North_CHANNEL_LOGO_9x16.png
│   └── North_CHANNEL_LOGO_1x1.png
├── South/
│   ├── South_generic_16x9_Alpha.mov
│   └── ...
├── East/
└── West/
```

## Multi-Channel Support

Different channels can have different template comp structures. The UI panel loads a channel-specific pipeline script that knows:
- Which layers to expect
- What naming patterns to use
- Which AME preset to apply
- Any channel-specific logic (e.g., kids channels may have different text rules)
