// =============================================================================
// AE PROMO PIPELINE — CORE (OTT / Multi-region example)
// Adobe After Effects ExtendScript  |  Loaded by ae_promo_versioning_panel.jsx
//
// PURPOSE:
//   Reads a structured CSV manifest, duplicates template compositions in an
//   After Effects project, swaps asset layers, applies SRT subtitles via
//   expression, and queues the output in Adobe Media Encoder through
//   BridgeTalk IPC.
//
// CSV COLUMN CONVENTION (0-indexed):
//   [0]  Comp/Promo Title        — name of the duplicate comp
//   [1]  Duration (ss.ff)        — e.g. "30.00"
//   [2]  Region / Territory      — e.g. "IN", "US", "AE"
//   [3]  Dimension / Format      — e.g. "H" (horizontal), "V" (vertical), "S" (square)
//   [4]  Title Text              — text injected into TITLE layer
//   [5]  Clean Promo Path        — absolute path to video file
//   [6]  Content Rating          — e.g. "U", "UA", "TV14"
//   [7]  Opener Type             — e.g. "COUNTDOWN", "PREMIERE", "GENERIC"
//   [8]  Show Logo Path          — (reserved — extend as needed)
//   [9]  End Date                — text for DATE layer on endpage
//   [10] End Month               — text for MONTH layer on endpage
//   [11] SRT File Path           — optional; leave blank to disable subtitles
//
// TEMPLATE NAMING CONVENTION (create comps in AE to match):
//   Comp   : <Dimension>_PROMO_TEMPLATE    e.g. "H_PROMO_TEMPLATE"
//   Layers : OPENER, CLEAN_PROMO, TITLE, RATING, CHANNEL_BUG,
//             DATE, MONTH, SUBTITLE_REF, Shape Layer 1-4,
//             LEFT_SLIDER, RIGHT_SLIDER, ENDPAGE_ELEMENTS
//
// ASSET NAMING CONVENTION (footage items imported into AE project):
//   Opener  : <Region>_<OpenerType>_<Dimension>_Alpha.mov
//             e.g. "IN_COUNTDOWN_H_Alpha.mov"
//   Logo    : <Region>_CHANNEL_LOGO_<Dimension>.png
//             e.g. "IN_CHANNEL_LOGO_H.png"
//   Rating  : <Dimension>_<Rating>.png
//             e.g. "H_U.png"
//
// MARKER CONVENTION (on CLEAN_PROMO layer):
//   ENDPAGE_IN   — marker comment, marks start of endpage
//   ENDPAGE_OUT  — marker comment, marks end of endpage
//
// EXPOSES (required by panel):
//   $.global.importCSV()
//   $.global.createVersions()
//   $.global.exportMXF()
//
// =============================================================================


// =============================================================================
// UTILITY — CEP panel bridge logger (silent fallback)
// =============================================================================

function cepLog(msg) {
    try { app.setSDKEventMessage(msg, "info"); } catch(e) {}
}


// =============================================================================
// UTILITY — CSV time parser  (ss.ff  →  seconds as float)
// =============================================================================

function parseCSVTime(csvValue, fps) {
    if (!csvValue || csvValue === "") return 0;
    var parts   = csvValue.split(".");
    var seconds = parseInt(parts[0], 10) || 0;
    var frames  = (parts.length > 1) ? parseInt(parts[1], 10) : 0;
    if (isNaN(frames)) frames = 0;
    return seconds + (frames / fps);
}


// =============================================================================
// UTILITY — Clean file path read from CSV cell
// Strips BOM, wrapping quotes, leading/trailing whitespace, back-slashes.
// =============================================================================

function cleanCSVPath(rawPath) {
    if (!rawPath) return "";
    rawPath = rawPath.replace(/[\u200B-\u200D\uFEFF]/g, ""); // BOM / zero-width chars
    rawPath = rawPath.replace(/^"+|"+$/g, "");               // wrapping double-quotes
    rawPath = rawPath.replace(/^\s+|\s+$/g, "");             // whitespace trim
    rawPath = rawPath.replace(/\\/g, "/");                   // normalise to forward slashes
    return rawPath;
}


// =============================================================================
// UTILITY — Auto-detect CSV delimiter from header line
// =============================================================================

