# Pipeline Core Script — ae_promo_pipeline_core.jsx

## Purpose

This is the **engine** of the versioning system. It reads parsed CSV data, manipulates After Effects compositions and layers, and queues renders to Adobe Media Encoder.

## Core Workflow (Per CSV Row)

For every row in the CSV manifest, the script performs these steps:

### Step 1: Template Comp Lookup
Finds the master template composition based on the dimension value from the CSV:
```
dimension + "_PROMO_TEMPLATE"
→ e.g., "16x9_PROMO_TEMPLATE", "9x16_PROMO_TEMPLATE", "1x1_PROMO_TEMPLATE"
```
The AE project must contain pre-built template comps for each supported dimension.

### Step 2: Duplicate Comp
Creates a copy of the template comp with a unique name derived from CSV fields:
```
Region + "_" + Language + "_" + Dimension + "_" + PromoTitle
→ e.g., "North_Hindi_16x9_ShowName_S2_Ep12"
```

### Step 3: Asset Swapping
Inside the duplicated comp, the script replaces placeholder layers with region/language-specific assets:

- **Opener clip**: Region-specific intro video
  - Path pattern: `Region + "_" + openerType + "_" + dimension + "_Alpha.mov"`
- **Channel logo**: Region-specific logo PNG
  - Path pattern: `Region + "_CHANNEL_LOGO_" + dimension + ".png"`
- **Text layers**: Show title, episode info, time/date, tune-in text
- **SRT subtitles**: Injected via AE expressions that read `.srt` files at render time

### Step 4: Expression-Based SRT Injection
Instead of hard-coding subtitle text, the script writes an AE expression on text layers that reads an external `.srt` file. This means:
- Subtitles update automatically if the SRT file changes
- No re-rendering needed for subtitle corrections
- Multiple languages can use the same comp by swapping the SRT path

The expression parses SRT timecodes and displays the correct subtitle text at the correct frame.

### Step 5: Output Path Construction
Builds the output file path from CSV fields:
```
outputRoot / Region / Dimension / FileName.mp4
```
Creates directory structure if it doesn't exist.

### Step 6: BridgeTalk IPC to AME
Uses BridgeTalk to send the comp to Adobe Media Encoder:
```javascript
var bt = new BridgeTalk();
bt.target = "ame";  // Adobe Media Encoder
bt.body = buildAMEScript(comp, outputPath, preset);
bt.send();
```

The `buildAMEScript()` function generates an ExtendScript string that AME executes to:
1. Add the comp to the render queue
2. Apply the specified encoding preset (H.264, ProRes, etc.)
3. Set the output path
4. Start rendering (or queue for batch)

## BridgeTalk IPC — How It Works

BridgeTalk is Adobe's inter-process communication system. It lets one Adobe app send ExtendScript code to another app for execution.

```
After Effects (sender)  →  BridgeTalk message  →  Media Encoder (receiver)
     "Queue this comp"                               "Added to queue"
```

Key considerations:
- AME must be running before sending BridgeTalk messages
- Messages are asynchronous — the script doesn't wait for AME to finish rendering
- The `bt.onResult` callback can capture AME's response
- AME API changed between versions: `BEMediaEncoder` (AME 2021) vs `app.getFrontend()` (newer)

## CSV Column Mapping

The pipeline expects these columns in the CSV (mapped to variables):

| CSV Column | Variable | Used For |
|-----------|----------|----------|
| region | region | Asset folder lookup, output path |
| language | lang | Subtitle file selection |
| dimension | dim | Template comp selection (16x9, 9x16, 1x1) |
| promo_title | title | Comp naming, text layer |
| episode_info | epInfo | Episode number/season text |
| tune_in_date | tuneDate | Air date text overlay |
| tune_in_time | tuneTime | Air time text overlay |
| opener_type | openerType | Which intro clip to use |
| srt_path | srtPath | Path to subtitle file |
| output_filename | outFile | Final rendered filename |

## Error Recovery

- If a template comp is not found → logs error, skips row, continues
- If an asset file is missing → logs warning, uses placeholder, continues
- If BridgeTalk to AME fails → logs error, suggests checking if AME is running
- All errors are caught by `$.global.safeError()` to prevent pipeline halt

## Performance Notes

- Comp duplication is fast (~0.5s per comp)
- Asset replacement depends on file size (large MOV files take longer to import)
- BridgeTalk message sending is near-instant
- Actual rendering time depends on comp duration and AME preset
- For 50 variants: pipeline setup takes ~2-3 minutes, rendering takes 30-90 minutes depending on complexity
