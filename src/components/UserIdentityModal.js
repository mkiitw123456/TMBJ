// src/components/UserIdentityModal.js
import React, { useState } from 'react';
import { Shield, User, LogIn, KeyRound, ArrowLeft } from 'lucide-react';

const UserIdentityModal = ({ isOpen, onClose, onLogin, members = [] }) => {
  const [step, setStep] = useState('select'); // select | password
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
    // 找出目前選擇的成員物件
    const targetMember = members.find(m => m.name === selectedUser);
    
    // 如果資料庫有設定密碼，就比對設定的；如果沒設定，預設為 "1234"
    const correctPassword = targetMember?.password || '1234';

    if (password === correctPassword || password === '') { // 允許空密碼方便測試，正式版可移除
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
      <div 
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl transform transition-all scale-100 flex flex-col max-h-[80vh]"
        style={{ background: 'var(--card-bg)', color: 'var(--app-text)' }}
      >
        <div className="text-center mb-6 relative">
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
            <div className="grid grid-cols-2 gap-3 overflow-y-auto p-2 custom-scrollbar flex-1">
                {members.map(member => (
                <button
                    key={member.name}
                    onClick={() => handleSelectUser(member.name)}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border border-transparent hover:border-blue-500/50 hover:bg-blue-500/10 transition-all group relative overflow-hidden"
                    style={{ background: 'rgba(0,0,0,0.2)' }} 
                >
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform">
                        <User size={24}/>
                    </div>
                    <span className="font-bold text-sm truncate w-full text-center">{member.name}</span>
                </button>
                ))}
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
            <div className="mt-6 pt-4 border-t border-gray-500/20 text-center">
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