function detectDelimiter(headerLine) {
    var commas     = headerLine.split(",").length  - 1;
    var semicolons = headerLine.split(";").length  - 1;
    var tabs       = headerLine.split("\t").length - 1;

    $.global.log("Delimiter scan — commas: " + commas +
                 " | semicolons: " + semicolons + " | tabs: " + tabs);

    if (semicolons > commas && semicolons > tabs) {
        $.global.log("Semicolon delimiter detected (Mac/EU locale)");
        return ";";
    }
    if (tabs > commas && tabs > semicolons) {
        $.global.log("Tab delimiter detected");
        return "\t";
    }
    return ","; // default — standard comma
}


// =============================================================================
// UTILITY — Layer marker lookup  (returns time in seconds or null)
// =============================================================================

function getMarkerTime(layer, markerName) {
    var markers = layer.property("Marker");
    for (var i = 1; i <= markers.numKeys; i++) {
        if (markers.keyValue(i).comment === markerName) {
            return markers.keyTime(i);
        }
    }
    return null;
}


// =============================================================================
// FOOTAGE CACHE
// Caches all FileSource FootageItems by name for fast lookup.
// Always rebuilt before processing to avoid stale references.
// =============================================================================

var FOOTAGE_CACHE = {};

function buildFootageCache() {
    FOOTAGE_CACHE = {};
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it instanceof FootageItem && it.mainSource instanceof FileSource) {
            FOOTAGE_CACHE[it.name] = it;
        }
    }
    $.global.log("Footage cache built — " + countKeys(FOOTAGE_CACHE) + " items");
}

function countKeys(obj) {
    var n = 0;
    for (var k in obj) { if (obj.hasOwnProperty(k)) n++; }
    return n;
}

function findFootageByName(name) {
    return FOOTAGE_CACHE[name] || null;
}


// =============================================================================
// UTILITY — Replace a named layer's source footage
// =============================================================================

function replaceLayerByFootageName(comp, layerName, footageName) {
    var layer = comp.layer(layerName);
    if (!layer) {
        $.global.log("Layer not found in comp: " + layerName);
        return false;
    }

    var footage = findFootageByName(footageName);
    if (!footage) {
        $.global.log("Footage not in project cache: [" + footageName + "]");
        $.global.log("  Check spelling, that the file is imported, and rebuild cache.");
        return false;
    }

    $.global.log("Replacing '" + layerName + "' source → " + footageName);
    layer.replaceSource(footage, false);
    $.global.log("replaceSource done: " + layerName);
    return true;
}


// =============================================================================
// SUBTITLE SYSTEM
// Reads style from a reference layer named SUBTITLE_REF in the template comp.
// Writes a time-keyed expression onto that layer from an SRT file.
// =============================================================================

function parseSRTTimecode(h, m, s, ms) {
    return (parseInt(h,10)  * 3600) +
           (parseInt(m,10)  * 60)   +
            parseInt(s,10)          +
           (parseInt(ms,10) / 1000);
}

function parseSRTFile(srtFilePath) {
    try {
        var srtFile = new File(srtFilePath);
        if (!srtFile.exists) {
            $.global.log("SRT file not found: " + srtFilePath);
            return null;
        }

        srtFile.encoding = "UTF-8";
        srtFile.open("r");
        var content = srtFile.read();
        srtFile.close();

        // Normalise encoding and line endings
        content = content.replace(/^\uFEFF/, "");
        content = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        var blocks    = content.split(/\n\n/);
        var subtitles = [];

        for (var i = 0; i < blocks.length; i++) {
            var block = blocks[i].replace(/^\s+|\s+$/g, "");
            if (!block) continue;

            var lines = block.split("\n");
            if (lines.length < 3) continue;

            var tc = lines[1].match(
                /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
            );
            if (!tc) continue;

            var text = [];
            for (var j = 2; j < lines.length; j++) text.push(lines[j]);

            subtitles.push({
                inTime  : parseSRTTimecode(tc[1], tc[2], tc[3], tc[4]),
                outTime : parseSRTTimecode(tc[5], tc[6], tc[7], tc[8]),
                text    : text.join("\n")
            });
        }

        $.global.log("SRT parsed — " + subtitles.length + " entries | " +
                     "first inTime: " + subtitles[0].inTime.toFixed(3) + "s");
        return subtitles;

    } catch (err) {
        $.global.log("SRT parse error: " + err.toString());
        return null;
    }
}

