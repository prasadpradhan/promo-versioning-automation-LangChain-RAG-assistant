# AE Promo Versioning Pipeline — Project Overview

## What Is This Project?

This is a **CSV-driven promo versioning automation system** for Adobe After Effects (AE). It takes a single master promo template and automatically generates multiple regional, dimensional, and language variants — all driven by a CSV manifest file.

Built for OTT and broadcast environments where a single promo campaign might need 50–200+ unique output files across different regions, aspect ratios, and languages.

## The Problem It Solves

In a typical broadcast/OTT operation, a single promo needs to be delivered in:
- Multiple **regions** (e.g., North, South, East, West India — or international markets)
- Multiple **dimensions** (16:9 HD, 9:16 vertical/mobile, 1:1 square for social)
- Multiple **languages** (Hindi, Tamil, Telugu, Marathi, etc.)
- With region-specific **logos**, **SRT subtitles**, **text overlays**, and **opener/closer clips**

Doing this manually means an editor opens the AE project, swaps assets, re-renders — repeat 100+ times per campaign. This pipeline reduces that to: fill a CSV → click a button → walk away.

## Scale

- Handles **1,000+ promo variants per month** in production
- Each variant renders independently via Adobe Media Encoder (AME)
- Saved approximately **₹3.9 lakh per channel per year** in manual production costs
- Featured in an **Adobe India case study** citing the developer by name

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Scripting | Adobe ExtendScript (ES3-based JavaScript) |
| UI | ScriptUI (AE's native UI framework) |
| IPC | BridgeTalk (inter-app communication AE ↔ AME) |
| Data Input | CSV manifest files |
| Rendering | Adobe Media Encoder (AME) via BridgeTalk |
| Subtitles | SRT file injection via AE expressions |
| OS | Windows 10/11 |
| AE Versions | Tested on AE 2020–2024 |

## Architecture (High Level)

```
CSV Manifest → UI Panel (ScriptUI) → Pipeline Core Script
                                          ↓
                              For each row in CSV:
                                1. Duplicate template comp
                                2. Swap region-specific assets
                                3. Apply text/subtitle overlays
                                4. Set output path & filename
                                5. Queue in AME via BridgeTalk
                                          ↓
                              AME renders all queued comps
```

## Key Files

| File | Purpose |
|------|---------|
| `ae_promo_versioning_panel.jsx` | ScriptUI panel — the user-facing interface. Channel selector, CSV loader, render trigger. |
| `ae_promo_pipeline_core.jsx` | The engine — reads CSV, duplicates comps, swaps assets, queues renders. |
| `sample_data/promo_manifest_sample.csv` | Example CSV showing the expected column structure. |
| `README.md` | Setup instructions, column reference, customisation guide. |
