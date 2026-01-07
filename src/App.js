// src/App.js
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Users, Calculator, Clock, Menu, X, 
  LogOut, PenTool, Key 
} from 'lucide-react';
import AccountingView from './views/AccountingView';
import BossTimerView from './views/BossTimerView';
import CharacterListView from './views/CharacterListView'; 
import UserIdentityModal from './components/UserIdentityModal';
import ThemeEditor from './components/ThemeEditor';
import PasswordManagerModal from './components/PasswordManagerModal'; 
import { MEMBERS } from './utils/constants'; 
import { collection, getDocs } from "firebase/firestore";
import { db } from './config/firebase';
import { sendNotify } from './utils/helpers'; // 引入 sendNotify

const App = () => {
  const [activeTab, setActiveTab] = useState('boss');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDevModeOpen, setIsDevModeOpen] = useState(false);
  const [isPasswordManagerOpen, setIsPasswordManagerOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState(localStorage.getItem('currentUser') || '訪客');
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(!localStorage.getItem('currentUser'));
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    const fetchMembers = async () => {
      if (!db) {
        setMembers(MEMBERS.map(name => ({ name, password: '' })));
        setLoadingMembers(false);
        return;
      }
      try {
        const querySnapshot = await getDocs(collection(db, "members"));
        const memberList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (memberList.length === 0) {
           const defaultMembers = MEMBERS.map(name => ({ name, password: '' }));
           setMembers(defaultMembers);
        } else {
           setMembers(memberList);
        }
      } catch (error) {
        console.error("Error fetching members:", error);
        setMembers(MEMBERS.map(name => ({ name, password: '' }))); 
      } finally {
        setLoadingMembers(false);
      }
    };
    fetchMembers();
  }, [isIdentityModalOpen]); 

  const handleLogin = (name) => {
    setCurrentUser(name);
    localStorage.setItem('currentUser', name);
    setIsIdentityModalOpen(false);
    
    // 加入登入通知
    sendNotify(`👋 **[系統登入]** ${name} 已登入系統`);
  };

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    setCurrentUser('訪客');
    setIsIdentityModalOpen(true);
  };

  useEffect(() => {
    const root = document.documentElement;
    if (!localStorage.getItem('custom_theme_settings')) {
        root.style.setProperty('--app-bg', '#1e293b');
        root.style.setProperty('--app-text', '#f3f4f6');
        root.style.setProperty('--card-bg', '#1f2937');
        root.style.setProperty('--sidebar-bg', 'rgba(31, 41, 55, 0.5)');
        root.style.setProperty('--sidebar-border', 'rgba(255, 255, 255, 0.1)');
    }
  }, []);

  if (loadingMembers) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">系統載入中...</div>;

  const NavItem = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => { setActiveTab(id); setIsMobileMenuOpen(false); }}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 w-full md:w-auto
        ${activeTab === id 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' 
          : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
    >
      <Icon size={20} />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div 
      className="min-h-screen transition-colors duration-300 font-sans flex flex-col"
      style={{ background: 'var(--app-bg)', color: 'var(--app-text)' }}
    >
      <nav className="sticky top-0 z-50 backdrop-blur-md border-b border-white/10 bg-black/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2 rounded-lg shadow-lg">
                <LayoutDashboard size={24} className="text-white" />
              </div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400 hidden sm:block">
                 天魔鏢局 團隊系統
              </h1>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <NavItem id="boss" icon={Clock} label="Boss 時間" />
              <NavItem id="accounting" icon={Calculator} label="團隊記帳" />
              <NavItem id="characters" icon={Users} label="角色體力" />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
                <span className="text-sm font-medium">{currentUser}</span>
                <button onClick={handleLogout} className="ml-2 text-gray-400 hover:text-red-400" title="登出">
                    <LogOut size={14}/>
                </button>
              </div>

              <div className="flex gap-1">
                  {currentUser === 'Wolf' && (
                    <button 
                        onClick={() => setIsPasswordManagerOpen(true)} 
                        className="p-2 rounded-lg text-gray-400 hover:text-green-400 hover:bg-white/10 transition-colors" 
                        title="管理成員密碼"
                    >
                        <Key size={20}/>
                    </button>
                  )}

                  <button onClick={() => setIsDevModeOpen(true)} className="p-2 rounded-lg text-gray-400 hover:text-yellow-400 hover:bg-white/10 transition-colors" title="開啟工程模式 (調色盤)">
                    <PenTool size={20}/>
                  </button>
              </div>

              <button className="md:hidden p-2 text-gray-400 hover:text-white" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden px-4 pb-4 space-y-2 border-t border-white/10 bg-gray-900/95 backdrop-blur-xl absolute w-full">
            <NavItem id="boss" icon={Clock} label="Boss 時間" />
            <NavItem id="accounting" icon={Calculator} label="團隊記帳" />
            <NavItem id="characters" icon={Users} label="角色體力" />
          </div>
        )}
      </nav>

      <main className="flex-1 overflow-hidden relative">
        <div className="h-full w-full overflow-auto custom-scrollbar">
            {activeTab === 'accounting' && <AccountingView isDarkMode={true} currentUser={currentUser} members={members} />}
            {activeTab === 'boss' && <BossTimerView isDarkMode={true} currentUser={currentUser} />}
            {activeTab === 'characters' && <CharacterListView isDarkMode={true} currentUser={currentUser} members={members} />}
        </div>
      </main>

      <UserIdentityModal 
        isOpen={isIdentityModalOpen} 
        onClose={() => { if(currentUser !== '訪客') setIsIdentityModalOpen(false); }} 
        onLogin={handleLogin}
        members={members}
      />

      <ThemeEditor 
        isOpen={isDevModeOpen} 
        onClose={() => setIsDevModeOpen(false)} 
      />

      <PasswordManagerModal 
        isOpen={isPasswordManagerOpen}
        onClose={() => setIsPasswordManagerOpen(false)}
        currentUser={currentUser}
      />

    </div>
  );
};

export default App;