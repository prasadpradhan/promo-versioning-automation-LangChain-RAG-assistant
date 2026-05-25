"""
query.py — RAG Query Engine
============================
Loads the ChromaDB vector store, retrieves relevant chunks,
and uses an LLM to answer questions about the AE Promo Versioning Pipeline.

Supports THREE LLM providers:
  - Groq      (FREE tier — default, very fast, 30 req/min)
  - Gemini    (FREE tier — 15 req/min, may have regional quota issues)
  - Claude    (Paid — best quality, use for production/demos)

LangChain Concepts Used:
- Retriever, ChatPromptTemplate, LCEL chaining, Output Parser
- Provider-agnostic LLM swapping (key LangChain feature)

This is the CORE of a RAG pipeline:
  Question → Retrieve relevant docs → Feed to LLM with context → Answer
"""

import os
from dotenv import load_dotenv

# Load API key from .env file (looks in current dir and parent dir)
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# ─── CONFIGURATION ──────────────────────────────────────────────────────────

CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# ─── LLM PROVIDER SELECTION ─────────────────────────────────────────────────
#
# Set LLM_PROVIDER to choose your model:
#   "groq"     → FREE, very fast, 30 req/min  (recommended for testing)
#   "gemini"   → FREE, 15 req/min (may have regional quota issues)
#   "claude"   → Paid, best quality (use for final demos)
#
LLM_PROVIDER = "claude"      # ← Change to "claude" for production demos

# Groq config (free)
# Get your free key at: https://console.groq.com/keys
GROQ_MODEL = "llama-3.3-70b-versatile"   # Free, powerful, fast

# Gemini config (free)
# Get your free key at: https://aistudio.google.com/apikey
GEMINI_MODEL = "gemini-2.0-flash"

# Claude config (paid)
# Options: "claude-haiku-4-5-20251001" (cheapest), "claude-sonnet-4-20250514"
CLAUDE_MODEL = "claude-haiku-4-5-20251001"

# How many chunks to retrieve per question
RETRIEVAL_K = 4


# ─── SYSTEM PROMPT ──────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a knowledgeable assistant for the AE Promo Versioning Pipeline — 
a CSV-driven automation system for Adobe After Effects that generates multi-region, 
multi-dimension promo variants for broadcast and OTT platforms.

Your role is to help users understand:
- How the pipeline works (architecture, workflow, data flow)
- How to use the UI panel and CSV manifest
- How to set up AE template comps correctly
- How to troubleshoot common errors
- How the code works (ExtendScript, BridgeTalk IPC, AME integration)
- How to customise the system for new channels or workflows

RULES:
- Answer based ONLY on the provided context documents. If the context doesn't 
  contain the answer, say so honestly — don't make things up.
- When referencing code or technical details, be specific and precise.
- If the user asks about something outside the pipeline scope, politely redirect.
- Use simple, clear language — the user may be a broadcast operator, not a developer.
- When relevant, mention which source document contains more detail.

