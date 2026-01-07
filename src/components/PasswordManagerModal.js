// src/components/PasswordManagerModal.js
import React, { useState, useEffect } from 'react';
import { X, Save, Key, User, Loader2, UploadCloud, Plus } from 'lucide-react';
import { collection, doc, onSnapshot, updateDoc, writeBatch, setDoc } from "firebase/firestore";
import { db } from '../config/firebase';
import { sendLog } from '../utils/helpers';
import { MEMBERS } from '../utils/constants';

const PasswordManagerModal = ({ isOpen, onClose, currentUser }) => {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [importing, setImporting] = useState(false);
  
  // 新增成員的狀態
  const [newMemberName, setNewMemberName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!isOpen || !db) return;
    const unsub = onSnapshot(collection(db, "members"), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setMembers(list);
      
      const initialPw = {};
      list.forEach(m => { initialPw[m.id] = m.password || ''; });
      setPasswords(initialPw);
      setLoading(false);
    });
    return () => unsub();
  }, [isOpen]);

  const handlePasswordChange = (id, val) => {
    setPasswords(prev => ({ ...prev, [id]: val }));
  };

  const handleSave = async (id, name) => {
    const newPassword = passwords[id];
    setSavingId(id);
    try {
        await updateDoc(doc(db, "members", id), { password: newPassword });
        sendLog(currentUser, "管理員修改密碼", `修改了 ${name} 的密碼`);
        setTimeout(() => setSavingId(null), 500);
    } catch (e) {
        alert("儲存失敗");
        setSavingId(null);
    }
  };

  const handleImportDefaults = async () => {
      if (!window.confirm("確定匯入預設名單？")) return;
      setImporting(true);
      try {
          const batch = writeBatch(db);
          let count = 0;
          MEMBERS.forEach(name => {
              const exists = members.some(m => m.name === name);
              if (!exists) {
                  const newRef = doc(collection(db, "members"));
                  batch.set(newRef, { name, password: '', role: 'DPS', joinedAt: new Date().toISOString() });
                  count++;
              }
          });
          if (count > 0) await batch.commit();
          alert(`成功匯入 ${count} 位成員`);
      } catch (e) { alert("匯入失敗: " + e.message); }
      setImporting(false);
  };

  // 新增成員函式
  const handleAddMember = async () => {
      if (!newMemberName.trim()) return alert("請輸入成員名稱");
      if (members.some(m => m.name === newMemberName)) return alert("該成員已存在");
      
      setIsAdding(true);
      try {
          await setDoc(doc(collection(db, "members")), {
              name: newMemberName,
              password: '', // 預設無密碼
              role: 'DPS',
              joinedAt: new Date().toISOString()
          });
          sendLog(currentUser, "新增成員", newMemberName);
          setNewMemberName('');
      } catch (e) {
          console.error(e);
          alert("新增失敗");
      } finally {
          setIsAdding(false);
      }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
      <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col max-h-[80vh] text-gray-100">
        
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800 rounded-t-xl">
          <h3 className="font-bold text-lg flex items-center gap-2 text-yellow-500">
            <Key size={20}/> 成員與密碼管理
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"><X size={24}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            
            {/* 新增成員區塊 */}
            <div className="bg-blue-900/20 border border-blue-500/30 p-3 rounded-lg flex gap-2 items-center">
                <input 
                    type="text" 
                    placeholder="輸入新成員 ID" 
                    className="flex-1 bg-black/40 border border-blue-500/30 rounded px-3 py-2 text-sm outline-none focus:border-blue-500 text-white placeholder-gray-500"
                    value={newMemberName}
                    onChange={e => setNewMemberName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddMember()}
                />
                <button 
                    onClick={handleAddMember} 
                    disabled={isAdding}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded flex items-center gap-1 text-sm font-bold disabled:opacity-50"
                >
                    {isAdding ? <Loader2 size={16} className="animate-spin"/> : <Plus size={16}/>} 新增
                </button>
            </div>

            <hr className="border-gray-700/50"/>

            {/* 列表 */}
            {loading ? (
                <div className="text-center py-10 opacity-50 flex flex-col items-center gap-2"><Loader2 className="animate-spin"/> 載入中...</div>
            ) : members.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 gap-4 text-center">
                    <div className="opacity-50 text-sm">資料庫為空</div>
                    <button onClick={handleImportDefaults} disabled={importing} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg shadow text-sm">
                        {importing ? <Loader2 className="animate-spin" size={16}/> : <UploadCloud size={16}/>} 匯入預設名單
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    {members.map(member => (
                        <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 hover:border-gray-600 transition-colors">
                            <div className="p-2 rounded-full bg-gray-700 text-gray-300"><User size={16}/></div>
                            <div className="flex-1 min-w-0 font-bold text-sm truncate">{member.name}</div>
                            <div className="flex items-center gap-2">
                                <input type="text" className="w-24 bg-black/30 border border-gray-600 rounded px-2 py-1.5 text-sm text-center outline-none focus:border-yellow-500 text-white placeholder-gray-600"
                                    placeholder="密碼" value={passwords[member.id] || ''} onChange={(e) => handlePasswordChange(member.id, e.target.value)}
                                />
                                <button onClick={() => handleSave(member.id, member.name)} disabled={savingId === member.id} className={`p-2 rounded transition-all ${savingId === member.id ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-blue-600 hover:text-white'}`}>
                                    {savingId === member.id ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default PasswordManagerModal;