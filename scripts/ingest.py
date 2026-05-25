"""
ingest.py — Document Ingestion Pipeline
========================================
Reads all knowledge base documents (markdown, code, CSV),
chunks them, generates embeddings, and stores in ChromaDB.

This is Step 1 of the RAG pipeline — run this ONCE before querying.

LangChain Concepts Used:
- Document Loaders: Read files from disk into Document objects
- Text Splitters: Break large docs into retrieval-friendly chunks
- Embeddings: Convert text chunks into numerical vectors
- Vector Store: Store and index vectors for similarity search
"""

import os
import glob
from langchain_community.document_loaders import (
    TextLoader,
    DirectoryLoader,
    CSVLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma

# ─── CONFIGURATION ──────────────────────────────────────────────────────────

# Where your knowledge base docs live
KNOWLEDGE_DIR = os.path.join(os.path.dirname(__file__), "..", "knowledge_base")

# Where ChromaDB will persist the vector store
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")

# Embedding model — runs locally, no API key needed
# all-MiniLM-L6-v2 is small (~80MB), fast, and good enough for this use case
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Chunk settings
CHUNK_SIZE = 1000       # characters per chunk
CHUNK_OVERLAP = 200     # overlap between chunks (preserves context at boundaries)


def load_documents():
    """
    Load all documents from the knowledge base directory.
    
    Supports: .md, .txt, .jsx, .csv files
    Each file becomes one or more Document objects with metadata.
    """
    documents = []

    # ── Load Markdown files ──────────────────────────────────────────────
    md_files = glob.glob(os.path.join(KNOWLEDGE_DIR, "*.md"))
    for filepath in md_files:
        loader = TextLoader(filepath, encoding="utf-8")
        docs = loader.load()
        # Add source filename as metadata for citation
        for doc in docs:
            doc.metadata["source"] = os.path.basename(filepath)
            doc.metadata["type"] = "documentation"
        documents.extend(docs)
        print(f"  Loaded: {os.path.basename(filepath)} ({len(docs)} doc(s))")

    # ── Load JSX code files (if placed in knowledge_base) ────────────────
    jsx_files = glob.glob(os.path.join(KNOWLEDGE_DIR, "*.jsx"))
    for filepath in jsx_files:
        loader = TextLoader(filepath, encoding="utf-8")
        docs = loader.load()
        for doc in docs:
            doc.metadata["source"] = os.path.basename(filepath)
            doc.metadata["type"] = "code"
        documents.extend(docs)
        print(f"  Loaded: {os.path.basename(filepath)} ({len(docs)} doc(s))")

    # ── Load CSV files (if any sample data) ──────────────────────────────
    csv_files = glob.glob(os.path.join(KNOWLEDGE_DIR, "*.csv"))
    for filepath in csv_files:
        try:
            loader = CSVLoader(filepath, encoding="utf-8")
            docs = loader.load()
            for doc in docs:
                doc.metadata["source"] = os.path.basename(filepath)
                doc.metadata["type"] = "data"
            documents.extend(docs)
            print(f"  Loaded: {os.path.basename(filepath)} ({len(docs)} row(s))")
        except Exception as e:
            print(f"  Warning: Could not load {filepath}: {e}")

    # ── Load plain text files ────────────────────────────────────────────
    txt_files = glob.glob(os.path.join(KNOWLEDGE_DIR, "*.txt"))
    for filepath in txt_files:
        loader = TextLoader(filepath, encoding="utf-8")
        docs = loader.load()
        for doc in docs:
            doc.metadata["source"] = os.path.basename(filepath)
            doc.metadata["type"] = "documentation"
        documents.extend(docs)
        print(f"  Loaded: {os.path.basename(filepath)} ({len(docs)} doc(s))")

    return documents


def chunk_documents(documents):
    """
    Split documents into smaller chunks for retrieval.
    
    WHY CHUNK?
    - LLMs have context limits — we can't send entire files
    - Smaller chunks = more precise retrieval
    - Overlap ensures we don't lose context at chunk boundaries
    
    RecursiveCharacterTextSplitter tries to split on:
    1. Double newlines (paragraph boundaries)
    2. Single newlines
    3. Spaces
    4. Characters (last resort)
    This preserves semantic structure better than fixed-size splitting.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
        separators=["\n\n", "\n", " ", ""],
    )

    chunks = splitter.split_documents(documents)
    return chunks


def create_vector_store(chunks):
    """
    Generate embeddings and store in ChromaDB.
    
    WHAT'S HAPPENING:
    1. Each text chunk → embedding model → 384-dimensional vector
    2. Vectors stored in ChromaDB (local, persistent, no server needed)
    3. At query time, the question is also embedded → nearest vectors found
    
    Think of it as: converting text to coordinates in a meaning-space,
    then finding which stored coordinates are closest to the question.
    """
    print(f"\n  Generating embeddings with '{EMBEDDING_MODEL}'...")
    print(f"  (First run downloads the model — ~80MB — subsequent runs are instant)")

    embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        model_kwargs={"device": "cpu"},  # Use "cuda" if you have GPU
    )

    # Create and persist the vector store
    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=CHROMA_DIR,
    )

    return vectorstore


def main():
    print("=" * 60)
    print("AE Pipeline Assistant — Document Ingestion")
    print("=" * 60)

    # Step 1: Load raw documents
    print("\n📂 Loading documents from knowledge base...")
    documents = load_documents()
    print(f"\n  Total documents loaded: {len(documents)}")

    if not documents:
        print("\n❌ No documents found! Add files to the knowledge_base/ folder.")
        return

    # Step 2: Chunk documents
    print("\n✂️  Chunking documents...")
    chunks = chunk_documents(documents)
    print(f"  Created {len(chunks)} chunks (size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})")

    # Step 3: Embed and store
    print("\n🧠 Creating vector store...")
    vectorstore = create_vector_store(chunks)
    print(f"\n  Vector store saved to: {CHROMA_DIR}")

    # Quick verification
    print("\n✅ Ingestion complete! Quick test:")
    results = vectorstore.similarity_search("How does BridgeTalk work?", k=2)
    for i, doc in enumerate(results):
        print(f"\n  Result {i+1} (from {doc.metadata['source']}):")
        print(f"  {doc.page_content[:150]}...")

    print("\n" + "=" * 60)
    print("Ready! Run `python scripts/query.py` to start asking questions.")
    print("=" * 60)


if __name__ == "__main__":
    main()
