// src/views/CharacterListView.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Copy, Check, User, Plus, Trash2, Edit3, Save, PlayCircle, Zap, GripVertical, X, BatteryCharging, Hammer, Package
} from 'lucide-react';
import { 
  doc, onSnapshot, setDoc, runTransaction 
} from "firebase/firestore";
import { db } from '../config/firebase';
// 移除原本的 MEMBERS import
import { sendLog } from '../utils/helpers';

const CLASS_ICON_BASE_PATH = process.env.PUBLIC_URL + '/class_icons/';

const CLASS_OPTIONS = [
  { id: 'gladiator', label: '劍星', img: 'gladiator.webp' },
  { id: 'templar', label: '守護星', img: 'templar.webp' },
  { id: 'ranger', label: '弓星', img: 'ranger.webp' },
  { id: 'assassin', label: '殺星', img: 'assassin.webp' },
  { id: 'sorcerer', label: '魔導星', img: 'sorcerer.webp' },
  { id: 'spiritmaster', label: '精靈星', img: 'spiritmaster.webp' },
  { id: 'cleric', label: '治癒星', img: 'cleric.webp' },
  { id: 'chanter', label: '護法星', img: 'chanter.webp' },
];

// 體力設定常數
const BASE_STAMINA_CAP = 840;
const EXTRA_STAMINA_CAP = 2000;
const STAMINA_PER_RUN = 80;

