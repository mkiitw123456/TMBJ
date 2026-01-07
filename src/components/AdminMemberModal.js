// src/components/AdminMemberModal.js
import React, { useState } from 'react';
import { X, UserPlus, Trash2, Shield, Key } from 'lucide-react';
import { doc, updateDoc } from "firebase/firestore";
import { db } from '../config/firebase';

const AdminMemberModal = ({ isOpen, onClose, members, currentUser }) => {
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  if (!isOpen) return null;

  const handleAddMember = async () => {
    if (!newName.trim() || !newPassword.trim()) return alert("請輸入名稱與密碼");
    if (members.some(m => m.name === newName)) return alert("成員名稱已存在");

    const newMember = { name: newName, password: newPassword, role: 'member' };
    const updatedList = [...members, newMember];

    try {
      // 更新 Firebase 資料庫
      await updateDoc(doc(db, "system_data", "member_config"), { list: updatedList });
      setNewName('');
      setNewPassword('');
      alert(`已新增成員: ${newName}`);
    } catch (e) {
      console.error(e);
      alert("新增失敗，請檢查網路或權限");
    }
  };

  const handleDeleteMember = async (targetName) => {
    if (targetName === 'Wolf') return alert("不能刪除最高權限管理者 (Wolf)");
    if (!window.confirm(`確定要永久刪除 ${targetName} 嗎？\n(這不會刪除他的歷史記帳紀錄，但會讓他無法登入)`)) return;

    const updatedList = members.filter(m => m.name !== targetName);
    try {
      await updateDoc(doc(db, "system_data", "member_config"), { list: updatedList });
    } catch (e) {
      console.error(e);
      alert("刪除失敗");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-700 p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold flex items-center gap-2 text-yellow-500">
            <Shield className="fill-yellow-500 text-gray-900"/> 成員管理後台
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-800"><X /></button>
        </div>

        {/* 新增區域 */}
        <div className="bg-gray-800 p-4 rounded-lg mb-6 border border-gray-700">
          <h4 className="text-sm font-bold text-gray-400 mb-3">新增成員</h4>
          <div className="flex flex-col gap-2">
            <input 
              type="text" placeholder="成員名稱 (ID)" 
              className="p-2 rounded bg-gray-700 border border-gray-600 text-white outline-none focus:border-yellow-500"
              value={newName} onChange={e => setNewName(e.target.value)}
            />
            <input 
              type="text" placeholder="登入密碼" 
              className="p-2 rounded bg-gray-700 border border-gray-600 text-white outline-none focus:border-yellow-500"
              value={newPassword} onChange={e => setNewPassword(e.target.value)}
            />
            <button 
              onClick={handleAddMember} 
              className="mt-2 py-2 bg-green-600 hover:bg-green-700 rounded font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <UserPlus size={18}/> 新增至名單
            </button>
          </div>
        </div>

        {/* 列表區域 */}
        <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
          {members.map(m => (
            <div key={m.name} className="flex justify-between items-center p-3 bg-gray-800 rounded border border-gray-700 hover:border-gray-500 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${m.role === 'admin' ? 'bg-yellow-500 shadow-[0_0_10px_yellow]' : 'bg-blue-500'}`}></div>
                <span className="font-bold">{m.name}</span>
                <span className="text-xs text-gray-500 flex items-center gap-1 font-mono bg-black/30 px-2 py-0.5 rounded">
                  <Key size={10}/> {m.password}
                </span>
              </div>
              {m.role !== 'admin' && (
                <button 
                  onClick={() => handleDeleteMember(m.name)} 
                  className="text-gray-500 hover:text-red-500 p-2 hover:bg-red-500/10 rounded transition-colors"
                  title="刪除此成員"
                >
                  <Trash2 size={16}/>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminMemberModal;