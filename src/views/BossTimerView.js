// src/views/BossTimerView.js
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, Loader2, Globe, Image as ImageIcon, Sparkles, AlertCircle, Settings, X, Trash2
} from 'lucide-react';
import { collection, deleteDoc, doc, onSnapshot, query, orderBy, addDoc } from "firebase/firestore";
import { db } from '../config/firebase';
import { formatTimeWithSeconds, formatTimeOnly } from '../utils/helpers';
import SellerSuggestionStrip from '../components/SellerSuggestionStrip';

// 🔴 請填入您的 API Key (已更新為 2.5 Flash)
const GEMINI_API_KEY = process.env.REACT_APP_GEMINI_API_KEY;
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const BossTimerView = ({ isDarkMode, currentUser, members = [] }) => {
  // === Data States ===
  const [timelineTypes, setTimelineTypes] = useState([]);
  const [timelineRecords, setTimelineRecords] = useState([]);
  const [now, setNow] = useState(new Date()); 
  
  // 時間校正狀態
  const [timeOffset, setTimeOffset] = useState(0); 
  const [isTimeSynced, setIsTimeSynced] = useState(false);

  // === AI 圖片分析狀態 ===
  const [pastedImage, setPastedImage] = useState(null); 
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState("");
  const [analysisError, setAnalysisError] = useState("");

  // === Timeline Modal States ===
  const [isTimelineSettingsOpen, setIsTimelineSettingsOpen] = useState(false);
  const [timelineTypeForm, setTimelineTypeForm] = useState({ name: '', interval: 60, color: '#FF5733' });
  const [timelineRecordForm, setTimelineRecordForm] = useState({ typeId: '', deathDate: '', deathTime: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 乾淨的成員名單 (給掛賣建議用)
  const filteredMembers = useMemo(() => {
    return members.filter(m => m.hideFromAccounting !== true);
  }, [members]);

  // === Data Fetching ===
  useEffect(() => {
    if (!db) return;
    const q3 = query(collection(db, "timeline_types"), orderBy("interval"));
    const unsub3 = onSnapshot(q3, snap => setTimelineTypes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const q4 = query(collection(db, "timeline_records"), orderBy("deathTimestamp", "desc"));
    const unsub4 = onSnapshot(q4, snap => setTimelineRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => { unsub3(); unsub4(); };
  }, []);

  // 網路時間校正
  useEffect(() => {
    const syncTime = async () => {
        try {
            const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
            const serverDateStr = response.headers.get('Date');
            if (serverDateStr) {
                const serverTime = new Date(serverDateStr).getTime();
                const offset = serverTime - Date.now();
                setTimeOffset(offset);
                setIsTimeSynced(true);
            }
        } catch (e) {
            console.warn("Time sync failed", e);
        }
    };
    syncTime();
  }, []);

  // 核心計時器
  useEffect(() => {
    const timer = setInterval(() => {
        setNow(new Date(Date.now() + timeOffset));
    }, 1000); 
    return () => clearInterval(timer);
  }, [timeOffset]); 

  // ==========================================
  // 🟢 監聽 Ctrl+V 貼上事件
  // ==========================================
  useEffect(() => {
    const handlePaste = async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64Data = event.target.result;
                    setPastedImage(base64Data);
                    analyzeImageWithGemini(base64Data); // 自動開始分析
                };
                reader.readAsDataURL(blob);
                break; // 只抓第一張圖
            }
        }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  // ==========================================
  // 🟢 Gemini API 圖片分析核心邏輯 (已修復 MIME Type 問題)
  // ==========================================
  const analyzeImageWithGemini = async (base64String) => {
      if (GEMINI_API_KEY.includes("請填入")) {
          setAnalysisError("尚未設定 Gemini API Key，請至程式碼中修改。");
          return;
      }

      setIsAnalyzing(true);
      setAnalysisResult("");
      setAnalysisError("");

      try {
          // 動態抓取圖片格式 (解決 PNG/JPEG 導致的 400 錯誤)
          const mimeType = base64String.substring(base64String.indexOf(":") + 1, base64String.indexOf(";"));
          const base64Data = base64String.split(',')[1];

          // 嚴格的 Prompt 提示詞 (要求精準計算間隔)
          const promptText = `
          這是一張遊戲 Boss 剩餘時間的截圖。請嚴格執行以下步驟：
          1. 辨識所有 Boss 的名稱與剩餘時間。
          2. 絕對要排除（忽略）「舒札坎」與「哈迪倫」這兩隻 Boss。
          3. 將剩下的 Boss 依照剩餘時間由少到多進行排序。
          4. 計算排序後，相鄰兩隻 Boss 之間的「剩餘時間差異（時間間隔）」。
          5. 請直接以下列的格式輸出，**絕對不要包含任何前言、解釋或Markdown語法**：
          
          BossA名稱 > 間隔 X分Y秒 > BossB名稱 > 間隔 X分Y秒 > BossC名稱

          確保時間計算精準！如果只有一隻 Boss，直接輸出該 Boss 名稱。
          `;

          const response = await fetch(GEMINI_API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  contents: [{
                      parts: [
                          { text: promptText },
                          { inline_data: { mime_type: mimeType, data: base64Data } }
                      ]
                  }]
              })
          });

          if (!response.ok) {
              const errData = await response.json();
              throw new Error(errData.error?.message || `API 請求失敗 (狀態碼: ${response.status})`);
          }

          const data = await response.json();
          const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "無法解析回傳結果";
          
          setAnalysisResult(reply.trim());

      } catch (error) {
          console.error(error);
          setAnalysisError(`分析失敗: ${error.message}`);
      } finally {
          setIsAnalyzing(false);
      }
  };

  // === Timeline Logic ===
  const handleAddTimelineType = async () => { if (currentUser === '訪客') return alert("訪客權限僅供瀏覽"); if (!timelineTypeForm.name || timelineTypeForm.interval <= 0) return alert("資料不完整"); setIsSubmitting(true); try { await addDoc(collection(db, "timeline_types"), timelineTypeForm); setTimelineTypeForm({ name: '', interval: 60, color: '#FF5733' }); } catch(e) { alert(e.message); } finally { setIsSubmitting(false); } };
  const handleDeleteTimelineType = async (id) => { if (currentUser === '訪客') return; if(window.confirm("確定刪除此設定？")) await deleteDoc(doc(db, "timeline_types", id)); };
  const handleAddTimelineRecord = async () => { if (currentUser === '訪客') return alert("訪客權限僅供瀏覽"); if (!timelineRecordForm.typeId || !timelineRecordForm.deathDate || !timelineRecordForm.deathTime) return alert("資料不完整"); setIsSubmitting(true); try { const ts = new Date(`${timelineRecordForm.deathDate}T${timelineRecordForm.deathTime}`).getTime(); await addDoc(collection(db, "timeline_records"), { typeId: timelineRecordForm.typeId, deathTimestamp: ts, creator: currentUser, createdAt: Date.now() }); setIsTimelineSettingsOpen(false); } catch(e) { alert(e.message); } finally { setIsSubmitting(false); } };
  const handleDeleteTimelineRecord = async (id) => { if (currentUser === '訪客') return; if(window.confirm("刪除此紀錄？")) await deleteDoc(doc(db, "timeline_records", id)); };

  const calculate2DayMarkers = () => { const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0); const totalDuration = 48 * 60 * 60 * 1000; const endOfTomorrow = new Date(startOfToday.getTime() + totalDuration); let rawMarkers = []; timelineRecords.forEach(record => { const type = timelineTypes.find(t => t.id === record.typeId); if (!type) return; const intervalMs = type.interval * 60 * 1000; let checkTime = record.deathTimestamp; if (checkTime < startOfToday.getTime()) { const diff = startOfToday.getTime() - checkTime; const jumps = Math.floor(diff / intervalMs); checkTime += jumps * intervalMs; } while (checkTime <= endOfTomorrow.getTime() + intervalMs) { if (checkTime >= startOfToday.getTime() && checkTime <= endOfTomorrow.getTime()) { const current = new Date(checkTime); const offsetMs = checkTime - startOfToday.getTime(); const percent = (offsetMs / totalDuration) * 100; rawMarkers.push({ id: record.id + '_' + checkTime, percent, time: formatTimeOnly(current), color: type.color, name: type.name, originalRecordId: record.id, interval: type.interval }); } checkTime += intervalMs; } }); rawMarkers.sort((a, b) => a.percent - b.percent); const levels = [ -10, -10, -10, -10 ]; return rawMarkers.map(marker => { let assignedLevel = 0; for (let i = 0; i < levels.length; i++) { if (marker.percent > levels[i] + 1.5) { assignedLevel = i; levels[i] = marker.percent; break; } if (i === levels.length - 1) { assignedLevel = 0; levels[0] = marker.percent; } } return { ...marker, level: assignedLevel }; }); };
  const markers = calculate2DayMarkers();
  
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const totalDuration = 48 * 60 * 60 * 1000;
  const currentOffset = now.getTime() - startOfToday.getTime();
  const currentPercent = Math.max(0, Math.min(100, (currentOffset / totalDuration) * 100));
  const highlightHours = [2, 5, 8, 11, 14, 17, 20, 23];
  
  const theme = { text: 'text-[var(--app-text)]', subText: 'opacity-60', input: isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800' };
  const formatDateSimple = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

  return (
    <div className="p-4 h-[calc(100vh-80px)] flex flex-col" style={{ color: 'var(--app-text)' }}>
      {/* Timeline Section */}
      <div className="mb-2 relative">
         <div className="flex relative mb-1 text-xs opacity-70 font-bold px-1 w-full">
             <span className="w-1/2 text-center border-r border-white/20">Today</span>
             <span className="w-1/2 text-center">Tomorrow</span>
         </div>
         <div className="w-full relative mt-8 rounded border" style={{ background: 'var(--card-bg)', borderColor: 'var(--sidebar-border)' }}>
            <div className="h-16 relative w-full">
                {[0, 1].map(dayOffset => (highlightHours.map(h => {
                    const hourPercent = (h / 24) * 50; const startPercent = (dayOffset * 50) + hourPercent; const widthPercent = (1 / 24) * 50;
                    return (<div key={`hl-${dayOffset}-${h}`} className="absolute top-0 bottom-0 bg-yellow-500/10 border-x border-yellow-500/20 z-0" style={{ left: `${startPercent}%`, width: `${widthPercent}%` }} />);
                })))}
                {[...Array(48)].map((_, i) => {
                    const hour = i % 24; const percent = (i / 48) * 100;
                    return (<div key={i} className="absolute top-0 bottom-0 border-l border-white/10 z-10" style={{ left: `${percent}%` }}>{hour % 3 === 0 && (<span className="absolute -bottom-5 -translate-x-1/2 text-xs font-bold font-mono opacity-60 select-none">{hour}</span>)}</div>);
                })}
                <div className="absolute top-0 bottom-0 border-l-2 border-white/40 z-10" style={{ left: '50%' }}></div>
                <div className="absolute top-[-24px] bottom-0 w-0.5 bg-red-500 z-20 shadow-[0_0_8px_rgba(239,68,68,0.8)] pointer-events-none" style={{ left: `${currentPercent}%` }}>
                    <div className="absolute -top-1 -translate-x-1/2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow-md whitespace-nowrap">NOW</div>
                </div>
                {markers.map((m, idx) => (
                    <div key={idx} className="absolute w-1.5 z-30 hover:z-40 group cursor-pointer transition-all hover:w-3 hover:brightness-125 border-l border-white/20" style={{ left: `${m.percent}%`, backgroundColor: m.color, top: `${m.level * 25}%`, height: `25%` }} onClick={() => { if(window.confirm(`刪除 ${m.name}?`)) handleDeleteTimelineRecord(m.originalRecordId); }}>
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-xs whitespace-nowrap shadow-lg hidden group-hover:block z-50 pointer-events-none bg-gray-900 text-white border border-gray-600">
                            <div className="font-bold flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{background: m.color}}></div>{m.name}</div><div className="font-mono text-center opacity-80">{m.time}</div>
                        </div>
                    </div>
                ))}
            </div>
         </div>
      </div>

      {/* Control Bar */}
      <div className="mt-4 mb-4 p-3 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-4 backdrop-blur-sm border border-white/10" style={{ background: 'var(--card-bg)' }}>
        <div className="flex items-center gap-4">
          <Clock size={32} className="opacity-80"/>
          <div>
            <span className="text-xs opacity-70 font-bold tracking-widest flex items-center gap-1">
                CURRENT TIME {formatDateSimple(now)}
                {isTimeSynced && <Globe size={10} className="text-green-500" title="已與伺服器時間同步"/>}
            </span>
            <span className="text-2xl font-mono font-bold block leading-none">{formatTimeWithSeconds(now)}</span>
          </div>
        </div>
        
        <div className="flex gap-2 ml-auto">
            <button onClick={() => setIsTimelineSettingsOpen(true)} className="flex items-center gap-2 text-white px-3 py-1.5 rounded shadow bg-orange-600 hover:bg-orange-500 text-sm"><Settings size={16}/> 時間線設定</button>
        </div>
      </div>

      {/* Main Content (分兩大區塊) */}
      <div className="flex flex-col lg:flex-row gap-4 h-full overflow-hidden">
        
        {/* 左側：掛賣建議 (保留) */}
        <div className="w-full lg:w-1/4 rounded-xl p-0 flex flex-col border border-white/10 h-full backdrop-blur-sm overflow-hidden" style={{ background: 'var(--card-bg)' }}>
            <SellerSuggestionStrip isDarkMode={isDarkMode} vertical={true} members={filteredMembers} />
        </div>

        {/* 右側：Gemini 圖片分析區塊 (新增) */}
        <div className="w-full lg:w-3/4 rounded-xl flex flex-col border border-white/10 h-full backdrop-blur-sm overflow-hidden relative" style={{ background: 'var(--sidebar-bg)' }}>
            
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/20">
                <h3 className="font-bold text-lg flex items-center gap-2 text-blue-400">
                    <Sparkles size={20}/> Gemini 智慧排序器
                </h3>
                <span className="text-xs opacity-60 bg-black/40 px-2 py-1 rounded border border-white/10">直接在此頁面按下 Ctrl+V 貼上圖片</span>
            </div>

            <div className="flex-1 p-6 flex flex-col md:flex-row gap-6 overflow-y-auto custom-scrollbar">
                
                {/* 預覽圖片區 */}
                <div className="w-full md:w-1/2 flex flex-col gap-2">
                    <p className="text-sm opacity-70 font-bold">1. 貼上的圖片</p>
                    <div className="flex-1 min-h-[300px] border-2 border-dashed border-gray-600 rounded-xl flex items-center justify-center bg-black/20 overflow-hidden relative group">
                        {pastedImage ? (
                            <img src={pastedImage} alt="Pasted" className="max-w-full max-h-full object-contain" />
                        ) : (
                            <div className="flex flex-col items-center opacity-40">
                                <ImageIcon size={48} className="mb-2" />
                                <p>點擊網頁任意處並按下 Ctrl+V</p>
                            </div>
                        )}
                        {/* 懸浮提示 */}
                        {pastedImage && (
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-white font-bold bg-black/50 px-4 py-2 rounded-lg">再次 Ctrl+V 可覆蓋圖片</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* 分析結果區 */}
                <div className="w-full md:w-1/2 flex flex-col gap-2">
                    <p className="text-sm opacity-70 font-bold flex items-center gap-2">
                        2. 分析結果
                        {isAnalyzing && <Loader2 size={14} className="animate-spin text-blue-400" />}
                    </p>
                    <div className="flex-1 min-h-[300px] border border-gray-700 rounded-xl bg-gray-900/50 p-6 flex flex-col justify-start overflow-y-auto">
                        
                        {!pastedImage && !isAnalyzing && (
                            <div className="h-full flex flex-col items-center justify-center opacity-30 text-sm">
                                <Sparkles size={32} className="mb-2" />
                                <p>等待圖片輸入...</p>
                            </div>
                        )}

                        {isAnalyzing && (
                            <div className="h-full flex flex-col items-center justify-center text-blue-400 animate-pulse">
                                <Sparkles size={40} className="mb-4" />
                                <p className="font-bold">Gemini 正在分析並計算時間差...</p>
                            </div>
                        )}

                        {analysisError && !isAnalyzing && (
                            <div className="text-red-400 flex flex-col items-center justify-center h-full text-center">
                                <AlertCircle size={32} className="mb-2" />
                                <p>{analysisError}</p>
                            </div>
                        )}

                        {analysisResult && !isAnalyzing && !analysisError && (
                            <div className="text-xl leading-relaxed whitespace-pre-wrap font-bold text-green-300">
                                {analysisResult}
                            </div>
                        )}

                    </div>
                </div>
            </div>

        </div>
      </div>

      {/* Timeline Settings Modal (給您保留了新增時間線標記的彈出視窗) */}
      {isTimelineSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[999]">
          <div className={`w-full max-w-2xl rounded-xl p-6 shadow-2xl flex flex-col max-h-[85vh]`} style={{ background: 'var(--card-bg)' }}> 
             <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                 <h3 className="font-bold text-xl flex items-center gap-2"><Settings size={20}/> 時間線設定</h3>
                 <button onClick={()=>setIsTimelineSettingsOpen(false)}><X size={24}/></button>
             </div>
             <div className="flex gap-6 h-full overflow-hidden">
                <div className="flex-1 flex flex-col border-r border-white/10 pr-6">
                    <h4 className="font-bold text-sm mb-3 text-orange-400">1. 設定標記類別</h4>
                    <div className="space-y-3 mb-4">
                        <div className="grid grid-cols-2 gap-2">
                            <input type="text" placeholder="名稱" className={`w-full p-2 border rounded text-sm ${theme.input}`} value={timelineTypeForm.name} onChange={e=>setTimelineTypeForm({...timelineTypeForm, name: e.target.value})}/>
                            <input type="number" placeholder="週期(分)" className={`w-full p-2 border rounded text-sm ${theme.input}`} value={timelineTypeForm.interval} onChange={e=>setTimelineTypeForm({...timelineTypeForm, interval: Number(e.target.value)})}/>
                        </div>
                        <div className="flex gap-2">
                            <input type="color" className="h-9 w-full rounded cursor-pointer" value={timelineTypeForm.color} onChange={e=>setTimelineTypeForm({...timelineTypeForm, color: e.target.value})}/>
                            <button onClick={handleAddTimelineType} disabled={isSubmitting} className="whitespace-nowrap px-4 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-500">新增</button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                        {timelineTypes.map(t => (
                            <div key={t.id} className="flex justify-between items-center text-xs p-2 rounded bg-black/20 hover:bg-black/30">
                                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor: t.color}}></div><span>{t.name} ({t.interval}m)</span></div>
                                <button onClick={()=>handleDeleteTimelineType(t.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex-1 flex flex-col">
                    <h4 className="font-bold text-sm mb-3 text-blue-400">2. 放上標記點</h4>
                    <div className="space-y-3">
                        <select className={`w-full p-2 border rounded text-sm ${theme.input}`} value={timelineRecordForm.typeId} onChange={e=>setTimelineRecordForm({...timelineRecordForm, typeId: e.target.value})}>
                            <option value="">選擇類別...</option>
                            {timelineTypes.map(t => <option key={t.id} value={t.id} style={{color: 'black'}}>{t.name}</option>)}
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="date" className={`w-full p-2 border rounded text-sm ${theme.input}`} value={timelineRecordForm.deathDate} onChange={e=>setTimelineRecordForm({...timelineRecordForm, deathDate: e.target.value})}/>
                            <input type="time" className={`w-full p-2 border rounded text-sm ${theme.input}`} value={timelineRecordForm.deathTime} onChange={e=>setTimelineRecordForm({...timelineRecordForm, deathTime: e.target.value})}/>
                        </div>
                        <button onClick={handleAddTimelineRecord} disabled={isSubmitting} className="w-full py-2 bg-orange-600 text-white rounded font-bold hover:bg-orange-500 flex justify-center gap-2">
                            {isSubmitting ? <Loader2 className="animate-spin" size={16}/> : '建立標記'}
                        </button>
                    </div>
                    <div className="mt-auto pt-4 text-xs opacity-50">* 此時間線與下方列表獨立運作，用於特定週期監控。</div>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BossTimerView;