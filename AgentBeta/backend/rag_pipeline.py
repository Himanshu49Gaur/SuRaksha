import os
import sqlite3
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone, ServerlessSpec

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sentinel_regai.db")

def get_setting(key_name):
    val = os.getenv(key_name.upper())
    if val:
        return val
    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = ?", (key_name,))
            row = cursor.fetchone()
            conn.close()
            if row and row['value'].strip():
                return row['value'].strip()
        except Exception:
            pass
    return None

class RAGPipeline:
    def __init__(self, index_name="sentinel-compliance"):
        self.index_name = index_name
        self.pinecone_api_key = get_setting("pinecone_api_key")
        self.gemini_api_key = get_setting("gemini_api_key")
        self.vector_store = None
        
        if self.pinecone_api_key and self.gemini_api_key:
            try:
                self.pc = Pinecone(api_key=self.pinecone_api_key)
                if self.index_name not in self.pc.list_indexes().names():
                    self.pc.create_index(
                        name=self.index_name,
                        dimension=768, # Google GenAI embeddings dimension
                        metric='cosine',
                        spec=ServerlessSpec(cloud='aws', region='us-east-1')
                    )
                
                self.embeddings = GoogleGenerativeAIEmbeddings(
                    model="models/embedding-001", 
                    google_api_key=self.gemini_api_key
                )
                self.vector_store = PineconeVectorStore(
                    index_name=self.index_name, 
                    embedding=self.embeddings, 
                    pinecone_api_key=self.pinecone_api_key
                )
                print("RAG Pipeline initialized successfully with Pinecone.")
            except Exception as e:
                print(f"Error initializing Pinecone/RAG: {e}")

    def index_document(self, text: str, metadata: dict = None):
        """Indexes a single document or chunk into Pinecone."""
        if not self.vector_store:
            print("RAG not initialized (Missing API Keys). Skipping indexing.")
            return False
            
        try:
            self.vector_store.add_texts([text], metadatas=[metadata] if metadata else None)
            return True
        except Exception as e:
            print(f"Error indexing to Pinecone: {e}")
            return False

    def retrieve_context(self, query: str, top_k=3):
        """Retrieves relevant compliance context for a given query."""
        if not self.vector_store:
            return ""
            
        try:
            docs = self.vector_store.similarity_search(query, k=top_k)
            context = "\n---\n".join([doc.page_content for doc in docs])
            return context
        except Exception as e:
            print(f"Error retrieving from Pinecone: {e}")
            return ""

rag_pipeline = RAGPipeline()