/**
 * Applies SRT subtitles to the SUBTITLE_REF layer in a comp using an expression.
 *
 * srtOffset:
 *   "auto"    — subtracts the first subtitle's inTime (episode-origin SRT)
 *   <number>  — subtracts the given number of seconds
 *   undefined — treated as "auto"
 */
function addSubtitlesToComp(comp, srtFilePath, srtOffset) {
    var refLayer = null;
    try { refLayer = comp.layer("SUBTITLE_REF"); } catch(e) {}

    if (!refLayer) {
        $.global.log("SUBTITLE_REF layer not found in: " + comp.name);
        return;
    }

    var subtitles = parseSRTFile(srtFilePath);
    if (!subtitles || subtitles.length === 0) {
        $.global.log("No subtitles parsed — disabling SUBTITLE_REF");
        refLayer.enabled = false;
        return;
    }

    // Resolve time offset
    var offset = 0;
    if (srtOffset === "auto" || srtOffset === undefined) {
        offset = subtitles[0].inTime;
        $.global.log("SRT offset (auto): " + offset.toFixed(3) + "s");
    } else if (typeof srtOffset === "number") {
        offset = srtOffset;
        $.global.log("SRT offset (manual): " + offset.toFixed(3) + "s");
    }

    // Warn if subtitle range falls outside comp
    var adjFirst = subtitles[0].inTime - offset;
    var adjLast  = subtitles[subtitles.length - 1].outTime - offset;
    if (adjFirst < 0 || adjLast > comp.duration) {
        $.global.log("WARNING — subtitle range (" + adjFirst.toFixed(2) + "s → " +
                     adjLast.toFixed(2) + "s) vs comp duration (" +
                     comp.duration.toFixed(2) + "s). Check srtOffset.");
    }

    // Build and apply expression
    try {
        var textProp = refLayer.property("Source Text");
        var expr     = "var t = time;\nvar text = \"\";\n\n";

        for (var i = 0; i < subtitles.length; i++) {
            var sub  = subtitles[i];
            var inT  = sub.inTime  - offset;
            var outT = sub.outTime - offset;
            if (outT < 0 || inT > comp.duration) continue;
            var esc  = sub.text.replace(/"/g, "\\\"").replace(/\n/g, "\\n");
            expr += "if (t >= " + inT.toFixed(4) + " && t <= " + outT.toFixed(4) + ") {\n";
            expr += "  text = \"" + esc + "\";\n}\n";
        }
        expr += "\ntext;";

        textProp.expression = expr;
        refLayer.enabled    = true;
        $.global.log(subtitles.length + " subtitles applied to SUBTITLE_REF in: " + comp.name);

    } catch (err) {
        $.global.log("Expression error on SUBTITLE_REF: " + err.toString());
        refLayer.enabled = false;
    }
}


// =============================================================================
// GLOBAL VARIABLE DECLARATIONS (shared with panel via $.global)
// =============================================================================

$.global.csvFile   = null;
$.global.csvData   = [];
$.global.thisCSVrow = null;
$.global.newComp   = null;
$.global.templateComp = null;
$.global.region    = null;
$.global.dimension = null;
$.global.openerType = null;


// =============================================================================
// importCSV()
// Opens a file dialog, reads the CSV with cross-platform line-ending handling,
// auto-detects the delimiter, and stores data in $.global.csvData.
// =============================================================================

function importCSV() {
    var csvFile = File.openDialog("Select CSV manifest to process", "*.csv", false);
    if (!csvFile) {
        $.global.log("CSV import cancelled — no file selected");
        return;
    }

    var csvData = [];
    csvFile.encoding = "UTF-8";
    csvFile.open("r");
    var rawContent = csvFile.read();
    csvFile.close();

    // Normalise all line ending styles
    rawContent = rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    csvData    = rawContent.split("\n");

    // Drop trailing empty line that split() often adds
    if (csvData.length > 0 && csvData[csvData.length - 1].replace(/\s/g, "") === "") {
        csvData.pop();
    }

    // Auto-detect delimiter and persist for createVersions()
    $.global.csvDelimiter = detectDelimiter(csvData[0]);
    $.global.log("Delimiter: '" + $.global.csvDelimiter + "'");
    $.global.log("CSV loaded — " + csvData.length + " rows (including header)");

    $.global.csvFile = csvFile;
    $.global.csvData = csvData;
}


