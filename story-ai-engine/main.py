from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import ollama
from fastapi.middleware.cors import CORSMiddleware
import json, os, re, time

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

PROJECTS_DIR = "projects"
os.makedirs(PROJECTS_DIR, exist_ok=True)

class StoryInput(BaseModel):
    text: str
    project_id: str = "default"

class ProjectCreate(BaseModel):
    title: str
    subtitle: str = ""

class AIInput(BaseModel):
    text: str
    project_id: str = "default"
    mode: str = "write"

class ChatInput(BaseModel):
    message: str
    project_id: str = "default"
    history: list = []

def ppath(pid):
    safe = re.sub(r'[^a-zA-Z0-9_-]', '_', pid)
    return os.path.join(PROJECTS_DIR, f"{safe}.json")

def load_proj(pid):
    path = ppath(pid)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            try: return json.load(f)
            except: pass
    return {"project_id": pid, "characters": [], "chapters": {}, "relationships": []}

def save_proj(pid, data):
    with open(ppath(pid), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

def load_idx():
    p = os.path.join(PROJECTS_DIR, "_index.json")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            try: return json.load(f)
            except: pass
    return []

def save_idx(projects):
    with open(os.path.join(PROJECTS_DIR, "_index.json"), "w", encoding="utf-8") as f:
        json.dump(projects, f, indent=4, ensure_ascii=False)

def ollama_call(prompt, temp=0.7):
    try:
        r = ollama.generate(model='llama3.2:1b', prompt=prompt, options={'temperature': temp})
        return r['response'].strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def root():
    return {"status": "Story AI Engine v3.0"}

@app.get("/projects")
def all_projects():
    return load_idx()

@app.post("/projects/create")
def create_project(data: ProjectCreate):
    pid = f"proj_{int(time.time())}"
    np = {"project_id": pid, "title": data.title, "subtitle": data.subtitle, "words": 0, "modified": "just now", "color": "#2d6a4f"}
    idx = load_idx(); idx.insert(0, np); save_idx(idx)
    save_proj(pid, {"project_id": pid, "title": data.title, "characters": [], "chapters": {}, "relationships": [], "chat_history": []})
    return np

@app.get("/projects/{pid}/bible")
def get_bible(pid: str):
    return load_proj(pid)

@app.get("/projects/{pid}/chapter")
def get_chapter(pid: str):
    proj = load_proj(pid)
    return {"text": proj.get('chapters', {}).get('main', '')}

@app.delete("/projects/{pid}")
def delete_project(pid: str):
    idx = [p for p in load_idx() if p['project_id'] != pid]; save_idx(idx)
    path = ppath(pid)
    if os.path.exists(path): os.remove(path)
    return {"status": "deleted"}

@app.post("/save-chapter")
async def save_chapter(data: StoryInput):
    proj = load_proj(data.project_id)
    proj.setdefault('chapters', {})['main'] = data.text
    save_proj(data.project_id, proj)
    wc = len(data.text.split()) if data.text.strip() else 0
    idx = load_idx()
    for p in idx:
        if p['project_id'] == data.project_id:
            p['words'] = wc; p['modified'] = "just now"; break
    save_idx(idx)
    return {"status": "saved", "words": wc}

@app.post("/sync-bible")
async def sync_bible(data: StoryInput):
    proj = load_proj(data.project_id)
    existing = [c['name'] for c in proj.get('characters', [])]
    prompt = (
        "You are a Story Database Architect.\n"
        "Known Characters: " + str(existing) + "\n\n"
        "Story Text:\n" + data.text[:3000] + "\n\n"
        "Extract ALL characters. Return ONLY a valid JSON array:\n"
        '[{"name": "...", "role": "...", "description": "...", "dialogue_style": "..."}]'
    )
    try:
        raw = ollama_call(prompt, temp=0)
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            new_chars = json.loads(match.group())
            for nc in new_chars:
                if not nc.get('name'): continue
                found = False
                for i, oc in enumerate(proj['characters']):
                    if oc.get('name', '').lower() == nc['name'].lower():
                        proj['characters'][i].update(nc); found = True; break
                if not found: proj['characters'].append(nc)
            save_proj(data.project_id, proj)
    except Exception as e:
        print(f"Sync error: {e}")
    return proj

@app.post("/ai/write")
async def ai_write(data: AIInput):
    proj = load_proj(data.project_id)
    chars = proj.get('characters', [])
    char_ctx = ", ".join([f"{c['name']} ({c['role']})" for c in chars]) if chars else "none"
    prompt = (
        "You are a creative fiction writer. Continue the story naturally.\n"
        "Keep the same tone, style, and voice.\n"
        "Known characters: " + char_ctx + "\n\n"
        "Story so far:\n" + data.text[-1500:] + "\n\n"
        "Write the next 2-3 paragraphs:"
    )
    return {"result": ollama_call(prompt), "mode": "write"}

@app.post("/ai/rewrite")
async def ai_rewrite(data: AIInput):
    selection = data.text[-600:] if len(data.text) > 600 else data.text
    prompt = (
        "You are a professional fiction editor. Rewrite this passage to make it more vivid and engaging.\n"
        "Keep the same events but improve the prose quality.\n\n"
        "Passage to rewrite:\n" + selection + "\n\nRewritten version:"
    )
    return {"result": ollama_call(prompt), "mode": "rewrite"}

@app.post("/ai/describe")
async def ai_describe(data: AIInput):
    prompt = (
        "You are a descriptive fiction writer. Add rich sensory details to this scene.\n"
        "Make the setting come alive with vivid description.\n\n"
        "Scene:\n" + data.text[-800:] + "\n\nEnhanced version with sensory description:"
    )
    return {"result": ollama_call(prompt), "mode": "describe"}

@app.post("/ai/orwell")
async def ai_orwell(data: AIInput):
    prompt = (
        "You are a professional literary editor. Analyze this text.\n\n"
        "Give feedback on:\n"
        "1. CLARITY\n2. CONCISENESS\n3. PASSIVE VOICE\n4. WEAK WORDS\n5. SHOW vs TELL\n6. SCORE (1-10) + 3 improvements\n\n"
        "Text:\n" + data.text[-1000:] + "\n\nAnalysis:"
    )
    return {"result": ollama_call(prompt), "mode": "orwell"}

@app.post("/ai/chat")
async def ai_chat(data: ChatInput):
    proj = load_proj(data.project_id)
    chars = proj.get('characters', [])
    char_ctx = "Story characters: " + ", ".join([f"{c['name']} ({c['role']})" for c in chars]) if chars else ""
    hist = ""
    for msg in data.history[-6:]:
        role = "User" if msg['role'] == 'user' else "Assistant"
        hist += f"{role}: {msg['content']}\n"
    prompt = (
        "You are a creative writing assistant helping a fiction author.\n"
        "You can help with: story ideas, character profiles, plot outlines, dialogue, worldbuilding, writing advice.\n"
        + char_ctx + "\n\n"
        "Be creative and detailed.\n\n"
        + hist +
        "User: " + data.message + "\nAssistant:"
    )
    result = ollama_call(prompt)
    return {"result": result, "role": "assistant"}

@app.get("/get-bible")
def get_bible_legacy():
    return load_proj("default")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)