// === 防抖動輸入框元件 ===
const EditableField = ({ value, onSave, type = "text", className, placeholder, ...props }) => {
  const [localValue, setLocalValue] = useState(value || '');
  const isComposing = useRef(false);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleBlur = () => {
    if (localValue != value) {
      onSave(localValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !isComposing.current) {
      e.target.blur();
    }
  };

  return (
    <input
      type={type}
      className={className}
      placeholder={placeholder}
      value={localValue}
      onCompositionStart={() => { isComposing.current = true; }}
      onCompositionEnd={() => { isComposing.current = false; }}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      {...props}
    />
  );
};

// 接收 members 參數
const CharacterListView = ({ isDarkMode, currentUser, members = [] }) => {
  const [characterData, setCharacterData] = useState({});
  
  // 1. 將傳入的 members 物件陣列轉換為純名字陣列
  const memberNames = useMemo(() => members.map(m => m.name || m), [members]);

  // 初始化篩選名單 (改為預設空陣列，透過 useEffect 補全)
  const [selectedMembers, setSelectedMembers] = useState(() => {
    try {
      const saved = localStorage.getItem('selected_members_filter');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // 當 memberNames 載入且本地無紀錄時，預設全選
  useEffect(() => {
    if (memberNames.length > 0) {
        const saved = localStorage.getItem('selected_members_filter');
        if (!saved || JSON.parse(saved).length === 0) {
            setSelectedMembers(memberNames);
        }
    }
  }, [memberNames]);

  const [allowDrag, setAllowDrag] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [newCharInputs, setNewCharInputs] = useState({});

  // 拖曳狀態
  const [dragItem, setDragItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);
  const [classSelector, setClassSelector] = useState({ isOpen: false, member: null, index: null });

  useEffect(() => {
    localStorage.setItem('selected_members_filter', JSON.stringify(selectedMembers));
  }, [selectedMembers]);

  // 讀取資料
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, "member_characters", "data"), (docSnap) => {
      if (docSnap.exists()) {
        setCharacterData(docSnap.data());
      } else {
        setCharacterData({});
      }
    });
    return () => unsub();
  }, []);

  // === 自動回復與重置機制 (Auto Regen & Reset) ===
  useEffect(() => {
    if (!db) return;
    const checkAndApplyRegen = async () => {
      try {
        await runTransaction(db, async (transaction) => {
          const statusRef = doc(db, "system_data", "regen_status");
          const dataRef = doc(db, "member_characters", "data");
          const statusSnap = await transaction.get(statusRef);
          const dataSnap = await transaction.get(dataRef);

          if (!dataSnap.exists()) return;

          let lastTime = 0;
          if (statusSnap.exists()) lastTime = statusSnap.data().lastCheckTime || 0;

          const now = new Date().getTime();
          // 至少間隔 1 分鐘才檢查，避免頻繁寫入
          if (now - lastTime < 60000) return;

          // 體力回復時間點
          const STAMINA_HOURS = [2, 5, 8, 11, 14, 17, 20, 23]; 
          
          let currentData = dataSnap.data();
          let hasChange = false;
          let checkPointer = lastTime > 0 ? lastTime : now - 1;

          // 防止過久未執行導致迴圈過大 (限制最多補算 24 小時)
          const ONE_DAY = 24 * 60 * 60 * 1000;
          if (now - checkPointer > ONE_DAY) checkPointer = now - ONE_DAY;

          let staminaGainMultiplier = 0; 
          let shouldReset100k = false;  // 10萬體 (週一 00:00)
          let shouldResetCraft = false; // 製作體 (週三 05:00)

          let pointerDate = new Date(checkPointer);
          pointerDate.setMinutes(0, 0, 0); 
          
          while (pointerDate.getTime() < now) {
             pointerDate.setTime(pointerDate.getTime() + 3600000); // +1 Hour
             const h = pointerDate.getHours();
             const day = pointerDate.getDay(); // 0=Sun, 1=Mon, ..., 3=Wed

             if (pointerDate.getTime() > lastTime && pointerDate.getTime() <= now) {
                if (STAMINA_HOURS.includes(h)) staminaGainMultiplier += 1;
                if (day === 1 && h === 0) shouldReset100k = true;
                if (day === 3 && h === 5) shouldResetCraft = true;
             }
          }

          if (staminaGainMultiplier === 0 && !shouldResetCraft && !shouldReset100k) {
             transaction.set(statusRef, { lastCheckTime: now }, { merge: true });
             return;
          }

          Object.keys(currentData).forEach(member => {
             const chars = currentData[member];
             if (Array.isArray(chars)) {
               const newChars = chars.map(c => {
                 if (typeof c === 'string') return c; 
                 
                 let newStamina = parseInt(c.stamina) || 0;
                 if (staminaGainMultiplier > 0) {
                     newStamina = Math.min(BASE_STAMINA_CAP, newStamina + (staminaGainMultiplier * 15));
                 }

                 let newStamina100k = parseInt(c.stamina100k) || 0;
                 if (shouldReset100k) newStamina100k = 0; 

                 let newCraftStamina = parseInt(c.craftStamina) || 0;
                 if (shouldResetCraft) newCraftStamina = 0; 

                 return {
                   ...c,
                   stamina: newStamina,
                   craftStamina: newCraftStamina,
                   stamina100k: newStamina100k
                 };
               });
               currentData[member] = newChars;
               hasChange = true;
             }
          });

          if (hasChange) {
             transaction.set(dataRef, currentData);
             transaction.set(statusRef, { lastCheckTime: now }, { merge: true });
             console.log(`[System] 全體更新完成`);
          }
        });
      } catch (e) { console.error("Auto Regen/Reset Failed", e); }
    };

    checkAndApplyRegen();
    const interval = setInterval(checkAndApplyRegen, 60000); 
    return () => clearInterval(interval);
  }, []); 

  const handleToggleMember = (member) => {
    if (selectedMembers.includes(member)) {
      setSelectedMembers(selectedMembers.filter(m => m !== member));
    } else {
      setSelectedMembers([...selectedMembers, member]);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const updateCharacterField = async (member, index, field, value) => {
    if (currentUser === '訪客') return;
    const currentList = [...(characterData[member] || [])];
    const targetChar = currentList[index];
    
    let newCharObj = typeof targetChar === 'string' 
      ? { name: targetChar, gear: '', stamina: 0, extraStamina: 0, stamina100k: 0, craftStamina: 0, custom: 0, note: '', class: null } 
      : { ...targetChar };
    
    newCharObj[field] = value;
    currentList[index] = newCharObj;
    try {
      await setDoc(doc(db, "member_characters", "data"), { [member]: currentList }, { merge: true });
    } catch (e) { console.error("Update failed", e); }
  };

  const handleResourceUpdate = async (member, index, field, newValue) => {
    if (currentUser === '訪客') return;
    
    const val = parseInt(newValue) || 0;
    if (val > 7) { alert("上限為 7 個"); return; }
    if (val < 0) return;

    const currentList = [...(characterData[member] || [])];
    const targetChar = currentList[index];
    
    let newCharObj = typeof targetChar === 'string' 
      ? { name: targetChar, gear: '', stamina: 0, extraStamina: 0, stamina100k: 0, craftStamina: 0, custom: 0, note: '', class: null } 
      : { ...targetChar };

    const oldValue = parseInt(newCharObj[field]) || 0;
    const delta = val - oldValue;

    newCharObj[field] = val;

    if (delta !== 0) {
        const currentExtra = parseInt(newCharObj.extraStamina) || 0;
        const staminaToAdd = delta * 40;
        let finalExtra = currentExtra + staminaToAdd;
        newCharObj.extraStamina = Math.min(EXTRA_STAMINA_CAP, finalExtra);
    }

    currentList[index] = newCharObj;

    try {
      await setDoc(doc(db, "member_characters", "data"), { [member]: currentList }, { merge: true });
    } catch (e) { console.error("Resource Update failed", e); }
  };

  const handleSelectClass = (classId) => {
    if (classSelector.member && classSelector.index !== null) {
      updateCharacterField(classSelector.member, classSelector.index, 'class', classId);
    }
    setClassSelector({ isOpen: false, member: null, index: null });
  };

  const handleCompleteRun = async (member, index) => {
    if (currentUser === '訪客') return alert("訪客權限僅供瀏覽");
    
    const currentList = [...(characterData[member] || [])];
    const targetChar = currentList[index];
    if (typeof targetChar === 'string') return;

    const runs = parseInt(targetChar.custom) || 0;
    if (runs <= 0) return alert("請輸入大於 0 的場次");

    const totalCost = runs * STAMINA_PER_RUN;
    let currentBase = parseInt(targetChar.stamina) || 0;
    let currentExtra = parseInt(targetChar.extraStamina) || 0;

    let remainingCost = totalCost;
    
    if (currentBase >= remainingCost) {
        currentBase -= remainingCost;
        remainingCost = 0;
    } else {
        remainingCost -= currentBase;
        currentBase = 0;
    }

    if (remainingCost > 0) {
        if (currentExtra >= remainingCost) {
            currentExtra -= remainingCost;
            remainingCost = 0;
        } else {
            currentExtra = 0;
        }
    }

    const newCharObj = { 
        ...targetChar, 
        stamina: currentBase, 
        extraStamina: currentExtra, 
        custom: '' 
    };
    
    currentList[index] = newCharObj;

    try {
      await setDoc(doc(db, "member_characters", "data"), { [member]: currentList }, { merge: true });
      sendLog(currentUser, "完成場次", `${targetChar.name} 完成 ${runs} 場 (總消耗 ${totalCost} 體)`);
      alert(`已完成 ${runs} 場！\n剩餘基礎體力: ${currentBase}\n剩餘額外體力: ${currentExtra}`);
    } catch (e) { console.error("Complete run failed", e); alert("更新失敗"); }
  };

  const handleAddCharacter = async (member) => {
    if (currentUser === '訪客') return alert("訪客權限僅供瀏覽");
    const nameToAdd = newCharInputs[member]?.trim();
    if (!nameToAdd) return;
    try {
      const currentList = [...(characterData[member] || [])];
      const newCharObj = { 
          name: nameToAdd, gear: '', stamina: 0, extraStamina: 0, stamina100k: 0, craftStamina: 0, custom: '', note: '', class: null 
      };
      const newList = [...currentList, newCharObj];
      await setDoc(doc(db, "member_characters", "data"), { [member]: newList }, { merge: true });
      setNewCharInputs(prev => ({ ...prev, [member]: '' })); 
      sendLog(currentUser, "新增角色", `${member}: ${nameToAdd}`);
    } catch (e) { console.error("新增失敗", e); alert("新增失敗"); }
  };

  const handleDeleteCharacter = async (member, index) => {
    if (currentUser === '訪客') return alert("訪客權限僅供瀏覽");
    const currentList = characterData[member] || [];
    const target = currentList[index];
    const charName = typeof target === 'string' ? target : target.name;
    if (!window.confirm(`確定要刪除 ${member} 的角色 "${charName}" 嗎？`)) return;
    try {
      const newList = currentList.filter((_, i) => i !== index);
      await setDoc(doc(db, "member_characters", "data"), { [member]: newList }, { merge: true });
      sendLog(currentUser, "刪除角色", `${member}: ${charName}`);
    } catch (e) { console.error("刪除失敗", e); alert("刪除失敗"); }
  };

  // Drag and Drop
  const handleDragStart = (e, member, index) => {
    if (currentUser === '訪客' || !allowDrag) { e.preventDefault(); return; }
    setDragItem({ member, index });
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragEnter = (e, member, index) => {
    if (dragItem && dragItem.member === member) { setDragOverItem({ member, index }); }
  };
  const handleDragEnd = async () => {
    if (!dragItem || !dragOverItem) {
        setDragItem(null); setDragOverItem(null); setAllowDrag(false); return;
    }
    if (dragItem.member === dragOverItem.member) {
        const member = dragItem.member;
        const list = [...(characterData[member] || [])];
        const draggedContent = list[dragItem.index];
        list.splice(dragItem.index, 1);
        list.splice(dragOverItem.index, 0, draggedContent);
        setCharacterData(prev => ({ ...prev, [member]: list }));
        try {
            await setDoc(doc(db, "member_characters", "data"), { [member]: list }, { merge: true });
        } catch (e) { console.error("Sort update failed", e); alert("排序儲存失敗"); }
    }
    setDragItem(null); setDragOverItem(null); setAllowDrag(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto pb-20 relative">
      <style>{`
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { 
          -webkit-appearance: none; margin: 0; 
        }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold border-l-4 pl-3 border-green-500 mb-1" style={{ color: 'var(--app-text)' }}>
            角色列表
          </h2>
          <p className="text-sm opacity-60" style={{ color: 'var(--app-text)' }}>
            管理體力、額外體力與製作體力。自動回復與每週重置已啟用。
          </p>
        </div>
        <div className="flex gap-2">
           {currentUser && currentUser !== '訪客' && (
             <button 
               onClick={() => setIsEditMode(!isEditMode)}
               className={`flex items-center gap-2 px-3 py-2 rounded var(--app-text) shadow transition-all ${isEditMode ? 'bg-green-600' : 'bg-gray-500'}`}
             >
               {isEditMode ? <Save size={16}/> : <Edit3 size={16}/>}
               {isEditMode ? '完成編輯' : '編輯模式'}
             </button>
           )}
        </div>
      </div>

      {/* Member Toggles */}
      <div className="p-4 rounded-xl shadow-sm mb-6 flex flex-wrap gap-2 transition-colors" style={{ background: 'var(--app-card-bg)' }}>
        <button 
          onClick={() => setSelectedMembers(selectedMembers.length === memberNames.length ? [] : memberNames)}
          className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-all ${selectedMembers.length === memberNames.length ? 'bg-blue-600 var(--app-text) border-blue-600' : 'bg-transparent opacity-60 border-gray-500'}`}
          style={{ color: selectedMembers.length === memberNames.length ? 'white' : 'var(--app-text)' }}
        >
          {selectedMembers.length === memberNames.length ? '全選' : '全不選'}
        </button>
        <div className="w-px h-6 bg-gray-500/30 mx-2 self-center"></div>
        {memberNames.map(member => (
          <button
            key={member}
            onClick={() => handleToggleMember(member)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-all flex items-center gap-1
              ${selectedMembers.includes(member) 
                ? 'bg-blue-500/20 border-blue-500 text-blue-500 font-bold' 
                : 'bg-transparent border-gray-500/50 opacity-50'}`}
            style={{ 
              color: selectedMembers.includes(member) ? (isDarkMode ? '#60a5fa' : '#2563eb') : 'var(--app-text)',
              borderColor: selectedMembers.includes(member) ? (isDarkMode ? '#60a5fa' : '#2563eb') : undefined
            }}
          >
            {selectedMembers.includes(member) && <Check size={12} />}
            {member}
          </button>
        ))}
      </div>

      {/* Character Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {memberNames.filter(m => selectedMembers.includes(m)).map(member => {
          const chars = characterData[member] || [];
          
          return (
            <div 
              key={member} 
              className="rounded-xl overflow-hidden shadow-md flex flex-col border border-white/10 transition-colors"
              style={{ background: 'var(--app-card-bg)' }}
            >
              {/* Member Header */}
              <div className="p-3 border-b border-white/10 flex justify-between items-center bg-black/10">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-full bg-blue-500 var(--app-text)"><User size={16} /></div>
                  <h3 className="font-bold text-lg" style={{ color: 'var(--app-text)' }}>{member}</h3>
                  <span className="text-xs opacity-50 bg-black/20 px-2 py-0.5 rounded-full" style={{ color: 'var(--app-text)' }}>{chars.length} 角</span>
                </div>
              </div>

              {/* Characters List */}
              <div className="p-3 flex-1 flex flex-col gap-3">
                {chars.length > 0 ? (
                  chars.map((charData, idx) => {
                    const char = typeof charData === 'string' 
                      ? { name: charData, gear: '', stamina: 0, extraStamina: 0, stamina100k: 0, craftStamina: 0, custom: '', note: '', class: null } 
                      : charData;

                    const isDragging = dragItem && dragItem.member === member && dragItem.index === idx;
                    const isDragOver = dragOverItem && dragOverItem.member === member && dragOverItem.index === idx;
                    const currentClass = CLASS_OPTIONS.find(c => c.id === char.class);
                    
                    const totalStamina = (parseInt(char.stamina) || 0) + (parseInt(char.extraStamina) || 0);
                    const totalRuns = Math.floor(totalStamina / 80);

                    return (
                      <div 
                        key={idx}
                        draggable={currentUser !== '訪客' && allowDrag}
                        onDragStart={(e) => handleDragStart(e, member, idx)}
                        onDragEnter={(e) => handleDragEnter(e, member, idx)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        className={`flex flex-col gap-2 p-3 rounded border shadow-sm relative group transition-all
                          ${isDragging ? 'opacity-40 border-dashed border-white' : 'bg-black/5 border-white/5'}
                          ${isDragOver ? 'border-blue-500 border-2' : ''}
                          ${currentUser !== '訪客' && allowDrag ? 'cursor-move' : ''}
                        `}
                      >
                        {/* Row 1: Handle | Class | Name | Gear | Copy */}
                        <div className="flex items-center gap-2">
                          <div 
                             className="opacity-30 flex-shrink-0 cursor-grab hover:opacity-100 hover:text-blue-400 p-1 -ml-1"
                             onMouseEnter={() => setAllowDrag(true)}
                             onMouseLeave={() => setAllowDrag(false)}
                             onTouchStart={() => setAllowDrag(true)}
                             onTouchEnd={() => setAllowDrag(false)}
                          >
                             <GripVertical size={16} />
                          </div>
                          
                          <button
                            onClick={() => {
                                if (currentUser === '訪客') return;
                                setClassSelector({ isOpen: true, member, index: idx });
                            }}
                            onMouseDown={(e) => e.stopPropagation()} 
                            className={`flex items-center justify-center rounded-lg border border-white/10 transition-all hover:brightness-110 active:scale-95 flex-shrink-0 overflow-hidden
                                ${currentClass ? 'w-8 h-8' : 'w-24 h-8 bg-white/5 hover:bg-white/10'}`}
                            title={currentClass ? currentClass.label : "點擊設定職業"}
                          >
                             {currentClass ? (
                                 <img src={CLASS_ICON_BASE_PATH + currentClass.img} alt={currentClass.label} className="w-full h-full object-cover"/>
                             ) : (
                                 <span className="text-[10px] opacity-60">設定職業</span>
                             )}
                          </button>

                          <span className="font-bold text-base flex-1 truncate select-text" style={{ color: 'var(--card-text)' }}>
                            {char.name}
                          </span>
                          
                          <EditableField 
                            type="text" 
                            className="w-14 text-center text-sm p-1 rounded bg-black/10 border border-white/10 outline-none focus:border-blue-500"
                            placeholder="裝等"
                            style={{ color: 'var(--card-text)' }}
                            value={char.gear}
                            onSave={(val) => updateCharacterField(member, idx, 'gear', val)}
                          />

                          <button 
                            onClick={() => handleCopy(char.name)}
                            onMouseDown={(e) => e.stopPropagation()} 
                            className={`p-1.5 rounded transition-colors ${copiedId === char.name ? 'bg-green-500 var(--app-text)' : 'bg-white/10 text-gray-400 hover:bg-white/20'}`}
                          >
                            {copiedId === char.name ? <Check size={14}/> : <Copy size={14}/>}
                          </button>

                          {isEditMode && (
                            <button 
                              onClick={() => handleDeleteCharacter(member, idx)}
                              onMouseDown={(e) => e.stopPropagation()} 
                              className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500 hover:var(--app-text) transition-colors"
                            >
                              <Trash2 size={14}/>
                            </button>
                          )}
                        </div>

                        {/* Row 2: 基礎體力 | 額外體力 | 完場操作 */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 flex-1 bg-black/10 rounded px-2 py-1 border border-white/5">
                            <Zap size={14} className="text-blue-500 flex-shrink-0" title="基礎體力 (上限840)"/>
                            <EditableField 
                              type="number" 
                              className="w-full bg-transparent outline-none text-sm text-center font-mono"
                              placeholder="基礎"
                              style={{ color: 'var(--card-text)' }}
                              value={char.stamina}
                              onSave={(val) => updateCharacterField(member, idx, 'stamina', Math.min(BASE_STAMINA_CAP, parseInt(val)||0))}
                            />
                          </div>

                          <div className="flex items-center gap-1 flex-1 bg-black/10 rounded px-2 py-1 border border-white/5">
                            <BatteryCharging size={14} className="text-yellow-500 flex-shrink-0" title="額外體力 (上限2000)"/>
                            <EditableField 
                              type="number" 
                              className="w-full bg-transparent outline-none text-sm text-center font-mono"
                              placeholder="額外"
                              style={{ color: 'var(--card-text)' }}
                              value={char.extraStamina}
                              onSave={(val) => updateCharacterField(member, idx, 'extraStamina', Math.min(EXTRA_STAMINA_CAP, parseInt(val)||0))}
                            />
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-blue-400 bg-blue-900/30 px-1 rounded whitespace-nowrap" title="總體力/80">
                                可打:{totalRuns}
                            </span>

                            <EditableField 
                              type="number" 
                              className="w-8 text-center text-sm p-1 rounded bg-black/10 border border-white/10 outline-none"
                              placeholder="場" 
                              style={{ color: 'var(--card-text)' }}
                              value={char.custom}
                              onSave={(val) => updateCharacterField(member, idx, 'custom', val)}
                            />
                            <button 
                              className="bg-purple-600 hover:bg-purple-500 var(--app-text) text-[10px] px-2 py-1.5 rounded flex items-center gap-1 whitespace-nowrap shadow"
                              title={`完場：扣除 ${(char.custom||0)*STAMINA_PER_RUN} 體力 (優先扣基礎)`}
                              onClick={() => handleCompleteRun(member, idx)}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              <PlayCircle size={10}/> 完場
                            </button>
                          </div>
                        </div>

                        {/* Row 3: 10萬體 | 製作體 */}
                        <div className="flex items-center gap-2">
                           <div className="flex items-center gap-1 flex-1 bg-black/10 rounded px-2 py-1 border border-white/5" title="每週三 05:00 重置">
                             <Hammer size={14} className="text-gray-400 flex-shrink-0"/>
                             <span className="text-[10px] opacity-60">製作</span>
                             <EditableField 
                               type="number" 
                               className="w-full bg-transparent outline-none text-sm text-center font-mono"
                               placeholder="0"
                               style={{ color: 'var(--card-text)' }}
                               value={char.craftStamina}
                               onSave={(val) => handleResourceUpdate(member, idx, 'craftStamina', val)}
                             />
                           </div>

                           <div className="flex items-center gap-1 flex-1 bg-black/10 rounded px-2 py-1 border border-white/5" title="每週一 00:00 重置">
                             <Package size={14} className="text-orange-400 flex-shrink-0"/>
                             <span className="text-[10px] opacity-60">10萬</span>
                             <EditableField 
                               type="number" 
                               className="w-full bg-transparent outline-none text-sm text-center font-mono"
                               placeholder="0"
                               style={{ color: 'var(--card-text)' }}
                               value={char.stamina100k}
                               onSave={(val) => handleResourceUpdate(member, idx, 'stamina100k', val)}
                             />
                           </div>
                        </div>

                        {/* Row 4: Note */}
                        <div>
                          <EditableField 
                            type="text" 
                            className="w-full text-xs p-1 bg-transparent border-b border-white/10 outline-none focus:border-white/30 placeholder-white/20"
                            placeholder="備註..."
                            style={{ color: 'var(--card-text)' }}
                            value={char.note}
                            onSave={(val) => updateCharacterField(member, idx, 'note', val)}
                          />
                        </div>

                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-4 opacity-30 text-sm italic" style={{ color: 'var(--app-text)' }}>
                    尚無角色資料
                  </div>
                )}

                {/* Add New Input */}
                {isEditMode && (
                  <div className="mt-2 flex gap-2 animate-in fade-in">
                    <input 
                      type="text" 
                      placeholder="輸入新角色 ID..."
                      className="flex-1 p-2 text-sm rounded border border-gray-500/30 bg-black/20 outline-none focus:border-blue-500"
                      style={{ color: 'var(--app-text)' }}
                      value={newCharInputs[member] || ''}
                      onChange={(e) => setNewCharInputs({...newCharInputs, [member]: e.target.value})}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCharacter(member)}
                    />
                    <button 
                      onClick={() => handleAddCharacter(member)}
                      className="p-2 bg-blue-600 var(--app-text) rounded hover:bg-blue-700 disabled:opacity-50"
                      disabled={!newCharInputs[member]}
                    >
                      <Plus size={18}/>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Class Selector Modal */}
      {classSelector.isOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in"
          onClick={() => setClassSelector({ isOpen: false, member: null, index: null })}
        >
          <div 
            className={`w-full max-w-sm rounded-xl p-6 shadow-2xl scale-100 animate-in zoom-in-95 duration-200 ${isDarkMode ? 'var(--card-bg) var(--app-text)' : 'bg-white text-gray-800'}`}
            onClick={(e) => e.stopPropagation()} 
          >
            <div className="flex justify-between items-center mb-4">
               <h3 className="font-bold text-lg flex items-center gap-2"><User size={20}/> 選擇職業</h3>
               <button onClick={() => setClassSelector({ isOpen: false, member: null, index: null })} className="p-1 rounded hover:bg-gray-500/20"><X size={20}/></button>
            </div>
            
            <div className="grid grid-cols-4 gap-3">
               {CLASS_OPTIONS.map(opt => (
                 <button
                   key={opt.id}
                   onClick={() => handleSelectClass(opt.id)}
                   className="flex flex-col items-center justify-center gap-2 p-2 rounded-lg border border-transparent hover:border-gray-500/30 hover:bg-black/5 transition-all active:scale-95"
                 >
                   <div className="w-12 h-12 rounded overflow-hidden shadow-lg bg-black/20">
                     <img src={CLASS_ICON_BASE_PATH + opt.img} alt={opt.label} className="w-full h-full object-cover"/>
                   </div>
                   <span className="text-xs font-bold opacity-80">{opt.label}</span>
                 </button>
               ))}
               <button
                   onClick={() => handleSelectClass(null)}
                   className="flex flex-col items-center justify-center gap-2 p-2 rounded-lg border border-dashed border-gray-400/50 hover:bg-black/5 transition-all active:scale-95 opacity-60 hover:opacity-100"
               >
                   <div className="w-12 h-12 rounded flex items-center justify-center bg-gray-400/20"><X size={24} className="opacity-50"/></div>
                   <span className="text-xs font-bold">清除</span>
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CharacterListView;