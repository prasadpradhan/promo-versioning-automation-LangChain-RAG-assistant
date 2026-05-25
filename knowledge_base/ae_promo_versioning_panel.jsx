// =============================================================================
// AE PROMO VERSIONING PANEL
// Adobe After Effects ScriptUI Panel
//
// PURPOSE:
//   CSV-driven promo versioning automation. Loads a channel-specific pipeline
//   script, ingests a CSV manifest, creates comp versions, and queues them in
//   Adobe Media Encoder via BridgeTalk IPC.
//
// HOW TO CUSTOMISE:
//   1. Add your channel names to the CHANNEL_LIST array below.
//   2. Map each channel name to its pipeline script in CHANNEL_SCRIPT_MAP.
//   3. Place all pipeline scripts in the same folder as this panel file.
//   4. Each pipeline script must expose three globals:
//        $.global.importCSV()      — opens file dialog, reads CSV
//        $.global.createVersions() — builds After Effects comps from CSV rows
//        $.global.exportMXF()      — queues comps in Adobe Media Encoder
//
// REQUIREMENTS:
//   Adobe After Effects CC 2018 or later
//   Adobe Media Encoder (same Creative Cloud version) for render export
//
// =============================================================================

(function PromoVersioningPanel(thisObj) {

    // =========================================================================
    // CONFIGURATION — edit these two items to match your workflow
    // =========================================================================

    /** Channel names shown in the dropdown. */
    var CHANNEL_LIST = [
        "Network_A",
        "Network_B",
        "Network_C",
        "OTT_Platform",
        "Linear_HD"
    ];

    /**
     * Maps each channel name to the pipeline script filename that handles it.
     * All scripts must live in the same folder as this panel file.
     */
    var CHANNEL_SCRIPT_MAP = {
        "Network_A"   : "ae_promo_pipeline_network_a.jsx",
        "Network_B"   : "ae_promo_pipeline_network_b.jsx",
        "Network_C"   : "ae_promo_pipeline_network_c.jsx",
        "OTT_Platform": "ae_promo_pipeline_ott.jsx",
        "Linear_HD"   : "ae_promo_pipeline_linear_hd.jsx"
    };

    // =========================================================================
    // UI BUILD
    // =========================================================================

    function buildUI(thisObj) {

        var panel = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", "Promo Versioning Panel", undefined, { resizeable: true });

        panel.orientation    = "column";
        panel.alignChildren  = ["fill", "top"];
        panel.onResizing     = panel.onResize = function () { this.layout.resize(); };

        // --- Row 1: Channel selector + CSV import ---
        var rowCSV = panel.add("group");
        rowCSV.alignChildren = ["left", "center"];

        var chDropdown = rowCSV.add("dropdownlist", undefined, CHANNEL_LIST);
        chDropdown.selection       = 0;
        chDropdown.minimumSize.width = 120;

        var btnCSV = rowCSV.add("button", undefined, "Import CSV");
        btnCSV.minimumSize.width = 100;

        var txtCSV = rowCSV.add("statictext", undefined, "No CSV loaded", { truncate: "middle" });
        txtCSV.characters = 40;

        // --- Status / log list box ---
        var statusGroup = panel.add("group");
        statusGroup.orientation  = "column";
        statusGroup.alignChildren = ["fill", "fill"];
        statusGroup.alignment     = ["fill", "fill"];

        var statusList = statusGroup.add("listbox", undefined, ["Waiting for CSV..."], { multiselect: false });
        statusList.alignment = ["fill", "fill"];

        // Make accessible to pipeline scripts
        $.global.statusList = statusList;

        // --- Row 2: Versioning + output folder ---
        var rowActions = panel.add("group");
        rowActions.alignment = ["fill", "bottom"];

        var btnProcess = rowActions.add("button", undefined, "Create Versions");
        btnProcess.minimumSize.width = 120;

        var btnSelectOutput = rowActions.add("button", undefined, "Select Output Folder");
        btnSelectOutput.minimumSize.width = 130;

        var txtOutputFolder = rowActions.add("statictext", undefined, "No folder selected", { truncate: "middle" });
        txtOutputFolder.characters = 40;

        // --- Row 3: Render + utilities ---
        var rowRender = panel.add("group");
        rowRender.alignment = ["fill", "bottom"];

        var btnRender     = rowRender.add("button", undefined, "Send to AME");
        btnRender.minimumSize.width = 110;

        var btnExportLog  = rowRender.add("button", undefined, "Export Log");
        btnExportLog.minimumSize.width = 90;

        var btnClear      = rowRender.add("button", undefined, "Clear All");
        btnClear.minimumSize.width = 90;

        // Initial button states
        btnProcess.enabled      = false;
        btnSelectOutput.enabled = false;
        btnRender.enabled       = false;
        btnExportLog.enabled    = true;

        // =====================================================================
        // UTILITIES
        // =====================================================================

        function timeStamp() {
            var d = new Date();
            var h = d.getHours(),   m = d.getMinutes(),   s = d.getSeconds();
            return "[" +
                (h < 10 ? "0" + h : h) + ":" +
                (m < 10 ? "0" + m : m) + ":" +
                (s < 10 ? "0" + s : s) + "] ";
        }

        // Initialise log data store
        if (!$.global.logData) { $.global.logData = []; }

        // Global logger (also used by pipeline scripts)
        if (typeof $.global.log !== "function") {
            $.global.log = function (msg) {
                try {
                    var entry = timeStamp() + msg;
                    $.writeln(msg);
                    if ($.global.statusList && $.global.statusList.add) {
                        $.global.statusList.add("item", entry);
                        $.global.logData.push(entry);
                        $.global.statusList.selection = $.global.statusList.items.length - 1;
                        $.global.statusList.active    = true;
                    }
                } catch (e) {
                    $.writeln("Logger error: " + e.toString());
                }
            };
        }

        // Global error handler
        $.global.safeError = function (err, context) {
            var msg   = err.message     || err.toString();
            var line  = err.line        || "unknown";
            var file  = err.fileName    || err.source || "unknown";
            var stack = err.stack       || "";
            var desc  = err.description || "";

            var errMsg  = "ERROR";
            if (context) errMsg += " [" + context + "]";
            errMsg += "\n" +
                "-----------------------------------\n" +
                "Message : " + msg  + "\n";
            if (desc && desc !== msg) errMsg += "Detail  : " + desc + "\n";
            errMsg += "Line    : " + line + "\n" +
                "File    : " + file + "\n";
            if (stack) errMsg += "Stack   : " + stack + "\n";
            errMsg += "-----------------------------------";

            $.writeln(errMsg);

            if ($.global.statusList) {
                var lines = errMsg.split("\n");
                for (var i = 0; i < lines.length; i++) {
                    if (lines[i] !== "") {
                        var item = $.global.statusList.add("item", timeStamp() + lines[i]);
                        $.global.logData.push(timeStamp() + lines[i]);
                    }
                }
                $.global.statusList.selection = $.global.statusList.items.length - 1;
            }

            alert("ERROR [" + context + "]\n\nLine : " + line + "\nFile : " + file + "\n\n" + msg);
        };

        // =====================================================================
        // CHANNEL SCRIPT LOADER
        // =====================================================================

        var scriptFolder  = File($.fileName).parent;
        var mainScript    = null;
        var activeChannel = chDropdown.selection.text;

        function loadChannelScript(channelName) {
            try {
                var scriptName = CHANNEL_SCRIPT_MAP[channelName];
                if (!scriptName) {
                    throw new Error("No script mapped for channel: " + channelName);
                }

                var file = new File(scriptFolder.fsName + "/" + scriptName);
                if (!file.exists) {
                    throw new Error("Pipeline script not found:\n" + file.fsName);
                }

                $.evalFile(file);
                $.global.log("Loaded: " + scriptName);

                if (typeof $.global.importCSV      !== "function") throw new Error("importCSV() not found in " + scriptName);
                if (typeof $.global.createVersions !== "function") throw new Error("createVersions() not found in " + scriptName);
                if (typeof $.global.exportMXF      !== "function") throw new Error("exportMXF() not found in " + scriptName);

                return file;

            } catch (err) {
                $.global.safeError(err, "Load Channel Script");
                return null;
            }
        }

        // Load default channel on panel open
        $.global.log("Promo Versioning Panel started");
        mainScript = loadChannelScript(activeChannel);

        // =====================================================================
        // CHANNEL DROPDOWN
        // =====================================================================

        chDropdown.onChange = function () {
            try {
                activeChannel = chDropdown.selection.text;
                $.global.log("Channel switched: " + activeChannel);
                mainScript = loadChannelScript(activeChannel);

                if (mainScript) {
                    txtCSV.text         = "No CSV loaded";
                    txtOutputFolder.text = "No folder selected";
                    btnProcess.enabled      = false;
                    btnSelectOutput.enabled = false;
                    btnRender.enabled       = false;
                    $.global.csvFile        = null;
                    $.global.csvData        = [];
                    $.global.outputFolderPath = null;
                }
            } catch (err) {
                $.global.safeError(err, "Channel Switch");
            }
        };

        // =====================================================================
        // IMPORT CSV
        // =====================================================================

        btnCSV.onClick = function () {
            try {
                if (!mainScript) throw new Error("No pipeline script loaded for: " + activeChannel);
                if (typeof $.global.importCSV !== "function") throw new Error("importCSV() not available");

                $.global.log("Opening CSV browser for " + activeChannel);
                $.global.importCSV();

                if ($.global.csvFile) {
                    txtCSV.text = decodeURI($.global.csvFile.name);
                    $.global.log("CSV loaded: " + decodeURI($.global.csvFile.name) +
                                 " (" + ($.global.csvData.length - 1) + " data rows)");
                    btnProcess.enabled      = true;
                    btnSelectOutput.enabled = true;
                } else {
                    $.global.log("CSV import cancelled");
                }

            } catch (err) {
                $.global.safeError(err, "CSV Import");
            }
        };

        // =====================================================================
        // CREATE VERSIONS
        // =====================================================================

        btnProcess.onClick = function () {
            try {
                if (!$.global.csvFile)                          throw new Error("Load a CSV file first");
                if (!$.global.csvData || $.global.csvData.length < 2) throw new Error("CSV is empty or invalid");
                if (typeof $.global.createVersions !== "function")    throw new Error("createVersions() not available");

                var rowCount = $.global.csvData.length - 1;
                var proceed  = confirm(
                    "Create versions?\n\n" +
                    "Channel : " + activeChannel + "\n" +
                    "Rows    : " + rowCount + "\n\n" +
                    "This may take several minutes.\nContinue?"
                );
                if (!proceed) { $.global.log("Version creation cancelled"); return; }

                btnProcess.enabled = false;
                btnProcess.text    = "Processing...";

                $.global.log("Starting version creation — " + activeChannel);
                $.global.log("--------------------------------------");
                $.global.createVersions();

                if ($.global.errorPolicy && $.global.errorPolicy.cancelled) {
                    $.global.log("Versioning was cancelled");
                    btnProcess.text    = "Create Versions";
                    btnProcess.enabled = true;
                    return;
                }

                $.global.log("--------------------------------------");
                $.global.log("Version creation complete — " + activeChannel);

                if ($.global.compsCreated && $.global.compsCreated.length > 0) {
                    $.global.log("Compositions created: " + $.global.compsCreated.length);
                    btnRender.enabled = true;
                }

                btnProcess.text    = "Create Versions";
                btnProcess.enabled = true;

            } catch (err) {
                $.global.log("CRASH at line " + err.line + " in " + (err.fileName || "unknown"));
                $.global.safeError(err, "Create Versions");
                btnProcess.text    = "Create Versions";
                btnProcess.enabled = true;
            }
        };

        // =====================================================================
        // SELECT OUTPUT FOLDER
        // =====================================================================

        btnSelectOutput.onClick = function () {
            try {
                var selected = Folder.selectDialog("Select output folder for rendered files");
                if (selected) {
                    $.global.outputFolderPath = selected.fsName;
                    txtOutputFolder.text      = decodeURI($.global.outputFolderPath);
                    $.global.log("Output folder: " + $.global.outputFolderPath);

                    if ($.global.compsCreated && $.global.compsCreated.length > 0) {
                        btnRender.enabled = true;
                    }
                }
            } catch (err) {
                $.global.safeError(err, "Folder Selection");
            }
        };

        // =====================================================================
        // SEND TO AME
        // =====================================================================

        btnRender.onClick = function () {
            try {
                if (!$.global.compsCreated || $.global.compsCreated.length === 0)
                    throw new Error("No compositions to render — create versions first");
                if (!$.global.outputFolderPath)
                    throw new Error("Select an output folder first");
                if (typeof $.global.exportMXF !== "function")
                    throw new Error("exportMXF() not available");

                var proceed = confirm(
                    "Send to Adobe Media Encoder?\n\n" +
                    "Compositions : " + $.global.compsCreated.length + "\n" +
                    "Output       : " + $.global.outputFolderPath + "\n\n" +
                    "AME will open if not running.\nContinue?"
                );
                if (!proceed) { $.global.log("Render cancelled"); return; }

                btnRender.enabled = false;
                btnRender.text    = "Queuing...";

                $.global.log("Sending to Adobe Media Encoder...");
                $.global.exportMXF();
                $.global.log("All compositions queued in AME");

                btnRender.text    = "Send to AME";
                btnRender.enabled = true;

            } catch (err) {
                $.global.safeError(err, "AME Export");
                btnRender.text    = "Send to AME";
                btnRender.enabled = true;
            }
        };

        // =====================================================================
        // EXPORT LOG
        // =====================================================================

        btnExportLog.onClick = function () {
            try {
                if (!$.global.statusList || $.global.statusList.items.length === 0) {
                    alert("No log entries to export");
                    return;
                }

                var logFile = File.saveDialog("Save log file", "*.txt");
                if (!logFile) return;

                logFile.open("w");
                logFile.writeln("// ==============================================");
                logFile.writeln("PROMO VERSIONING LOG");
                logFile.writeln("Generated : " + new Date().toString());
                logFile.writeln("Channel   : " + activeChannel);
                logFile.writeln("// ==============================================");
                logFile.writeln("");

                for (var i = 0; i < $.global.logData.length; i++) {
                    logFile.writeln($.global.logData[i]);
                }

                logFile.close();
                $.global.log("Log exported: " + logFile.fsName);

            } catch (err) {
                $.global.safeError(err, "Export Log");
            }
        };

        // =====================================================================
        // CLEAR ALL
        // =====================================================================

        btnClear.onClick = function () {
            try {
                var proceed = confirm(
                    "Reset the panel?\n\n" +
                    "This will clear the log, all selections,\n" +
                    "and the created compositions list.\n\n" +
                    "Continue?"
                );
                if (!proceed) return;

                statusList.removeAll();
                txtCSV.text          = "No CSV loaded";
                txtOutputFolder.text = "No folder selected";

                btnProcess.enabled      = false;
                btnRender.enabled       = false;
                btnSelectOutput.enabled = false;

                $.global.csvFile           = null;
                $.global.csvData           = [];
                $.global.thisCSVrow        = null;
                $.global.templateComp      = null;
                $.global.newComp           = null;
                $.global.compsCreated      = [];
                $.global.outputFolderPath  = null;
                $.global.logData           = [];

                if ($.global.errorPolicy) {
                    $.global.errorPolicy.mode      = "ASK";
                    $.global.errorPolicy.cancelled = false;
                }

                statusList.add("item", timeStamp() + "Panel reset. Waiting for CSV...");
                $.global.log("Panel reset complete");

            } catch (err) {
                $.global.safeError(err, "Clear Panel");
            }
        };

        // =====================================================================
        // SHOW PANEL
        // =====================================================================

        if (panel instanceof Window) { panel.center(); panel.show(); }
        return panel;
    }

    // =========================================================================
    // INIT
    // =========================================================================

    var myPanel = buildUI(thisObj);
    if (!(myPanel instanceof Window)) { myPanel.layout.layout(true); }

})(this);
