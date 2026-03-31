import chromadb
from chromadb.utils import embedding_functions

# Local database setup
client = chromadb.PersistentClient(path="./story_bible_db")
# Embedding function (Ye text ko vectors mein badle ga - 8GB RAM ke liye perfect hai)
model_ef = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")

collection = client.get_or_create_collection(name="story_bible", embedding_function=model_ef)

def save_to_bible(text, metadata):
    # Story ka chunk save karna
    collection.add(
        documents=[text],
        metadatas=[metadata],
        ids=[str(metadata['id'])]
    )

def search_bible(query):
    # Query se milti julti info nikalna
    results = collection.query(
        query_texts=[query],
        n_results=2
    )
    return results['documents']