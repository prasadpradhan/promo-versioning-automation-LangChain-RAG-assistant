"""
app.py — Streamlit Web UI for AE Pipeline Assistant
=====================================================
A browser-based chat interface for the RAG query engine.
Run with: streamlit run scripts/app.py

Features:
- Chat-style conversational UI
- Provider selection (Groq free / Gemini free / Claude paid)
- Source document display toggle
- Conversation history within session
- Professional look for portfolio demos
"""

import os
import sys
import streamlit as st
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# ─── PATHS ──────────────────────────────────────────────────────────────────

CHROMA_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

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
- Use simple, clear language — the user may be a broadcast operator, not a developer.
- When relevant, mention which source document contains more detail.

CONTEXT FROM KNOWLEDGE BASE:
{context}
"""


# ─── LLM FACTORY ────────────────────────────────────────────────────────────

def get_llm(provider):
    """Create LLM based on selected provider."""
    if provider == "Groq (Free — Llama 3.3 70B)":
        from langchain_groq import ChatGroq
        return ChatGroq(
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            max_tokens=1024,
        )
    elif provider == "Gemini (Free — Flash)":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model="gemini-2.0-flash",
            temperature=0.3,
            max_output_tokens=1024,
        )
    elif provider == "Claude (Paid — Haiku)":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model="claude-haiku-4-5-20251001",
            temperature=0.3,
            max_tokens=1024,
        )
    elif provider == "Claude (Paid — Sonnet)":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model="claude-sonnet-4-20250514",
            temperature=0.3,
            max_tokens=1024,
        )


def check_api_key(provider):
    """Check if the required API key is available."""
    if "Groq" in provider:
        return os.environ.get("GROQ_API_KEY") is not None, "GROQ_API_KEY", "https://console.groq.com/keys"
    elif "Gemini" in provider:
        return os.environ.get("GOOGLE_API_KEY") is not None, "GOOGLE_API_KEY", "https://aistudio.google.com/apikey"
    elif "Claude" in provider:
        return os.environ.get("ANTHROPIC_API_KEY") is not None, "ANTHROPIC_API_KEY", "https://console.anthropic.com/settings/keys"
    return False, "", ""


# ─── RAG CHAIN ──────────────────────────────────────────────────────────────

def format_docs(docs):
    """Format retrieved documents into context string."""
    formatted = []
    for i, doc in enumerate(docs, 1):
        source = doc.metadata.get("source", "unknown")
        doc_type = doc.metadata.get("type", "unknown")
        formatted.append(
            f"--- Document {i} (source: {source}, type: {doc_type}) ---\n"
            f"{doc.page_content}"
        )
    return "\n\n".join(formatted)


@st.cache_resource
def load_vector_store():
    """Load vector store (cached — loads once per session)."""
    embeddings = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        model_kwargs={"device": "cpu"},
    )
    vectorstore = Chroma(
        persist_directory=CHROMA_DIR,
        embedding_function=embeddings,
    )
    return vectorstore


def build_chain(provider):
    """Build the RAG chain with the selected provider."""
    vectorstore = load_vector_store()

    retriever = vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": 4},
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "{question}"),
    ])

    llm = get_llm(provider)

    chain = (
        {
            "context": retriever | format_docs,
            "question": RunnablePassthrough(),
        }
        | prompt
        | llm
        | StrOutputParser()
    )

    return chain, retriever


# ─── STREAMLIT UI ───────────────────────────────────────────────────────────

def main():
    # ── Page config ──────────────────────────────────────────────────────
    st.set_page_config(
        page_title="AE Pipeline Assistant",
        page_icon="🎬",
        layout="centered",
        initial_sidebar_state="expanded",
    )

    # ── Custom CSS for cleaner look ──────────────────────────────────────
    st.markdown("""
    <style>
        .stApp {
            max-width: 900px;
            margin: 0 auto;
        }
        .source-box {
            background-color: #f0f2f6;
            border-left: 3px solid #4A90D9;
            padding: 10px 15px;
            margin: 5px 0;
            border-radius: 0 5px 5px 0;
            font-size: 0.85em;
        }
        .header-subtitle {
            color: #666;
            font-size: 0.95em;
            margin-top: -10px;
        }
        .metric-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 15px 20px;
            border-radius: 10px;
            color: white;
            text-align: center;
        }
    </style>
    """, unsafe_allow_html=True)

    # ── Header ───────────────────────────────────────────────────────────
    st.title("🎬 AE Pipeline Assistant")
    st.markdown(
        '<p class="header-subtitle">'
        'RAG-powered assistant for the After Effects Promo Versioning Pipeline'
        '</p>',
        unsafe_allow_html=True,
    )

    # ── Sidebar ──────────────────────────────────────────────────────────
    with st.sidebar:
        st.header("⚙️ Settings")

        # Provider selection
        provider = st.selectbox(
            "LLM Provider",
            [
                "Groq (Free — Llama 3.3 70B)",
                "Gemini (Free — Flash)",
                "Claude (Paid — Haiku)",
                "Claude (Paid — Sonnet)",
            ],
            index=0,
            help="Groq is free and fast — recommended for testing",
        )

        # API key check
        key_ok, key_name, key_url = check_api_key(provider)
        if key_ok:
            st.success(f"✅ {key_name} detected")
        else:
            st.error(f"❌ {key_name} not found")
            st.markdown(f"Get your key: [{key_url}]({key_url})")
            st.markdown(f"Add to `.env` file:\n```\n{key_name}=your-key\n```")

        # Show sources toggle
        show_sources = st.toggle("📚 Show retrieved sources", value=False)

        st.divider()

        # About section
        st.header("ℹ️ About")
        st.markdown("""
        This assistant answers questions about the 
        **AE Promo Versioning Pipeline** — a CSV-driven 
        automation system for Adobe After Effects.
        
        **Tech Stack:**
        - 🦜 LangChain (orchestration)
        - 🗄️ ChromaDB (vector store)
        - 🤖 Multi-provider LLM support
        - 📄 MiniLM-L6-v2 (embeddings)
        """)

        st.divider()

        # Architecture info
        with st.expander("🏗️ How RAG Works"):
            st.markdown("""
            ```
            Your Question
                 ↓
            Embed → Vector Search
                 ↓
            Top 4 relevant chunks
                 ↓
            Context + Question → LLM
                 ↓
            Grounded Answer
            ```
            
            The LLM only answers from the 
            retrieved documents — no hallucination.
            """)

        # Clear chat button
        if st.button("🗑️ Clear Chat", use_container_width=True):
            st.session_state.messages = []
            st.rerun()

    # ── Initialize chat history ──────────────────────────────────────────
    if "messages" not in st.session_state:
        st.session_state.messages = []

    # ── Sample questions (shown when chat is empty) ──────────────────────
    if not st.session_state.messages:
        st.markdown("### 💡 Try asking:")
        
        sample_cols = st.columns(2)
        sample_questions = [
            "How does the pipeline work end to end?",
            "What columns does the CSV need?",
            "How does BridgeTalk send comps to AME?",
            "My renders are coming out black — help!",
            "How do I add a new channel?",
            "What's the SRT expression and how does it work?",
        ]

        for i, question in enumerate(sample_questions):
            col = sample_cols[i % 2]
            if col.button(f"➤ {question}", key=f"sample_{i}", use_container_width=True):
                st.session_state.messages.append({"role": "user", "content": question})
                st.rerun()

    # ── Display chat history ─────────────────────────────────────────────
    for message in st.session_state.messages:
        with st.chat_message(message["role"], avatar="🧑‍💻" if message["role"] == "user" else "🎬"):
            st.markdown(message["content"])

            # Show sources if they exist and toggle is on
            if show_sources and "sources" in message:
                with st.expander(f"📚 Sources ({len(message['sources'])} chunks retrieved)"):
                    for src in message["sources"]:
                        st.markdown(
                            f'<div class="source-box">'
                            f'<strong>{src["source"]}</strong> ({src["type"]})<br>'
                            f'{src["preview"]}'
                            f'</div>',
                            unsafe_allow_html=True,
                        )

    # ── Chat input ───────────────────────────────────────────────────────
    if prompt := st.chat_input("Ask about the AE Promo Versioning Pipeline..."):
        # Check API key before proceeding
        if not key_ok:
            st.error(f"Please set {key_name} in your .env file first. Get it at: {key_url}")
            return

        # Add user message to chat
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user", avatar="🧑‍💻"):
            st.markdown(prompt)

        # Generate response
        with st.chat_message("assistant", avatar="🎬"):
            with st.spinner("🔍 Retrieving relevant documents..."):
                try:
                    chain, retriever = build_chain(provider)

                    # Get answer
                    answer = chain.invoke(prompt)
                    st.markdown(answer)

                    # Get sources for display
                    source_info = []
                    if show_sources:
                        docs = retriever.invoke(prompt)
                        for doc in docs:
                            source_info.append({
                                "source": doc.metadata.get("source", "unknown"),
                                "type": doc.metadata.get("type", "unknown"),
                                "preview": doc.page_content[:150] + "...",
                            })

                        with st.expander(f"📚 Sources ({len(docs)} chunks retrieved)"):
                            for src in source_info:
                                st.markdown(
                                    f'<div class="source-box">'
                                    f'<strong>{src["source"]}</strong> ({src["type"]})<br>'
                                    f'{src["preview"]}'
                                    f'</div>',
                                    unsafe_allow_html=True,
                                )

                    # Save to chat history
                    msg = {"role": "assistant", "content": answer}
                    if source_info:
                        msg["sources"] = source_info
                    st.session_state.messages.append(msg)

                except Exception as e:
                    error_msg = str(e)
                    st.error(f"❌ Error: {error_msg}")

                    if "credit balance" in error_msg.lower():
                        st.info("💡 Tip: Switch to Groq (free) in the sidebar")
                    elif "quota" in error_msg.lower() or "429" in error_msg:
                        st.info("💡 Rate limited — wait 30 seconds and try again, or switch provider in sidebar")


if __name__ == "__main__":
    main()
