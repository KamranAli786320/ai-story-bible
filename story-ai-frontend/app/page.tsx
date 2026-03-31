"use client";
import { useState, useEffect, useRef } from "react";
import axios from "axios";

interface Character { name: string; role: string; description: string; dialogue_style?: string; }
interface Project { project_id: string; title: string; subtitle: string; words: number | string; modified: string; color: string; }
interface Bible { characters: Character[]; }
interface ChatMsg { role: "user" | "assistant"; content: string; }

const COLORS = ["#2d6a4f","#3b5bdb","#c84b31","#ae3ec9","#e67700","#1098ad"];
const DOCS = ["Title Page","Contents","Part I","Chapter I","Chapter II","Chapter III"];
const API = "http://127.0.0.1:8000";

export default function SudowriteClone() {
  const [view, setView] = useState<"dashboard"|"editor">("dashboard");
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActive] = useState<Project|null>(null);
  const [activeDoc, setActiveDoc] = useState("Title Page");
  const [text, setText] = useState("");
  const [bible, setBible] = useState<Bible>({characters:[]});
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rightTab, setRightTab] = useState<"History"|"Chat"|"Story Bible">("History");
  const [showBibleSub, setShowBibleSub] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSubtitle, setNewSubtitle] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{text:string;mode:string}|null>(null);
  const [aiLoading, setAiLoading] = useState<string|null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [chatMessages]);

  const fetchProjects = async () => {
    try { const r = await axios.get(`${API}/projects`); setProjects(r.data||[]); } catch {}
  };

  const openProject = async (p: Project) => {
    setActive(p); setView("editor"); setBible({characters:[]}); setText(""); setChatMessages([]);
    try { const r = await axios.get(`${API}/projects/${p.project_id}/chapter`); setText(r.data.text||""); } catch {}
    try { const r = await axios.get(`${API}/projects/${p.project_id}/bible`); setBible({characters:r.data.characters||[]}); } catch {}
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  useEffect(() => {
    if (!activeProject || view !== "editor") return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(doAutoSave, 2000);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [text]);

  const doAutoSave = async () => {
    if (!activeProject || !text.trim()) return;
    setSaving(true);
    try { await axios.post(`${API}/save-chapter`, {text, project_id: activeProject.project_id}); }
    catch {} finally { setSaving(false); }
  };

  const createProject = async () => {
    if (!newTitle.trim()) return;
    try {
      const r = await axios.post(`${API}/projects/create`, {title:newTitle.trim(), subtitle:newSubtitle.trim()});
      const np: Project = {...r.data, color: COLORS[projects.length % COLORS.length]};
      setProjects(prev => [np,...prev]);
      setNewTitle(""); setNewSubtitle(""); setShowNewModal(false);
      openProject(np);
    } catch { alert("Backend se connect nahi ho saka."); }
  };

  const deleteProject = async (p: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`"${p.title}" delete karein?`)) return;
    try { await axios.delete(`${API}/projects/${p.project_id}`); setProjects(prev => prev.filter(x=>x.project_id!==p.project_id)); }
    catch { alert("Delete nahi ho saka."); }
  };

  const syncBible = async () => {
    if (!text.trim()||!activeProject) return;
    setSyncing(true);
    try {
      const r = await axios.post(`${API}/sync-bible`, {text, project_id:activeProject.project_id});
      setBible({characters:r.data.characters||[]}); setRightTab("History");
    } catch { alert("Backend nahi mila."); }
    finally { setSyncing(false); }
  };

  const runAITool = async (mode: string) => {
    if (!text.trim()) { alert("Pehle kuch text likho!"); return; }
    setAiLoading(mode); setAiResult(null); setRightTab("History");
    const endpoints: Record<string,string> = {write:"/ai/write", rewrite:"/ai/rewrite", describe:"/ai/describe", orwell:"/ai/orwell"};
    try {
      const r = await axios.post(`${API}${endpoints[mode]}`, {text, project_id:activeProject?.project_id||"default"});
      setAiResult({text: r.data.result, mode});
    } catch { alert("AI tool error. Backend check karein."); }
    finally { setAiLoading(null); }
  };

  const insertAIResult = () => {
    if (!aiResult) return;
    if (aiResult.mode === "orwell") { setRightTab("History"); return; }
    setText(prev => prev + "\n\n" + aiResult.text);
    setAiResult(null);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMsg = {role:"user", content:chatInput.trim()};
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput(""); setChatLoading(true);
    try {
      const r = await axios.post(`${API}/ai/chat`, {
        message: userMsg.content,
        project_id: activeProject?.project_id||"default",
        history: chatMessages.slice(-6)
      });
      setChatMessages(prev => [...prev, {role:"assistant", content:r.data.result}]);
    } catch { setChatMessages(prev => [...prev, {role:"assistant", content:"Error: Backend se connect nahi ho saka."}]); }
    finally { setChatLoading(false); }
  };

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  const toolLabels: Record<string,string> = {write:"Write More", rewrite:"Rewrite", describe:"Describe", orwell:"Orwell Check"};
  const toolIcons: Record<string,string> = {write:"✍️", rewrite:"🔄", describe:"🔍", orwell:"🧠"};

  // ── Modal ──
  const Modal = () => (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center" onClick={()=>setShowNewModal(false)}>
      <div className="bg-white rounded-2xl p-8 w-[420px] shadow-2xl" onClick={e=>e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-6" style={{fontFamily:"Georgia,serif"}}>New Project</h2>
        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#999] font-sans block mb-1">Title *</label>
            <input autoFocus value={newTitle} onChange={e=>setNewTitle(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createProject()} placeholder="My Novel"
              className="w-full border border-[#e0dbd3] rounded-xl px-4 py-3 text-[15px] outline-none focus:border-[#2d6a4f] font-sans"/>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#999] font-sans block mb-1">Subtitle</label>
            <input value={newSubtitle} onChange={e=>setNewSubtitle(e.target.value)} placeholder="Draft 1..."
              className="w-full border border-[#e0dbd3] rounded-xl px-4 py-3 text-[15px] outline-none focus:border-[#2d6a4f] font-sans"/>
          </div>
        </div>
        <div className="flex gap-3 mt-8">
          <button onClick={()=>setShowNewModal(false)} className="flex-1 py-3 border border-[#e0dbd3] rounded-xl font-sans font-semibold text-[#666] hover:bg-[#f5f0eb] transition-all">Cancel</button>
          <button onClick={createProject} className="flex-1 py-3 bg-[#2d6a4f] text-white rounded-xl font-sans font-bold hover:bg-[#245741] transition-all">Create</button>
        </div>
      </div>
    </div>
  );

  // ── DASHBOARD ──
  if (view === "dashboard") return (
    <div style={{fontFamily:"Georgia,serif"}} className="min-h-screen bg-[#f5f0eb]">
      {showNewModal && <Modal/>}
      <header className="flex items-center justify-between px-10 py-5 border-b border-[#ddd8d0] bg-[#f5f0eb]">
        <div className="flex gap-3">
          <button onClick={()=>setShowNewModal(true)} className="px-4 py-2 text-sm font-semibold font-sans bg-[#2d6a4f] text-white rounded-lg hover:bg-[#245741] transition-all">+ New Project</button>
          <button className="px-4 py-2 text-sm font-semibold font-sans border border-[#c5bfb7] rounded-lg hover:bg-[#ece7e0] transition-all text-[#555]">Import</button>
        </div>
        <div className="text-2xl tracking-tight"><span className="font-bold italic">sudo</span><span className="font-light opacity-50">write</span></div>
        <div className="flex gap-5 text-[#888] text-xl font-sans">
          <button className="hover:text-[#333]">🔍</button><button className="hover:text-[#333]">⚙️</button>
          <div className="w-8 h-8 rounded-full bg-[#2d6a4f] flex items-center justify-center text-white text-xs font-bold font-sans">U</div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-10 py-12">
        <p className="text-[11px] font-bold font-sans text-[#999] uppercase tracking-[0.2em] mb-8">{projects.length===0?"No projects yet":"Recent Projects"}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {projects.map((p,i) => (
            <div key={p.project_id} onClick={()=>openProject(p)}
              className="group relative bg-white border border-[#e0dbd3] rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer">
              <button onClick={e=>deleteProject(p,e)} className="absolute top-3 right-3 w-6 h-6 rounded-full bg-white/80 text-[#bbb] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all text-sm flex items-center justify-center shadow-sm z-10">×</button>
              <div className="h-2 w-full" style={{backgroundColor:COLORS[i%COLORS.length]}}/>
              <div className="p-6 flex flex-col" style={{minHeight:200}}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold mb-4 font-sans" style={{backgroundColor:COLORS[i%COLORS.length]}}>{p.title[0]}</div>
                <h3 className="text-base font-bold text-[#1a1a1a] leading-snug mb-1 group-hover:text-[#2d6a4f] transition-colors">{p.title}</h3>
                <p className="text-[11px] text-[#999] italic mb-auto font-sans">{p.subtitle||"No subtitle"}</p>
                <div className="mt-4 text-[10px] text-[#bbb] uppercase tracking-wider font-bold font-sans">
                  {typeof p.words==="number"?p.words.toLocaleString():p.words} words · {p.modified}
                </div>
              </div>
            </div>
          ))}
          <button onClick={()=>setShowNewModal(true)} className="bg-white border-2 border-dashed border-[#d0cbc3] rounded-2xl p-6 flex flex-col items-center justify-center opacity-50 hover:opacity-100 hover:border-[#2d6a4f] transition-all min-h-[220px] cursor-pointer">
            <div className="text-4xl mb-3 text-[#999]">+</div>
            <p className="text-[11px] font-bold font-sans uppercase tracking-wider text-[#666]">New Project</p>
          </button>
        </div>
        {projects.length===0&&<div className="text-center mt-20 opacity-40"><p className="text-5xl mb-4">📚</p><p className="text-sm font-sans text-[#666]">Koi project nahi hai.<br/>Upar "+ New Project" se shuru karein.</p></div>}
      </main>
    </div>
  );

  // ── EDITOR ──
  return (
    <div style={{fontFamily:"Georgia,serif"}} className="flex flex-col h-screen bg-[#f9f6f2] text-[#1a1a1a] overflow-hidden">
      {/* Top Nav */}
      <header className="h-[52px] flex items-center justify-between px-5 border-b border-[#e0dbd3] bg-white shrink-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={()=>{setView("dashboard");fetchProjects();}} className="flex items-center gap-1.5 text-sm text-[#888] hover:text-[#1a1a1a] font-sans">← Dashboard</button>
          <div className="w-px h-4 bg-[#ddd]"/>
          {/* AI Tool Buttons */}
          {["write","rewrite","describe","orwell"].map(mode=>(
            <button key={mode} onClick={()=>runAITool(mode)} disabled={!!aiLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold font-sans rounded-lg transition-all
                ${aiLoading===mode?"bg-[#2d6a4f] text-white animate-pulse":"bg-[#f0ece7] hover:bg-[#e5e0d8] text-[#444]"}
                ${aiLoading&&aiLoading!==mode?"opacity-50 cursor-not-allowed":""}`}>
              <span>{toolIcons[mode]}</span>
              <span className="hidden sm:inline">{toolLabels[mode]}</span>
            </button>
          ))}
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-[#444] truncate max-w-[250px]">{activeProject?.title}</div>
        <div className="flex items-center gap-3 font-sans">
          <span className="text-[11px] text-[#aaa]">{saving?"Saving…":"✓ Saved"}</span>
          <span className="text-[11px] text-[#aaa]">{wordCount.toLocaleString()} words</span>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-400"/><span className="text-[10px] text-[#999]">Ollama</span></div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-56 bg-[#f0ece7] border-r border-[#e0dbd3] flex flex-col shrink-0 overflow-y-auto">
          <div className="px-4 pt-5 pb-2"><p className="text-[10px] font-bold font-sans uppercase tracking-[0.2em] text-[#aaa] mb-3 truncate">{activeProject?.title}</p></div>
          <nav className="px-3 pb-4 space-y-0.5">
            {DOCS.map(doc=>(
              <button key={doc} onClick={()=>setActiveDoc(doc)}
                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-all font-sans ${activeDoc===doc?"bg-white shadow-sm text-[#1a1a1a] font-semibold border border-[#e0dbd3]":"text-[#666] hover:bg-[#e5e0d8]"}`}>
                {doc}
              </button>
            ))}
          </nav>
          <div className="border-t border-[#e0dbd3] px-3 pt-4 pb-4">
            <button onClick={()=>setShowBibleSub(s=>!s)} className="w-full flex items-center justify-between px-2 mb-2">
              <span className="text-[10px] font-bold font-sans uppercase tracking-[0.2em] text-[#aaa]">Story Bible</span>
              <span className="text-[#aaa] text-xs">{showBibleSub?"▾":"▸"}</span>
            </button>
            {showBibleSub&&["Braindump","Genre & Style","Synopsis","Characters","Worldbuilding","Outlines"].map(item=>(
              <button key={item} onClick={()=>setRightTab("Story Bible")}
                className="w-full text-left px-3 py-1.5 text-[12px] font-sans text-[#666] hover:bg-[#e5e0d8] rounded-lg transition-colors">{item}</button>
            ))}
          </div>
        </aside>

        {/* Center Editor */}
        <main className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* AI Result Banner */}
          {aiResult&&(
            <div className="border-b border-[#e0dbd3] bg-[#f0fdf4] px-6 py-4 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold font-sans uppercase tracking-wider text-[#2d6a4f]">
                  {aiResult.mode==="orwell"?"📊 Orwell Analysis":"✨ AI Result — "+toolLabels[aiResult.mode]}
                </span>
                <div className="flex gap-2">
                  {aiResult.mode!=="orwell"&&(
                    <button onClick={insertAIResult} className="px-3 py-1 text-xs font-sans font-bold bg-[#2d6a4f] text-white rounded-lg hover:bg-[#245741]">Insert into Story</button>
                  )}
                  <button onClick={()=>setAiResult(null)} className="px-3 py-1 text-xs font-sans font-bold border border-[#e0dbd3] rounded-lg hover:bg-[#f5f0eb] text-[#666]">Dismiss</button>
                </div>
              </div>
              <div className="text-sm font-sans text-[#333] leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap bg-white rounded-xl p-3 border border-[#e0dbd3]">
                {aiResult.text}
              </div>
            </div>
          )}
          {aiLoading&&(
            <div className="border-b border-[#e0dbd3] bg-[#fffbeb] px-6 py-3 shrink-0 flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-[#2d6a4f] border-t-transparent rounded-full animate-spin"/>
              <span className="text-sm font-sans text-[#666]">AI is {toolLabels[aiLoading]?.toLowerCase()}…</span>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-16 py-12">
            <div className="max-w-[680px] mx-auto">
              <p className="text-[11px] font-sans font-bold uppercase tracking-[0.25em] text-[#bbb] mb-6">{activeDoc}</p>
              <textarea ref={textareaRef} value={text} onChange={e=>setText(e.target.value)} placeholder="Start writing here…"
                className="w-full bg-transparent text-[19px] leading-[1.85] text-[#1a1a1a] outline-none resize-none placeholder-[#ccc]"
                style={{minHeight:"60vh",fontFamily:"Georgia,serif"}}/>
            </div>
          </div>
          <div className="border-t border-[#e8e3dd] bg-[#f9f6f2] px-8 py-4 shrink-0">
            <button onClick={syncBible} disabled={syncing}
              className={`w-full py-3 rounded-xl font-sans font-bold text-sm tracking-wide transition-all ${syncing?"bg-[#d0d0d0] text-white cursor-not-allowed":"bg-[#2d6a4f] hover:bg-[#245741] text-white shadow-md active:scale-[0.98]"}`}>
              {syncing?"✦ AI is analyzing…":"✦ Sync Story Bible"}
            </button>
          </div>
        </main>

        {/* Right Panel */}
        <aside className="w-[380px] bg-[#f9f6f2] border-l border-[#e0dbd3] flex flex-col shrink-0">
          <div className="flex border-b border-[#e0dbd3] bg-white shrink-0">
            {(["History","Chat","Story Bible"] as const).map(tab=>(
              <button key={tab} onClick={()=>setRightTab(tab)}
                className={`flex-1 py-3 text-[11px] font-sans font-bold uppercase tracking-[0.15em] transition-all border-b-2 ${rightTab===tab?"border-[#2d6a4f] text-[#2d6a4f] bg-white":"border-transparent text-[#aaa] hover:text-[#555]"}`}>
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* HISTORY */}
            {rightTab==="History"&&(
              <div className="p-5 space-y-4">
                {bible.characters.length===0?(
                  <div className="flex flex-col items-center justify-center text-center opacity-30 py-20">
                    <div className="text-5xl mb-4">📖</div>
                    <p className="text-[11px] font-sans font-bold uppercase tracking-wider leading-loose">Write something and hit<br/>Sync Story Bible</p>
                  </div>
                ):bible.characters.map((char,i)=>(
                  <div key={i} className="bg-white border border-[#e5e0d8] rounded-2xl p-5 hover:shadow-md hover:border-[#2d6a4f]/40 transition-all">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0" style={{background:COLORS[i%COLORS.length]}}>{char.name?.[0]??"?"}</div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-[14px] text-[#1a1a1a] truncate">{char.name}</h4>
                        <p className="text-[10px] font-sans font-bold uppercase tracking-widest text-[#2d6a4f]">{char.role}</p>
                      </div>
                    </div>
                    <p className="text-[13px] text-[#666] leading-relaxed italic font-sans">"{char.description}"</p>
                    {char.dialogue_style&&<div className="mt-3 text-[11px] font-sans bg-[#f0ece7] rounded-lg px-3 py-1.5 text-[#777]"><span className="font-bold text-[#555]">Style: </span>{char.dialogue_style}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* CHAT */}
            {rightTab==="Chat"&&(
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{maxHeight:"calc(100vh - 200px)"}}>
                  {chatMessages.length===0&&(
                    <div className="text-center py-12 opacity-30">
                      <div className="text-4xl mb-3">💬</div>
                      <p className="text-[11px] font-sans font-bold uppercase tracking-wider leading-loose">Ask me anything about your story!<br/>Characters, plot, dialogue, ideas…</p>
                    </div>
                  )}
                  {chatMessages.map((msg,i)=>(
                    <div key={i} className={`flex ${msg.role==="user"?"justify-end":"justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm font-sans leading-relaxed
                        ${msg.role==="user"?"bg-[#2d6a4f] text-white rounded-br-sm":"bg-white border border-[#e5e0d8] text-[#333] rounded-bl-sm"}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading&&(
                    <div className="flex justify-start">
                      <div className="bg-white border border-[#e5e0d8] rounded-2xl rounded-bl-sm px-4 py-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 rounded-full bg-[#aaa] animate-bounce" style={{animationDelay:"0ms"}}/>
                          <div className="w-2 h-2 rounded-full bg-[#aaa] animate-bounce" style={{animationDelay:"150ms"}}/>
                          <div className="w-2 h-2 rounded-full bg-[#aaa] animate-bounce" style={{animationDelay:"300ms"}}/>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef}/>
                </div>
                {/* Chat Input */}
                <div className="border-t border-[#e0dbd3] p-4 bg-white shrink-0">
                  <div className="flex gap-2">
                    <textarea value={chatInput} onChange={e=>setChatInput(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}}
                      placeholder="Ask about your story… (Enter to send)"
                      className="flex-1 border border-[#e0dbd3] rounded-xl px-4 py-2.5 text-sm font-sans outline-none focus:border-[#2d6a4f] resize-none"
                      rows={2}/>
                    <button onClick={sendChat} disabled={chatLoading||!chatInput.trim()}
                      className="w-10 h-10 mt-auto rounded-xl bg-[#2d6a4f] text-white flex items-center justify-center hover:bg-[#245741] disabled:opacity-40 transition-all shrink-0">
                      ↑
                    </button>
                  </div>
                  <p className="text-[10px] font-sans text-[#bbb] mt-1.5">Shift+Enter for new line</p>
                </div>
              </div>
            )}

            {/* STORY BIBLE */}
            {rightTab==="Story Bible"&&(
              <div className="p-5">
                <p className="text-[11px] font-sans font-bold uppercase tracking-[0.2em] text-[#aaa] mb-5">{activeProject?.title} — Characters</p>
                {bible.characters.length===0?(
                  <p className="text-[13px] font-sans text-[#bbb] italic text-center mt-10">No characters synced yet.</p>
                ):bible.characters.map((char,i)=>(
                  <div key={i} className="mb-4 p-4 border border-[#e5e0d8] rounded-xl bg-white">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[13px]">{char.name}</span>
                      <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-[#2d6a4f] px-2 py-0.5 bg-[#f0ece7] rounded-full">{char.role}</span>
                    </div>
                    <p className="text-[12px] font-sans text-[#777] leading-relaxed">{char.description}</p>
                    {char.dialogue_style&&<p className="text-[11px] font-sans text-[#999] mt-1 italic">Style: {char.dialogue_style}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}