CONTEXT FROM KNOWLEDGE BASE:
{context}
"""


def get_llm():
    """
    Create the LLM based on selected provider.
    
    This is where LangChain shines — swapping providers is just
    changing the class. The rest of the chain stays identical.
    This demonstrates provider-agnostic pipeline design.
    """
    if LLM_PROVIDER == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(
            model=GROQ_MODEL,
            temperature=0.3,
            max_tokens=1024,
        )
    elif LLM_PROVIDER == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=GEMINI_MODEL,
            temperature=0.3,
            max_output_tokens=1024,
        )
    elif LLM_PROVIDER == "claude":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=CLAUDE_MODEL,
            temperature=0.3,
            max_tokens=1024,
        )
    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {LLM_PROVIDER}")


def check_api_key():
    """Validate that the required API key is set."""
    key_map = {
        "groq":   ("GROQ_API_KEY",      "https://console.groq.com/keys"),
        "gemini": ("GOOGLE_API_KEY",     "https://aistudio.google.com/apikey"),
        "claude": ("ANTHROPIC_API_KEY",  "https://console.anthropic.com/settings/keys"),
    }

    env_var, url = key_map[LLM_PROVIDER]
    key = os.environ.get(env_var)

    if not key:
        print("=" * 60)
        print(f"  {env_var} not set!")
        print()
        print(f"  Get your {'FREE ' if LLM_PROVIDER != 'claude' else ''}API key at:")
        print(f"  {url}")
        print()
        print(f"  Then add to your .env file:")
        print(f"  {env_var}=your-key-here")
        print()
        print(f"  Or set directly in terminal:")
        print(f"  set {env_var}=your-key-here")
        print("=" * 60)
        return False
    return True


def format_docs(docs):
    """
    Format retrieved documents into a single string for the prompt.
    Includes source metadata so the LLM can reference where info came from.
    """
    formatted = []
    for i, doc in enumerate(docs, 1):
        source = doc.metadata.get("source", "unknown")
        doc_type = doc.metadata.get("type", "unknown")
        formatted.append(
            f"--- Document {i} (source: {source}, type: {doc_type}) ---\n"
            f"{doc.page_content}"
        )
    return "\n\n".join(formatted)


def build_rag_chain():
    """
    Build the complete RAG chain using LangChain Expression Language (LCEL).
    
    THE CHAIN:
    1. User question comes in
    2. Question → Embedding → Vector similarity search → Top K chunks
    3. Chunks formatted as context string
    4. System prompt + context + question → LLM → Answer
    
    LCEL lets us express this as a composable pipeline:
        {"context": retriever, "question": passthrough} | prompt | llm | parser
    """

    # ── Load the vector store ────────────────────────────────────────────
    print("Loading vector store...")
    embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        model_kwargs={"device": "cpu"},
    )
    vectorstore = Chroma(
        persist_directory=CHROMA_DIR,
        embedding_function=embeddings,
    )

    # ── Create retriever ─────────────────────────────────────────────────
    retriever = vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": RETRIEVAL_K},
    )

    # ── Create prompt template ───────────────────────────────────────────
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "{question}"),
    ])

    # ── Create LLM (provider-agnostic!) ──────────────────────────────────
    llm = get_llm()

    # ── Build the chain (LCEL) ───────────────────────────────────────────
    rag_chain = (
        {
            "context": retriever | format_docs,
            "question": RunnablePassthrough(),
        }
        | prompt
        | llm
        | StrOutputParser()
    )

    return rag_chain, retriever


def run_interactive():
    """
    Interactive CLI loop — ask questions, get RAG-powered answers.
    """
    provider_labels = {
        "groq":   "GROQ / Llama 3.3 70B (free)",
        "gemini": "GEMINI (free)",
        "claude": "CLAUDE (paid)",
    }

    print("=" * 60)
    print("AE Pipeline Assistant — RAG Query Engine")
    print("=" * 60)
    print(f"LLM Provider: {provider_labels.get(LLM_PROVIDER, LLM_PROVIDER)}")
    print("Ask anything about the AE Promo Versioning Pipeline.")
    print("Type 'quit' to exit, 'sources' to see retrieved chunks.\n")

    # Check for API key
    if not check_api_key():
        return

    chain, retriever = build_rag_chain()
    show_sources = False

    while True:
        print("-" * 40)
        question = input("You: ").strip()

        if not question:
            continue
        if question.lower() == "quit":
            print("Goodbye!")
            break
        if question.lower() == "sources":
            show_sources = not show_sources
            print(f"  Source display: {'ON' if show_sources else 'OFF'}")
            continue

        try:
            # Get answer from RAG chain
            print("\n🔍 Retrieving relevant documents...")
            answer = chain.invoke(question)
            print(f"\nAssistant: {answer}")

            # Optionally show which documents were retrieved
            if show_sources:
                docs = retriever.invoke(question)
                print("\n📚 Retrieved sources:")
                for i, doc in enumerate(docs, 1):
                    print(f"  [{i}] {doc.metadata['source']} "
                          f"({doc.metadata.get('type', '?')})")
                    print(f"      {doc.page_content[:100]}...")

        except Exception as e:
            print(f"\n❌ Error: {e}")
            print("   Check your API key and internet connection.")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    run_interactive()
