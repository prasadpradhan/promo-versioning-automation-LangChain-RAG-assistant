# CSV Manifest — Structure and Usage

## What Is the CSV Manifest?

The CSV manifest is the **single source of truth** for each versioning run. Every row represents one unique output variant. The pipeline reads this file and generates one rendered video per row.

## Sample CSV Content

```csv
region,language,dimension,promo_title,episode_info,tune_in_date,tune_in_time,opener_type,srt_path,output_filename
North,Hindi,16x9,CrimePatrol_S3_Ep45,S3 Ep45,15 Dec 2024,9:00 PM,generic,D:/SRT/north_hindi.srt,North_Hindi_16x9_CrimePatrol_S3_Ep45.mp4
South,Tamil,16x9,CrimePatrol_S3_Ep45,S3 Ep45,15 Dec 2024,9:30 PM,festive,D:/SRT/south_tamil.srt,South_Tamil_16x9_CrimePatrol_S3_Ep45.mp4
North,Hindi,9x16,CrimePatrol_S3_Ep45,S3 Ep45,15 Dec 2024,9:00 PM,generic,D:/SRT/north_hindi.srt,North_Hindi_9x16_CrimePatrol_S3_Ep45.mp4
West,Marathi,1x1,CrimePatrol_S3_Ep45,S3 Ep45,16 Dec 2024,8:00 PM,generic,D:/SRT/west_marathi.srt,West_Marathi_1x1_CrimePatrol_S3_Ep45.mp4
```

## Column Reference

| Column | Required | Description | Example Values |
|--------|----------|-------------|----------------|
| `region` | Yes | Geographic region for asset/logo selection | North, South, East, West, International |
| `language` | Yes | Language for subtitle and text overlays | Hindi, Tamil, Telugu, Marathi, English |
| `dimension` | Yes | Aspect ratio — maps to template comp | 16x9, 9x16, 1x1 |
| `promo_title` | Yes | Show/content name — used in comp naming | CrimePatrol_S3_Ep45 |
| `episode_info` | No | Episode/season text for overlay | S3 Ep45, New Episode, Grand Finale |
| `tune_in_date` | No | Air date for tune-in text | 15 Dec 2024 |
| `tune_in_time` | No | Air time for tune-in text | 9:00 PM, 8:30 PM IST |
| `opener_type` | No | Which intro clip variant to use | generic, festive, weekend, special |
| `srt_path` | No | Full path to SRT subtitle file | D:/SRT/north_hindi.srt |
| `output_filename` | Yes | Final rendered file name | North_Hindi_16x9_CrimePatrol.mp4 |

## How to Create a CSV for a New Campaign

1. Open Excel or Google Sheets
2. Create columns matching the header row above
3. Add one row per variant you need
4. For a typical campaign: Regions × Dimensions × Languages = total rows
   - Example: 4 regions × 3 dimensions × 3 languages = 36 variants
5. Save/export as `.csv` (UTF-8 encoding recommended for non-Latin scripts)

## Common CSV Issues and Fixes

| Issue | Symptom | Fix |
|-------|---------|-----|
| Comma inside a field | Columns shift — data misaligned | Wrap field in double quotes: `"Crime, Patrol"` |
| Unicode characters (Hindi/Tamil text) | Garbled text in AE | Save CSV as UTF-8 with BOM |
| Empty rows at bottom | Pipeline tries to process blank rows | Remove trailing empty rows |
| Windows path backslashes | SRT path fails | Use forward slashes `D:/SRT/file.srt` or double backslash `D:\\SRT\\file.srt` |
| Missing required column | Script error on startup | Check header row matches expected columns exactly |

## CSV Best Practices

- Keep filenames short and alphanumeric — avoid spaces and special characters
- Use consistent region/language naming across campaigns
- Validate the CSV before running the pipeline (the panel does basic validation)
- Keep a master template CSV and duplicate it for each new campaign
- The `output_filename` column should be unique per row — duplicates will overwrite
