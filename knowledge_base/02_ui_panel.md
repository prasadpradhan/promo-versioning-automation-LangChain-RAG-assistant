# UI Panel Script — ae_promo_versioning_panel.jsx

## Purpose

This is the **user-facing ScriptUI panel** that runs inside Adobe After Effects. It provides a GUI for operators to:
1. Select a channel/brand from a dropdown
2. Browse and load a CSV manifest file
3. Trigger the versioning pipeline
4. Monitor progress via a log area

## How It Works

### Channel Selection
The panel has a dropdown populated from `CHANNEL_LIST` — an array of channel/brand names. Each channel maps to a specific pipeline script file via `CHANNEL_SCRIPT_MAP`:

```javascript
var CHANNEL_LIST = ["Network_A", "OTT_Platform", "Linear_HD", "Kids_Channel"];

var CHANNEL_SCRIPT_MAP = {
    "Network_A":    "ae_promo_pipeline_network_a.jsx",
    "OTT_Platform": "ae_promo_pipeline_core.jsx",
    "Linear_HD":    "ae_promo_pipeline_linear_hd.jsx",
    "Kids_Channel": "ae_promo_pipeline_kids.jsx"
};
```

When the user selects a channel, the panel dynamically loads the corresponding pipeline script using `$.evalFile()`. This allows each channel to have its own naming conventions, asset paths, and comp structures.

### CSV Loading
The "Browse CSV" button opens a file dialog filtered to `.csv` files. Once selected, the panel:
1. Reads the file using ExtendScript's `File` object
2. Parses it line-by-line using a custom `parseCSVLine()` function that handles quoted fields
3. Validates the header row against expected columns
4. Stores parsed rows in a global array `$.global.manifestData`

### Render Trigger
The "Run Pipeline" button calls the main function from the loaded pipeline script, passing the parsed CSV data. It iterates through each row and:
- Creates/duplicates comps
- Swaps assets per row data
- Queues each comp to AME

### Logging
A multiline `edittext` area shows real-time progress. The `logMessage()` function appends timestamped entries:
```
[2024-12-15 14:32:05] Processing row 1/50: Region=North, Dimension=16x9
[2024-12-15 14:32:07] Comp duplicated: North_Hindi_16x9_PromoName
[2024-12-15 14:32:08] Queued to AME: D:/Output/North_Hindi_16x9_PromoName.mp4
```

### Error Handling
The panel uses `$.global.safeError()` — a wrapper that catches ExtendScript errors and logs them without crashing the entire pipeline. If one row fails, it logs the error and continues to the next row.

## How to Customise for a New Channel

1. Duplicate `ae_promo_pipeline_core.jsx` and rename it for the new channel
2. Adjust layer names, column mappings, and naming conventions inside the new file
3. Add the channel name to `CHANNEL_LIST`
4. Add the mapping to `CHANNEL_SCRIPT_MAP`
5. No changes needed to the panel itself — it's fully data-driven

## Key Global Variables

| Variable | Purpose |
|----------|---------|
| `$.global.manifestData` | Parsed CSV rows (array of objects) |
| `$.global.projectRoot` | Path to the AE project folder |
| `$.global.outputRoot` | Root output directory for rendered files |
| `$.global.logArea` | Reference to the ScriptUI log text area |
| `$.global.safeError` | Error wrapper function |

## ScriptUI Panel vs Script

This file is designed to run as a **dockable panel** (Window > Extensions) rather than a one-shot script. The difference:
- Panel: persistent UI, stays open while AE is running
- Script: runs once and closes

To install as a panel, place the `.jsx` file in:
```
C:\Program Files\Adobe\Adobe After Effects [version]\Support Files\Scripts\ScriptUI Panels\
```