// =============================================================================
// createVersions()
// Iterates CSV rows (skipping header), duplicates the matching template comp,
// swaps all asset layers, sets text, applies subtitles, and tracks created comps.
// =============================================================================

function createVersions() {
    var csvFile       = $.global.csvFile;
    var csvData       = $.global.csvData;
    var csvDelimiter  = $.global.csvDelimiter || ",";

    $.global.compsCreated = [];
    buildFootageCache(); // always rebuild before a processing run

    for (var i = 1; i < csvData.length; i++) {

        // --- Parse CSV row ---
        var rawRow   = csvData[i].replace(/\r/g, "");
        var row      = rawRow.split(csvDelimiter);
        for (var f = 0; f < row.length; f++) {
            row[f] = row[f].replace(/^\s+|\s+$/g, ""); // trim each field
        }

        // --- Map columns to named variables ---
        var promoTitle    = row[0];
        var promoDuration = row[1];
        var region        = row[2];
        var dimension     = row[3];
        var titleText     = row[4];
        var promoFilePath = row[5];
        var contentRating = row[6];
        var openerType    = row[7];
        // row[8] = show logo path (reserved)
        var endDate       = row[9];
        var endMonth      = row[10];
        var srtPath       = row[11] || "";

        $.global.log("--- Processing row " + i + ": " + promoTitle + " ---");

        // --- Find template comp ---
        // Convention: <Dimension>_PROMO_TEMPLATE  e.g. "H_PROMO_TEMPLATE"
        var templateName = dimension + "_PROMO_TEMPLATE";
        var templateComp = null;

        for (var h = 1; h <= app.project.numItems; h++) {
            var it = app.project.items[h];
            if (it instanceof CompItem && it.name === templateName) {
                templateComp = it;
                break;
            }
        }

        if (!templateComp) {
            $.global.log("ERROR — template comp not found: " + templateName + " (skipping row " + i + ")");
            continue;
        }

        // --- Duplicate template ---
        var newComp = templateComp.duplicate();
        var fps     = newComp.frameRate;
        newComp.openInViewer();

        newComp.name     = promoTitle;
        newComp.duration = parseCSVTime(promoDuration, fps);
        $.global.log("Comp created: " + newComp.name + " | duration: " + newComp.duration + "s");

        // -------------------------------------------------------------------
        // OPENER layer
        // Asset name convention: <Region>_<OpenerType>_<Dimension>_Alpha.mov
        // Example: "IN_COUNTDOWN_H_Alpha.mov"
        // -------------------------------------------------------------------
        var openerName = region + "_" + openerType + "_" + dimension + "_Alpha.mov";
        $.global.log("Opener asset: " + openerName);
        replaceLayerByFootageName(newComp, "OPENER", openerName);

        // -------------------------------------------------------------------
        // CLEAN_PROMO layer — import or reuse footage
        // -------------------------------------------------------------------
        var promoPath   = File(cleanCSVPath(promoFilePath));
        var promoFootage = null;

        for (var j = 1; j <= app.project.numItems; j++) {
            var it = app.project.item(j);
            if (it instanceof FootageItem && it.file && it.file.fsName === promoPath.fsName) {
                promoFootage = it;
                break;
            }
        }

        if (!promoFootage) {
            promoFootage = app.project.importFile(new ImportOptions(promoPath));
            $.global.log("Promo footage imported: " + promoFilePath);
        } else {
            $.global.log("Promo footage reused from project");
        }

        var cleanPromoLayer = newComp.layer("CLEAN_PROMO");
        cleanPromoLayer.replaceSource(promoFootage, true);
        $.global.log("Promo footage duration: " + promoFootage.duration + "s");

        // Read endpage marker times from the promo layer
        var epStart = getMarkerTime(cleanPromoLayer, "ENDPAGE_IN");
        var epEnd   = getMarkerTime(cleanPromoLayer, "ENDPAGE_OUT");

        // -------------------------------------------------------------------
        // TITLE text layer
        // -------------------------------------------------------------------
        var titleLayer = newComp.layer("TITLE");
        titleLayer.property("Source Text").setValue(titleText);
        if (epStart !== null) titleLayer.outTime = epStart;

        // -------------------------------------------------------------------
        // CONTENT RATING layer
        // Asset name convention: <Dimension>_<Rating>.png  e.g. "H_U.png"
        // -------------------------------------------------------------------
        var ratingName  = dimension + "_" + contentRating + ".png";
        replaceLayerByFootageName(newComp, "RATING", ratingName);
        var ratingLayer = newComp.layer("RATING");
        if (epStart !== null && ratingLayer) ratingLayer.outTime = epStart;

        // -------------------------------------------------------------------
        // CHANNEL LOGO / BUG layer
        // Asset name convention: <Region>_CHANNEL_LOGO_<Dimension>.png
        // Example: "IN_CHANNEL_LOGO_H.png"
        // -------------------------------------------------------------------
        var bugName  = region + "_CHANNEL_LOGO_" + dimension + ".png";
        replaceLayerByFootageName(newComp, "CHANNEL_BUG", bugName);
        var bugLayer = newComp.layer("CHANNEL_BUG");
        if (epStart !== null && bugLayer) bugLayer.outTime = epStart;

        // -------------------------------------------------------------------
        // ENDPAGE text layers
        // Layer names must match your template comp exactly.
        // -------------------------------------------------------------------
        var epDateLayer  = newComp.layer("DATE");
        var epMonthLayer = newComp.layer("MONTH");

        if (epDateLayer)  epDateLayer.property("Source Text").setValue(endDate);
        if (epMonthLayer) epMonthLayer.property("Source Text").setValue(endMonth);

        // -------------------------------------------------------------------
        // SUBTITLES  (optional — column 11)
        // -------------------------------------------------------------------
        if (srtPath === "") {
            try {
                newComp.layer("SUBTITLE_REF").enabled = false;
                $.global.log("No SRT for this row — SUBTITLE_REF disabled");
            } catch(e) {
                $.global.log("SUBTITLE_REF layer not found in: " + newComp.name);
            }
        } else {
            var cleanSRT = cleanCSVPath(srtPath);
            var srtCheck = new File(cleanSRT);

            if (srtCheck.exists) {
                addSubtitlesToComp(newComp, cleanSRT, "auto");
            } else {
                $.global.log("SRT file not found — disabling SUBTITLE_REF: " + cleanSRT);
                try { newComp.layer("SUBTITLE_REF").enabled = false; } catch(e) {}
            }
        }

        // Track comp for export
        $.global.compsCreated.push(newComp);
        $.global.log("Row " + i + " complete: " + promoTitle);
        $.global.log("");
    }

    $.global.thisCSVrow = row;
    $.global.newComp    = newComp;
}


