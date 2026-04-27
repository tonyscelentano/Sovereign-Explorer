import asyncio
import os
import google.generativeai as genai
from qdrant_client import QdrantClient
from fastmcp import FastMCP

# Configuration
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
DEFAULT_COLLECTION = os.environ.get("DEFAULT_COLLECTION", "workspace-index") # Default semantic index collection

if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY not set. Semantic search will fail.")

# Initialize clients
genai.configure(api_key=GEMINI_API_KEY)
qdrant = QdrantClient(url=QDRANT_URL)
mcp = FastMCP("sovereign-index")

@mcp.tool()
async def semantic_search(query: str, collection: str = DEFAULT_COLLECTION, model: str = "models/gemini-embedding-001", limit: int = 5) -> str:
    """
    Perform a semantic search across the indexed workspace using Roo Code's Qdrant collection.
    Use this to find code logic, patterns, or specific files by intent.
    """
    try:
        # 1. Generate embedding using the specified model
        embedding_response = genai.embed_content(
            model=model,
            content=query,
            task_type="retrieval_query",
            # target_size=3072 # Optional: standard for Roo's text-embedding-004
        )
        vector = embedding_response['embedding']

        # 2. Search Qdrant
        search_results = qdrant.query_points(
            collection_name=collection,
            query=vector,
            limit=limit
        ).points

        if not search_results:
            return "No semantic matches found for that query."

        # 3. Format results
        output = [f"Semantic search results for: '{query}'\n"]
        for i, res in enumerate(search_results):
            # Roo Code schema: filePath, codeChunk, startLine
            payload = res.payload
            path = payload.get("filePath", "Unknown Path")
            content = payload.get("codeChunk", "")
            start_line = payload.get("startLine", "?")
            score = res.score
            
            output.append(f"[{i+1}] {path} (Line: {start_line}, Score: {score:.4f})")
            if content:
                snippet = content[:300].replace("\n", " ") + "..."
                output.append(f"    Snippet: {snippet}")
            output.append("-" * 40)

        return "\n".join(output)

    except Exception as e:
        return f"Error during semantic search: {str(e)}"

@mcp.tool()
async def health_check() -> str:
    """Verify connectivity to Qdrant and Gemini API."""
    try:
        collections = qdrant.get_collections()
        col_names = [c.name for c in collections.collections]
        return f"Status: OK\nQdrant URL: {QDRANT_URL}\nCollections found: {', '.join(col_names)}"
    except Exception as e:
        return f"Status: ERROR\nReason: {str(e)}"

if __name__ == "__main__":
    import sys
    # Simple CLI test mode: python qdrant_bridge.py "my query"
    if len(sys.argv) > 1 and sys.argv[1] != "health_check":
        query_text = " ".join(sys.argv[1:])
        print(asyncio.run(semantic_search.fn(query_text)))
    elif len(sys.argv) > 1 and sys.argv[1] == "health_check":
        print(asyncio.run(health_check.fn()))
    else:
        mcp.run()
