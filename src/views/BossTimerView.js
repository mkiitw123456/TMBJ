// src/views/BossTimerView.js
import React, { useState, useEffect } from 'react';
import { 
  Clock, Plus, Tag, RefreshCw, Star, X, Trash2, Edit3, List, Settings, Calendar, Loader2, Globe
} from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from '../config/firebase';
// 🟢 修正：移除了 getRelativeDay, getCurrentDateStr, getCurrentTimeStr
import { 
  formatTimeWithSeconds, formatTimeOnly, getRandomBrightColor, sendLog 
} from '../utils/helpers';
import ToastNotification from '../components/ToastNotification';
import EventItem from '../components/EventItem';
import SellerSuggestionStrip from '../components/SellerSuggestionStrip';

const BossTimerView = ({ isDarkMode, currentUser }) => {
  // === Data States ===
  const [bossTemplates, setBossTemplates] = useState([]);
  const [bossEvents, setBossEvents] = useState([]);
  const [timelineTypes, setTimelineTypes] = useState([]);
  const [timelineRecords, setTimelineRecords] = useState([]);
  
  const [now, setNow] = useState(new Date()); 
  
  // 時間校正狀態
  const [timeOffset, setTimeOffset] = useState(0); 
  const [isTimeSynced, setIsTimeSynced] = useState(false);

  const [toastMsg, setToastMsg] = useState(null); 
  const [undoHistory, setUndoHistory] = useState({});

  // === Modal States ===
  const [isCreateBossModalOpen, setIsCreateBossModalOpen] = useState(false);
  const [isAddRecordModalOpen, setIsAddRecordModalOpen] = useState(false);
  const [isTimelineSettingsOpen, setIsTimelineSettingsOpen] = useState(false);
  
  const [editingBossId, setEditingBossId] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);

  const [newBossForm, setNewBossForm] = useState({ name: '', respawnMinutes: 60, color: '#FF5733', stars: 0 });
  const [recordForm, setRecordForm] = useState({ templateId: '', timeMode: 'current', specificDate: '', specificTime: '' });
  
  const [timelineTypeForm, setTimelineTypeForm] = useState({ name: '', interval: 60, color: '#FF5733' });
  const [timelineRecordForm, setTimelineRecordForm] = useState({ typeId: '', deathDate: '', deathTime: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // === Data Fetching ===
  useEffect(() => {
    if (!db) return;
    const unsub1 = onSnapshot(collection(db, "boss_templates"), snap => setBossTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    // 查詢所有 Boss 事件
    const q2 = query(collection(db, "boss_events"), orderBy("respawnTime", "asc"));
    const unsub2 = onSnapshot(q2, snap => setBossEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    const q3 = query(collection(db, "timeline_types"), orderBy("interval"));
    const unsub3 = onSnapshot(q3, snap => setTimelineTypes(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const q4 = query(collection(db, "timeline_records"), orderBy("deathTimestamp", "desc"));
    const unsub4 = onSnapshot(q4, snap => setTimelineRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, []);

  // 網路時間校正
  useEffect(() => {
    const syncTime = async () => {
        try {
            const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
            const serverDateStr = response.headers.get('Date');
            if (serverDateStr) {
                const serverTime = new Date(serverDateStr).getTime();
                const clientTime = Date.now();
                const offset = serverTime - clientTime;
                setTimeOffset(offset);
                setIsTimeSynced(true);
            }
        } catch (e) {
            console.warn("Time sync failed", e);
        }
    };
    syncTime();
  }, []);

  // 計時器
  useEffect(() => {
    const timer = setInterval(() => {
        setNow(new Date(Date.now() + timeOffset));
    }, 1000); 
    return () => clearInterval(timer);
  }, [timeOffset]);

  const showToast = (message) => { setToastMsg(message); setTimeout(() => setToastMsg(null), 2000); };

  // ... (操作邏輯保持不變) ...
  const handleQuickRefresh = async (event) => {
    if (!db) return;
    let intervalMinutes = 0;
    const template = bossTemplates.find(t => t.id === event.templateId);
    if (template) intervalMinutes = template.respawnMinutes;
    else if (event.respawnTime && event.deathTime) intervalMinutes = Math.round((new Date(event.respawnTime) - new Date(event.deathTime)) / 60000);
    else return alert("無法計算週期");
    const currentState = { deathTime: event.deathTime, respawnTime: event.respawnTime };
    setUndoHistory(prev => ({ ...prev, [event.id]: [currentState, ...(prev[event.id] || [])].slice(0, 3) }));
    
    const baseTime = new Date(Date.now() + timeOffset);
    const newRespawnTime = new Date(baseTime.getTime() + intervalMinutes * 60000);
    
    try { await updateDoc(doc(db, "boss_events", event.id), { deathTime: baseTime.toISOString(), respawnTime: newRespawnTime.toISOString() }); sendLog(currentUser, "快速刷新", `${event.name}`); showToast(`🔄 已刷新：${event.name}`); } catch(e) { alert("刷新失敗"); }
  };

  const handleUndo = async (event) => {
    if (!db) return;
    const history = undoHistory[event.id];
    if (!history || history.length === 0) return alert("沒有可回復的紀錄");
    const previousState = history[0]; 
    try { await updateDoc(doc(db, "boss_events", event.id), { deathTime: previousState.deathTime, respawnTime: previousState.respawnTime }); setUndoHistory(prev => ({ ...prev, [event.id]: prev[event.id].slice(1) })); sendLog(currentUser, "回復時間", `${event.name}`); showToast(`zk 已回復：${event.name}`); } catch(e) { alert("回復失敗"); }
  };

  const handleCreateOrUpdateBoss = async () => { if (currentUser === '訪客') return alert("訪客權限僅供瀏覽"); if (!newBossForm.name) return alert("請輸入 Boss 名稱"); try { if (editingBossId) await updateDoc(doc(db, "boss_templates", editingBossId), newBossForm); else await addDoc(collection(db, "boss_templates"), newBossForm); setIsCreateBossModalOpen(false); sendLog(currentUser, editingBossId ? "修改Boss" : "新增Boss", newBossForm.name); } catch(e) { alert("儲存失敗"); } };
  
  const handleSaveRecord = async () => { 
      if (currentUser === '訪客') return alert("訪客權限僅供瀏覽"); 
      if (!recordForm.templateId) return alert("請選擇 Boss"); 
      
      let baseTime = new Date(Date.now() + timeOffset); 
      
      if (recordForm.timeMode === 'specific') { 
          if (!recordForm.specificDate || !recordForm.specificTime) return alert("請輸入日期與時間"); 
          baseTime = new Date(`${recordForm.specificDate}T${recordForm.specificTime}`); 
      } 
      
      const template = bossTemplates.find(b => b.id === recordForm.templateId); 
      let respawnTime, name, color, stars; 
      
      if (template) { 
          respawnTime = new Date(baseTime.getTime() + template.respawnMinutes * 60000); 
          name = template.name; 
          color = template.color; 
          stars = template.stars || 0; 
      } else if (editingEventId) { 
          const originalEvent = bossEvents.find(e => e.id === editingEventId); 
          if(!originalEvent) return alert("找不到原始資料"); 
          const duration = new Date(originalEvent.respawnTime) - new Date(originalEvent.deathTime); 
          respawnTime = new Date(baseTime.getTime() + duration); 
          name = originalEvent.name; 
          color = originalEvent.color; 
          stars = originalEvent.stars || 0; 
      } else return alert("資料錯誤"); 
      
      const eventData = { templateId: recordForm.templateId, name, color, stars, deathTime: baseTime.toISOString(), respawnTime: respawnTime.toISOString() }; 
      try { 
          if (editingEventId) await updateDoc(doc(db, "boss_events", editingEventId), eventData); 
          else { 
              eventData.createdAt = new Date().toISOString(); 
              await addDoc(collection(db, "boss_events"), eventData); 
          } 
          setIsAddRecordModalOpen(false); 
          sendLog(currentUser, editingEventId ? "修改紀錄" : "新增紀錄", name); 
      } catch(e) { alert("儲存失敗"); } 
  };

  const handleDeleteEvent = async (id) => { if (currentUser === '訪客') return alert("訪客權限僅供瀏覽"); if(!window.confirm("確定刪除此紀錄？")) return; await deleteDoc(doc(db, "boss_events", id)); };
  const handleDeleteTemplate = async (id, name) => { if (currentUser === '訪客') return alert("訪客權限僅供瀏覽"); if(!window.confirm(`確定刪除 ${name} 的設定嗎？`)) return; await deleteDoc(doc(db, "boss_templates", id)); };
  
  const openEditEvent = (event) => { 
      setEditingEventId(event.id); 
      const d = new Date(event.deathTime); 
      setRecordForm({ 
          templateId: event.templateId, 
          timeMode: 'specific', 
          specificDate: d.toISOString().split('T')[0], 
          specificTime: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}` 
      }); 
      setIsAddRecordModalOpen(true); 
  };
  
  const openEditTemplate = (t) => { setEditingBossId(t.id); setNewBossForm({ name: t.name, respawnMinutes: t.respawnMinutes, color: t.color, stars: t.stars || 0 }); setIsCreateBossModalOpen(true); };
  const handleAddTimelineType = async () => { if (currentUser === '訪客') return alert("訪客權限僅供瀏覽"); if (!timelineTypeForm.name || timelineTypeForm.interval <= 0) return alert("資料不完整"); setIsSubmitting(true); try { await addDoc(collection(db, "timeline_types"), timelineTypeForm); setTimelineTypeForm({ name: '', interval: 60, color: '#FF5733' }); } catch(e) { alert(e.message); } finally { setIsSubmitting(false); } };
  const handleDeleteTimelineType = async (id) => { if (currentUser === '訪客') return; if(window.confirm("確定刪除此設定？")) await deleteDoc(doc(db, "timeline_types", id)); };
  const handleAddTimelineRecord = async () => { if (currentUser === '訪客') return alert("訪客權限僅供瀏覽"); if (!timelineRecordForm.typeId || !timelineRecordForm.deathDate || !timelineRecordForm.deathTime) return alert("資料不完整"); setIsSubmitting(true); try { const ts = new Date(`${timelineRecordForm.deathDate}T${timelineRecordForm.deathTime}`).getTime(); await addDoc(collection(db, "timeline_records"), { typeId: timelineRecordForm.typeId, deathTimestamp: ts, creator: currentUser, createdAt: Date.now() }); setIsTimelineSettingsOpen(false); } catch(e) { alert(e.message); } finally { setIsSubmitting(false); } };
  const handleDeleteTimelineRecord = async (id) => { if (currentUser === '訪客') return; if(window.confirm("刪除此紀錄？")) await deleteDoc(doc(db, "timeline_records", id)); };

  // Markers Logic
  const calculate2DayMarkers = () => { const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0); const totalDuration = 48 * 60 * 60 * 1000; const endOfTomorrow = new Date(startOfToday.getTime() + totalDuration); let rawMarkers = []; timelineRecords.forEach(record => { const type = timelineTypes.find(t => t.id === record.typeId); if (!type) return; const intervalMs = type.interval * 60 * 1000; let checkTime = record.deathTimestamp; if (checkTime < startOfToday.getTime()) { const diff = startOfToday.getTime() - checkTime; const jumps = Math.floor(diff / intervalMs); checkTime += jumps * intervalMs; } while (checkTime <= endOfTomorrow.getTime() + intervalMs) { if (checkTime >= startOfToday.getTime() && checkTime <= endOfTomorrow.getTime()) { const current = new Date(checkTime); const offsetMs = checkTime - startOfToday.getTime(); const percent = (offsetMs / totalDuration) * 100; rawMarkers.push({ id: record.id + '_' + checkTime, percent, time: formatTimeOnly(current), color: type.color, name: type.name, originalRecordId: record.id, interval: type.interval }); } checkTime += intervalMs; } }); rawMarkers.sort((a, b) => a.percent - b.percent); const levels = [ -10, -10, -10, -10 ]; return rawMarkers.map(marker => { let assignedLevel = 0; for (let i = 0; i < levels.length; i++) { if (marker.percent > levels[i] + 1.5) { assignedLevel = i; levels[i] = marker.percent; break; } if (i === levels.length - 1) { assignedLevel = 0; levels[0] = marker.percent; } } return { ...marker, level: assignedLevel }; }); };
  const markers = calculate2DayMarkers();
  
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const totalDuration = 48 * 60 * 60 * 1000;
  const currentOffset = now.getTime() - startOfToday.getTime();
  const currentPercent = Math.max(0, Math.min(100, (currentOffset / totalDuration) * 100));
  const highlightHours = [2, 5, 8, 11, 14, 17, 20, 23];
  const theme = { text: 'text-[var(--app-text)]', subText: 'opacity-60', input: isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800' };

  // 排序與分組邏輯
  const sortedEvents = [...bossEvents].sort((a, b) => new Date(a.respawnTime) - new Date(b.respawnTime));
  const nextBoss = sortedEvents.find(e => new Date(e.respawnTime) > now);

  const formatDateSimple = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

  return (
    <div className="p-4 h-[calc(100vh-80px)] flex flex-col" style={{ color: 'var(--app-text)' }}>
      <ToastNotification message={toastMsg} isVisible={!!toastMsg} />

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
        {nextBoss ? (
            <div className="flex items-center gap-3 bg-black/10 px-4 py-2 rounded-lg border border-white/10">
                <span className="text-xs opacity-70 font-bold">NEXT BOSS</span>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full shadow-[0_0_8px_currentColor]" style={{backgroundColor: nextBoss.color, color: nextBoss.color}}></div><span className="font-bold text-lg">{nextBoss.name}</span><span className="font-mono text-xl">{formatTimeOnly(nextBoss.respawnTime)}</span></div>
            </div>
        ) : <div className="opacity-50 text-sm">暫無待重生 Boss</div>}

        <div className="flex gap-2">
            <button onClick={() => setIsTimelineSettingsOpen(true)} className="flex items-center gap-2 text-white px-3 py-1.5 rounded shadow bg-orange-600 hover:bg-orange-500 text-sm"><Settings size={16}/> 時間線設定</button>
            <button onClick={() => { setEditingBossId(null); setNewBossForm({ name: '', respawnMinutes: 60, color: getRandomBrightColor(), stars: 0 }); setIsCreateBossModalOpen(true); }} className="flex items-center gap-2 text-white px-3 py-1.5 rounded shadow bg-blue-600 hover:bg-blue-500 text-sm"><Plus size={16}/> 建立 Boss</button>
            <button onClick={() => { 
                setEditingEventId(null); 
                const nowSynced = new Date(Date.now() + timeOffset);
                const dStr = nowSynced.toISOString().split('T')[0];
                const tStr = `${String(nowSynced.getHours()).padStart(2,'0')}:${String(nowSynced.getMinutes()).padStart(2,'0')}`;
                setRecordForm({ templateId: bossTemplates[0]?.id || '', timeMode: 'specific', specificDate: dStr, specificTime: tStr }); 
                setIsAddRecordModalOpen(true); 
            }} className="flex items-center gap-2 text-white px-3 py-1.5 rounded shadow bg-blue-600 hover:bg-blue-500 text-sm"><Tag size={16}/> 新增紀錄</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-4 h-full overflow-hidden">
        
        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 h-full overflow-y-auto pb-4 custom-scrollbar">
            
            {/* 1. 掛賣建議 (垂直版) */}
            <div className="col-span-1 rounded-xl p-0 flex flex-col border border-white/10 h-full backdrop-blur-sm transition-colors duration-300 overflow-hidden" style={{ background: 'var(--card-bg)' }}>
                <SellerSuggestionStrip isDarkMode={isDarkMode} vertical={true} />
            </div>

            {/* 2. 統一 Boss 列表 (不分天) */}
            <div className="col-span-1 md:col-span-3 rounded-xl p-3 flex flex-col border border-white/10 h-full backdrop-blur-sm transition-colors duration-300" style={{ background: 'var(--card-bg)' }}>
                <h3 className="font-bold mb-2 text-center py-2 border-b border-white/10 flex items-center justify-center gap-2">
                    <List size={18}/> 重生監控清單 ({sortedEvents.length})
                </h3>
                <div className="flex-1 overflow-y-auto space-y-2 p-3 custom-scrollbar">
                    {sortedEvents.map(event => (
                        <EventItem 
                            key={event.id} 
                            event={event} 
                            theme={theme} 
                            now={now} 
                            handleDeleteEvent={handleDeleteEvent} 
                            handleOpenEditEvent={openEditEvent} 
                            handleQuickRefresh={handleQuickRefresh} 
                            handleUndo={handleUndo} 
                            hasUndo={undoHistory[event.id]?.length > 0} 
                            currentUser={currentUser}
                        />
                    ))}
                    {sortedEvents.length === 0 && <div className="text-center opacity-30 py-10 text-sm">無紀錄</div>}
                </div>
            </div>
        </div>
        
        {/* 右側邊欄 */}
        <div className="w-full lg:w-80 flex flex-col gap-4 h-full overflow-hidden">
            <div className="flex-1 rounded-xl border flex flex-col overflow-hidden backdrop-blur-sm transition-colors duration-300" style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}>
                <div className="p-3 border-b border-white/10 font-bold flex items-center gap-2"><List size={16}/> 快速操作列表</div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {sortedEvents.map(event => (
                        <div key={event.id} className="flex items-center justify-between p-2 rounded text-sm bg-black/10 hover:bg-black/20 transition-colors group"><div className="flex items-center gap-2 min-w-0"><div className="w-2 h-2 rounded-full flex-shrink-0" style={{backgroundColor: event.color}}></div><span className="truncate font-bold">{event.name}</span></div><div className="flex items-center gap-2"><span className={`font-mono ${new Date(event.respawnTime) < now ? 'text-red-500 animate-pulse' : 'text-blue-500'}`}>{formatTimeOnly(event.respawnTime)}</span><div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity"><button onClick={()=>openEditEvent(event)} className="text-gray-400 hover:text-white"><Edit3 size={12}/></button><button onClick={()=>handleDeleteEvent(event.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={12}/></button></div></div></div>
                    ))}
                </div>
            </div>
            <div className="flex-1 rounded-xl border flex flex-col overflow-hidden backdrop-blur-sm transition-colors duration-300" style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--sidebar-border)' }}>
                <div className="p-3 border-b border-white/10 font-bold flex items-center gap-2"><Tag size={16}/> Boss 設定列表</div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {bossTemplates.map(t => (
                        <div key={t.id} className="flex items-center justify-between p-2 rounded text-sm bg-black/10 hover:bg-black/20 transition-colors group"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full" style={{backgroundColor: t.color}}></div><span>{t.name}</span><span className="text-xs px-1.5 rounded bg-gray-500/20 opacity-60">{t.respawnMinutes}m</span></div><div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity"><button onClick={()=>openEditTemplate(t)} className="text-gray-400 hover:text-white"><Edit3 size={12}/></button><button onClick={()=>handleDeleteTemplate(t.id, t.name)} className="text-gray-400 hover:text-red-500"><Trash2 size={12}/></button></div></div>
                    ))}
                </div>
            </div>
        </div>
      </div>

      {/* Modals */}
      {isCreateBossModalOpen && ( <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm"> <div className="w-full max-w-lg rounded-xl p-6 shadow-2xl flex flex-col max-h-[90vh]" style={{ background: 'var(--card-bg)' }}> <h3 className="text-lg font-bold mb-4">{editingBossId ? '編輯 Boss 設定' : '建立 Boss 設定'}</h3> <div className="space-y-4"> <div className="grid grid-cols-2 gap-2"><input type="text" placeholder="名稱" className={`p-2 rounded border ${theme.input}`} value={newBossForm.name} onChange={e=>setNewBossForm({...newBossForm, name: e.target.value})}/><input type="number" placeholder="週期(分)" className={`p-2 rounded border ${theme.input}`} value={newBossForm.respawnMinutes} onChange={e=>setNewBossForm({...newBossForm, respawnMinutes: parseInt(e.target.value)||0})}/></div> <div className="flex gap-2 items-center"><input type="color" className="h-10 w-20 rounded cursor-pointer" value={newBossForm.color} onChange={e=>setNewBossForm({...newBossForm, color: e.target.value})}/><button onClick={()=>setNewBossForm({...newBossForm, color: getRandomBrightColor()})} className="p-2 bg-gray-500 text-white rounded"><RefreshCw size={16}/></button><div className="flex items-center gap-1 ml-auto"><span className="text-xs">星級</span><input type="number" max="5" min="0" className={`w-16 p-2 rounded border ${theme.input}`} value={newBossForm.stars} onChange={e=>setNewBossForm({...newBossForm, stars: parseInt(e.target.value)})}/></div></div> <div className="flex justify-end gap-2 mt-4"><button onClick={() => {setIsCreateBossModalOpen(false); setEditingBossId(null);}} className="px-4 py-2 bg-gray-500 text-white rounded">取消</button><button onClick={handleCreateOrUpdateBoss} className="px-4 py-2 bg-blue-600 text-white rounded">儲存</button></div> </div> </div> </div> )}
      {isAddRecordModalOpen && ( <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm"> <div className="w-full max-w-sm rounded-xl p-6 shadow-2xl" style={{ background: 'var(--card-bg)' }}> <h3 className="text-lg font-bold mb-4">{editingEventId ? '修改計時時間' : '新增計時'}</h3> <div className="space-y-4"> <div><label className="text-xs opacity-70">選擇 Boss</label><select className={`w-full p-2 rounded border ${theme.input}`} value={recordForm.templateId} onChange={e=>setRecordForm({...recordForm, templateId: e.target.value})} disabled={!!editingEventId}><option value="" disabled>請選擇...</option>{bossTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div> <div className="flex gap-2 text-xs"> <button onClick={()=>setRecordForm({...recordForm, timeMode: 'current'})} className={`flex-1 py-2 rounded border ${recordForm.timeMode==='current' ? 'bg-blue-600 text-white' : 'opacity-50'}`}>當前時間</button> <button onClick={()=>{ const nowSynced = new Date(Date.now() + timeOffset); setRecordForm({ ...recordForm, timeMode: 'specific', specificDate: nowSynced.toISOString().split('T')[0], specificTime: `${String(nowSynced.getHours()).padStart(2,'0')}:${String(nowSynced.getMinutes()).padStart(2,'0')}` }); }} className={`flex-1 py-2 rounded border ${recordForm.timeMode==='specific' ? 'bg-blue-600 text-white' : 'opacity-50'}`}>指定時間</button> </div> {recordForm.timeMode === 'specific' && (<div className="grid grid-cols-2 gap-2"><input type="date" className={`p-2 rounded border ${theme.input}`} value={recordForm.specificDate} onChange={e=>setRecordForm({...recordForm, specificDate: e.target.value})}/><input type="time" step="1" className={`p-2 rounded border ${theme.input}`} value={recordForm.specificTime} onChange={e=>setRecordForm({...recordForm, specificTime: e.target.value})}/></div>)} <div className="flex justify-end gap-2 mt-4"><button onClick={() => setIsAddRecordModalOpen(false)} className="px-4 py-2 bg-gray-500 text-white rounded">取消</button><button onClick={handleSaveRecord} className="px-4 py-2 bg-blue-600 text-white rounded">儲存</button></div> </div> </div> </div> )}
      {isTimelineSettingsOpen && ( <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[999]"> <div className={`w-full max-w-2xl rounded-xl p-6 shadow-2xl flex flex-col max-h-[85vh]`} style={{ background: 'var(--card-bg)' }}> <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4"> <h3 className="font-bold text-xl flex items-center gap-2"><Settings size={20}/> 時間線設定</h3> <button onClick={()=>setIsTimelineSettingsOpen(false)}><X size={24}/></button> </div> <div className="flex gap-6 h-full overflow-hidden"> <div className="flex-1 flex flex-col border-r border-white/10 pr-6"> <h4 className="font-bold text-sm mb-3 text-orange-400">1. 設定 Boss (Timeline Types)</h4> <div className="space-y-3 mb-4"> <div className="grid grid-cols-2 gap-2"> <input type="text" placeholder="名稱" className={`w-full p-2 border rounded text-sm ${theme.input}`} value={timelineTypeForm.name} onChange={e=>setTimelineTypeForm({...timelineTypeForm, name: e.target.value})}/> <input type="number" placeholder="CD(分)" className={`w-full p-2 border rounded text-sm ${theme.input}`} value={timelineTypeForm.interval} onChange={e=>setTimelineTypeForm({...timelineTypeForm, interval: Number(e.target.value)})}/> </div> <div className="flex gap-2"> <input type="color" className="h-9 w-full rounded cursor-pointer" value={timelineTypeForm.color} onChange={e=>setTimelineTypeForm({...timelineTypeForm, color: e.target.value})}/> <button onClick={handleAddTimelineType} disabled={isSubmitting} className="whitespace-nowrap px-4 bg-blue-600 text-white rounded text-sm font-bold hover:bg-blue-500">新增</button> </div> </div> <div className="flex-1 overflow-y-auto space-y-1"> {timelineTypes.map(t => ( <div key={t.id} className="flex justify-between items-center text-xs p-2 rounded bg-black/20 hover:bg-black/30"> <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor: t.color}}></div><span>{t.name} ({t.interval}m)</span></div> <button onClick={()=>handleDeleteTimelineType(t.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14}/></button> </div> ))} </div> </div> <div className="flex-1 flex flex-col"> <h4 className="font-bold text-sm mb-3 text-blue-400">2. 設定重生時間</h4> <div className="space-y-3"> <select className={`w-full p-2 border rounded text-sm ${theme.input}`} value={timelineRecordForm.typeId} onChange={e=>setTimelineRecordForm({...timelineRecordForm, typeId: e.target.value})}> <option value="">選擇 Boss...</option> {timelineTypes.map(t => <option key={t.id} value={t.id} style={{color: 'black'}}>{t.name}</option>)} </select> <div className="grid grid-cols-2 gap-2"> <input type="date" className={`w-full p-2 border rounded text-sm ${theme.input}`} value={timelineRecordForm.deathDate} onChange={e=>setTimelineRecordForm({...timelineRecordForm, deathDate: e.target.value})}/> <input type="time" className={`w-full p-2 border rounded text-sm ${theme.input}`} value={timelineRecordForm.deathTime} onChange={e=>setTimelineRecordForm({...timelineRecordForm, deathTime: e.target.value})}/> </div> <button onClick={handleAddTimelineRecord} disabled={isSubmitting} className="w-full py-2 bg-orange-600 text-white rounded font-bold hover:bg-orange-500 flex justify-center gap-2"> {isSubmitting ? <Loader2 className="animate-spin" size={16}/> : '開始追蹤'} </button> </div> <div className="mt-auto pt-4 text-xs opacity-50">* 此時間線與下方列表獨立運作，用於特定週期監控。</div> </div> </div> </div> </div> )}
    </div>
  );
};

export default BossTimerView;