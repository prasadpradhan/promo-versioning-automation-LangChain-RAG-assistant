# Troubleshooting Guide

## Common Errors and Solutions

### 1. "Template comp not found" Error
**Cause:** The dimension value in CSV doesn't match any comp name in the AE project.
**Fix:** Check that:
- CSV `dimension` column has values like `16x9`, `9x16`, `1x1` (no spaces)
- AE project has comps named exactly `16x9_PROMO_TEMPLATE`, etc.
- Case matches — ExtendScript is case-sensitive for comp names

### 2. BridgeTalk Fails — AME Not Responding
**Cause:** Adobe Media Encoder is not running or is in a busy state.
**Fix:**
- Launch AME manually before running the pipeline
- Wait for AME to fully load (splash screen gone)
- If AME is stuck, close and reopen it
- Check AME version compatibility — `BEMediaEncoder` works in AME 2021, newer versions use `app.getFrontend()`

### 3. CSV Parsing Shows Wrong Data
**Cause:** Commas inside field values without proper quoting.
**Fix:** Wrap any field containing commas in double quotes in the CSV:
```csv
"Show Title, Season 3",North,Hindi,16x9
```

### 4. SRT Subtitles Not Displaying
**Cause:** The SRT expression can't find the file path or the path format is wrong.
**Fix:**
- Use forward slashes in paths: `D:/SRT/file.srt` not `D:\SRT\file.srt`
- Ensure the SRT file exists at the exact path
- Check SRT format — must be standard SubRip format with sequential numbering
- Verify AE's "Allow Scripts to Write Files" is enabled in Preferences > Scripting

### 5. "Layer not found" Error
**Cause:** Layer name in the template comp doesn't match what the script expects.
**Fix:** Open the template comp and verify layer names exactly match:
`SUBTITLE_TEXT`, `TUNE_IN_TEXT`, `EPISODE_INFO`, `SHOW_TITLE`, `CHANNEL_LOGO`, `OPENER`, `MONTH`

### 6. Output Files Overwriting Each Other
**Cause:** Duplicate `output_filename` values in the CSV.
**Fix:** Ensure every row has a unique output filename. Use the naming pattern:
`Region_Language_Dimension_PromoTitle.mp4`

### 7. Hindi/Tamil Text Appears Garbled
**Cause:** CSV not saved in UTF-8 encoding.
**Fix:** In Excel: Save As > CSV UTF-8 (Comma delimited). In Google Sheets: Download as CSV (automatically UTF-8).

### 8. Pipeline Processes But Renders Are Black/Empty
**Cause:** Asset files (MOV, PNG) failed to import silently.
**Fix:**
- Check asset file paths in CSV are correct
- Verify MOV files have alpha channel if expected (ProRes 4444, Animation codec)
- Check that PNG files are not corrupted
- Look at the log for any "import failed" warnings

### 9. AE Crashes During Large Batch
**Cause:** Memory exhaustion — too many comps created without purging.
**Fix:**
- Run in batches of 50 variants max
- Enable "Purge memory after each comp" in pipeline settings if available
- Close other Adobe apps during batch runs
- Ensure at least 32GB RAM for batches over 100 variants

### 10. Script Won't Load as Dockable Panel
**Cause:** File not in the correct ScriptUI Panels folder.
**Fix:** Place the panel JSX file in:
```
C:\Program Files\Adobe\Adobe After Effects [version]\Support Files\Scripts\ScriptUI Panels\
```
Then restart AE. The panel appears under Window menu.

## Performance Tips

- **SSD/NVMe storage** for project files and assets dramatically speeds up import
- **32GB+ RAM** recommended for batch operations
- **Close Premiere Pro** if open — it competes with AME for resources
- **Render overnight** for large campaigns (100+ variants)
- **Pre-import all assets** into the AE project before running the pipeline — avoids repeated disk reads
