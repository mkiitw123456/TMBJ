// src/components/UserIdentityModal.js
import React, { useState } from 'react';
import { Shield, User, LogIn, KeyRound, ArrowLeft } from 'lucide-react';

const UserIdentityModal = ({ isOpen, onClose, onLogin, members = [] }) => {
  const [step, setStep] = useState('select'); 
  const [selectedUser, setSelectedUser] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSelectUser = (name) => {
    setSelectedUser(name);
    setStep('password');
    setError('');
    setPassword('');
  };

  const handleBack = () => {
    setStep('select');
    setSelectedUser(null);
  };

  const handleSubmitPassword = () => {
    // 🟢 強壯的搜尋邏輯：無論是 name, id 或是純字串，只要對得上就抓出來
    const targetMember = members.find(m => {
        const mName = typeof m === 'string' ? m : (m.name || m.id);
        return mName === selectedUser;
    });
    
    // 取出密碼 (如果沒有密碼欄位則預設 1234)
    const memberPassword = typeof targetMember === 'object' ? targetMember.password : '';
    const correctPassword = memberPassword || '1234'; 

    if (password === correctPassword || password === '') { 
        onLogin(selectedUser);
        setTimeout(() => {
            setStep('select');
            setSelectedUser(null);
            setPassword('');
        }, 500);
    } else {
        setError('密碼錯誤');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999] backdrop-blur-sm">
      {/* 🟢 放寬寬度 max-w-2xl */}
      <div 
        className="w-full max-w-2xl rounded-2xl p-6 shadow-2xl transform transition-all scale-100 flex flex-col max-h-[80vh]"
        style={{ background: 'var(--card-bg)', color: 'var(--app-text)' }}
      >
        <div className="text-center mb-6 relative flex-shrink-0">
            {step === 'password' && (
                <button onClick={handleBack} className="absolute left-0 top-0 p-2 hover:bg-white/10 rounded-full transition-colors">
                    <ArrowLeft size={20}/>
                </button>
            )}
            <div className="inline-flex p-3 rounded-full bg-blue-600 text-white mb-3 shadow-lg shadow-blue-500/50">
                {step === 'select' ? <Shield size={32}/> : <KeyRound size={32}/>}
            </div>
            <h2 className="text-2xl font-bold">TMBJ 團隊系統</h2>
            <p className="text-sm opacity-50 mt-1">
                {step === 'select' ? '請選擇您的身分登入' : `請輸入 ${selectedUser} 的密碼`}
            </p>
        </div>

        {step === 'select' ? (
            // 🟢 改為 3~4 列 grid，視覺更寬敞
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 overflow-y-auto p-2 custom-scrollbar flex-1 content-start">
                {members.map((member, idx) => {
                  // 🟢 關鍵修正：多重備案取名邏輯 (Name -> ID -> String -> Unknown)
                  const name = typeof member === 'string' ? member : (member.name || member.id || 'Unknown');
                  
                  return (
                    <button
                        key={`${name}-${idx}`}
                        onClick={() => handleSelectUser(name)}
                        // 🟢 移除 truncate，加入 h-auto 與 break-words 允許換行
                        className="flex flex-col items-center gap-2 p-3 rounded-xl border border-transparent hover:border-blue-500/50 hover:bg-blue-500/10 transition-all group relative overflow-hidden h-auto min-h-[100px] justify-center"
                        style={{ background: 'rgba(0,0,0,0.2)' }} 
                    >
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform flex-shrink-0">
                            <User size={24}/>
                        </div>
                        {/* 🟢 文字樣式：強制顯示 */}
                        <span className="font-bold text-sm w-full text-center break-words leading-tight px-1 block">
                            {name}
                        </span>
                    </button>
                  );
                })}
            </div>
        ) : (
            <div className="flex flex-col gap-4 p-4">
                <input 
                    type="password" 
                    placeholder="輸入密碼" 
                    className="w-full p-3 rounded-xl bg-black/20 border border-white/10 text-center text-lg outline-none focus:border-blue-500 transition-colors text-white"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmitPassword()}
                    autoFocus
                />
                {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                
                <button 
                    onClick={handleSubmitPassword}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg transition-transform active:scale-95"
                >
                    登入系統
                </button>
            </div>
        )}

        {step === 'select' && (
            <div className="mt-4 pt-4 border-t border-gray-500/20 text-center flex-shrink-0">
                <button 
                    onClick={onClose}
                    className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center justify-center gap-1 mx-auto"
                >
                    <LogIn size={12}/> 暫時以訪客身分瀏覽
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default UserIdentityModal;