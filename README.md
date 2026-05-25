# promo-versioning-automation-LangChain-RAG-assistant
A Retrieval-Augmented Generation (RAG) assistant that answers questions about the [AE Promo Versioning Pipeline] (https://github.com/prasadpradhan/ae-promo-versioning) — a CSV-driven broadcast automation system for Adobe After Effects.
Built with LangChain, ChromaDB, and Claude (Anthropic API).

![Python](https://img.shields.io/badge/Python-3.10+-blue)
![LangChain](https://img.shields.io/badge/LangChain-0.3-green)
![Claude](https://img.shields.io/badge/LLM-Claude-orange)

---

## What This Does

Instead of reading through code and documentation manually, you can ask natural language questions:

```
You: How does BridgeTalk send comps to Adobe Media Encoder?
Assistant: BridgeTalk is Adobe's inter-process communication system. The pipeline
           creates a BridgeTalk object targeting "ame", builds an ExtendScript
           string that adds the comp to AME's render queue with the specified
           encoding preset and output path, then sends it asynchronously...

You: What columns does the CSV need?
Assistant: The CSV manifest requires these columns: region, language, dimension,
           promo_title, output_filename (required), and episode_info, tune_in_date,
           tune_in_time, opener_type, srt_path (optional)...

You: My subtitles aren't showing — what should I check?
Assistant: Check these common causes: 1) SRT file path uses backslashes instead
           of forward slashes, 2) AE's "Allow Scripts to Write Files" is disabled
           in Preferences > Scripting, 3) The SRT file format is non-standard...
```

---

## Architecture

```
                    ┌─────────────────────────────┐
                    │   Knowledge Base (Markdown,  │
                    │   Code, CSV documentation)   │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │   ingest.py                  │
                    │   • Load documents           │
                    │   • Chunk with splitter       │
                    │   • Embed (MiniLM-L6-v2)     │
                    │   • Store in ChromaDB         │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │   ChromaDB Vector Store      │
                    │   (persistent, local)        │
                    └──────────┬──────────────────┘
                               │
    User Question ──►  ┌───────▼───────────────┐
                       │   query.py (RAG Chain) │
                       │   • Embed question      │
                       │   • Retrieve top K docs │
                       │   • Format as context   │
                       │   • Prompt + Claude     │
                       │   • Return answer       │
                       └───────┬───────────────┘
                               │
                          Answer ◄──
```

---

## Setup

### Prerequisites
- Python 3.10+
- Anthropic API key ([get one here](https://console.anthropic.com/settings/keys))

### Install

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/ae-pipeline-assistant.git
cd ae-pipeline-assistant

# Install dependencies
pip install -r requirements.txt

# Set your API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Or set it directly:
export ANTHROPIC_API_KEY="sk-ant-your-key-here"      # Linux/Mac
set ANTHROPIC_API_KEY=sk-ant-your-key-here           # Windows CMD
$env:ANTHROPIC_API_KEY="sk-ant-your-key-here"        # Windows PowerShell
```

### Run

```bash
# Step 1: Ingest documents into vector store (run once)
python scripts/ingest.py

This will work as follows -
Documents
↓
Chunks
↓
Embeddings
↓
ChromaDB

# Step 2: Start asking questions
python scripts/query.py

This will work as follows -
Question
↓
Retrieve chunks
↓
LLM answer

```

---

## Project Structure

```
ae-pipeline-assistant/
├── knowledge_base/              # Documents the RAG system indexes
│   ├── 01_project_overview.md   # What the pipeline does, scale, tech stack
│   ├── 02_ui_panel.md           # UI panel script explanation
│   ├── 03_pipeline_core.md      # Core engine — comp duplication, asset swap, AME
│   ├── 04_csv_manifest.md       # CSV structure, column reference, best practices
│   ├── 05_ae_template_comp.md   # AE template comp layer structure
│   └── 06_troubleshooting.md    # Common errors and fixes
├── scripts/
│   ├── ingest.py                # Document loading → chunking → embedding → ChromaDB
│   └── query.py                 # RAG chain: retrieve → prompt → Claude → answer
├── chroma_db/                   # Auto-created: persistent vector store
├── requirements.txt
├── .env.example
└── README.md
```

---

## LangChain Concepts Demonstrated

| Concept | Where | What It Does |
|---------|-------|-------------|
| **Document Loaders** | `ingest.py` | Read .md, .jsx, .csv files into Document objects |
| **Text Splitter** | `ingest.py` | Break large docs into retrieval-sized chunks |
| **Embeddings** | `ingest.py` | Convert text → 384-dim vectors (MiniLM-L6-v2) |
| **Vector Store** | `ingest.py` | ChromaDB stores and indexes vectors locally |
| **Retriever** | `query.py` | Similarity search: question → nearest chunks |
| **ChatPromptTemplate** | `query.py` | System + human message template for Claude |
| **ChatAnthropic** | `query.py` | LangChain's Claude API integration |
| **LCEL (Chaining)** | `query.py` | Composable pipeline with `|` operator |
| **Output Parser** | `query.py` | AIMessage → clean string |

---

## Extending the Knowledge Base

To add more information for the assistant to know about:

1. Add `.md`, `.txt`, `.jsx`, or `.csv` files to `knowledge_base/`
2. Re-run `python scripts/ingest.py`
3. The vector store updates with the new content

**Ideas for additional docs:**
- Your actual JSX code files (the assistant can then explain specific functions)
- AME preset configuration details
- Team onboarding guide
- Production workflow SOP

---

## Sample Questions to Try

```
How does the pipeline work end to end?
What is BridgeTalk and why is it needed?
How do I add a new channel to the system?
What's the CSV column for subtitle paths?
My renders are coming out black — what's wrong?
How does the SRT expression work inside AE?
What AE versions are supported?
How many variants can this handle per campaign?
What's the naming convention for template comps?
How do I install the ScriptUI panel?
```

---

## Why This Project Matters

This demonstrates:
- **RAG architecture** — the dominant LLM integration pattern in production
- **Domain-specific AI** — an assistant trained on a real codebase, not generic docs
- **LangChain proficiency** — loaders, splitters, embeddings, vector stores, LCEL chains
- **Production thinking** — chunking strategy, retrieval tuning, grounded answers

Built as part of a portfolio for creative technology and AI pipeline engineering roles.

---

## Tech Stack

- **LangChain** — orchestration framework
- **ChromaDB** — local vector database
- **Sentence Transformers** — local embedding model (no API cost)
- **Claude (Anthropic)** — LLM for answer generation
- **Python 3.12**

---

## License

MIT