// =============================================================================
// exportMXF()
// Adds all created comps to the After Effects Render Queue with the chosen
// output path, then transfers the queue to Adobe Media Encoder via BridgeTalk.
// =============================================================================

function exportMXF() {
    var outputFolder = Folder($.global.outputFolderPath);
    if (!outputFolder.exists) outputFolder.create();

    // Launch AME if not already running
    if (!BridgeTalk.isRunning("ame")) {
        BridgeTalk.launch("ame");
    }

    for (var i = 0; i < $.global.compsCreated.length; i++) {
        var comp = $.global.compsCreated[i];

        if (!comp || !(comp instanceof CompItem)) {
            $.global.log("Skipping invalid comp reference at index " + i);
            continue;
        }

        var outputFile  = new File(outputFolder.fsName + "/" + comp.name);
        var rqItem      = app.project.renderQueue.items.add(comp);
        var outputModule = rqItem.outputModule(1);
        outputModule.file = outputFile;

        $.global.log("Queued: " + comp.name + " → " + outputFile.fsName);
    }

    // Transfer entire queue to AME
    app.project.renderQueue.queueInAME(true);
    alert("All compositions added to Adobe Media Encoder queue.");
}


// =============================================================================
// Build footage cache on script load, then expose all three functions globally.
// =============================================================================

buildFootageCache();

$.global.importCSV      = importCSV;
$.global.createVersions = createVersions;
$.global.exportMXF      = exportMXF;
