// src/App.js
import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Users, Calculator, Clock, Menu, X, 
  LogOut, PenTool, Key, Settings // ✅ 新增 Settings 圖示
} from 'lucide-react';

// Views
import AccountingView from './views/AccountingView';
import BossTimerView from './views/BossTimerView';
import CharacterListView from './views/CharacterListView'; 

// Components
import UserIdentityModal from './components/UserIdentityModal';
import ThemeEditor from './components/ThemeEditor';
import PasswordManagerModal from './components/PasswordManagerModal';
import UpdateNotification from './components/UpdateNotification'; // ✅ 新增：更新通知元件
import SystemSettingsModal from './components/SystemSettingsModal'; // ✅ 新增：系統設定元件

// Utils & Config
import { MEMBERS, APP_VERSION } from './utils/constants'; 
import { collection, getDocs, doc, onSnapshot } from "firebase/firestore"; // ✅ 新增 doc, onSnapshot
import { db } from './config/firebase';
import { sendNotify } from './utils/helpers'; 

const App = () => {
  // === 頁面狀態 ===
  const [activeTab, setActiveTab] = useState('boss');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // === Modal 開關狀態 ===
  const [isDevModeOpen, setIsDevModeOpen] = useState(false);
  const [isPasswordManagerOpen, setIsPasswordManagerOpen] = useState(false);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false); // ✅ 新增：系統設定 Modal 開關

  // === 使用者與成員資料 ===
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('currentUser') || '訪客');
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState(!localStorage.getItem('currentUser'));
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  // === 版本控制狀態 ===
  const [remoteVersion, setRemoteVersion] = useState(APP_VERSION); // ✅ 新增：雲端版號
  const [showUpdateNotice, setShowUpdateNotice] = useState(false); // ✅ 新增：是否顯示更新通知

  // 1. 抓取成員名單
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
        memberList.sort((a, b) => {
          // 1. 優先比較 'order' 欄位 (數字小在前面)
          // 如果沒有設定 order，預設給 999 (排後面)
          const orderA = typeof a.order === 'number' ? a.order : 999;
          const orderB = typeof b.order === 'number' ? b.order : 999;
          
          if (orderA !== orderB) {
            return orderA - orderB;
          }

          // 2. 如果 order 一樣，則依照名字排序 (支援中文筆畫)
          return a.name.localeCompare(b.name, "zh-Hant");
        });
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

  // 2. ✅ 新增：版本號監聽 (Version Listener)
  useEffect(() => {
    if (!db) return;
    
    // 監聽 system_data 集合裡的 global_settings 文件
    const unsub = onSnapshot(doc(db, "system_data", "global_settings"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const serverVersion = data.appVersion;
        
        if (serverVersion) {
          setRemoteVersion(serverVersion);
          // 如果 雲端版本 與 本地版本 不同，就顯示通知
          if (serverVersion !== APP_VERSION) {
            setShowUpdateNotice(true);
          }
        }
      }
    });

    return () => unsub();
  }, []);

  // 3. ✅ 新增：刷新頁面函式
  const handleRefreshApp = () => {
    window.location.reload(true);
  };

  // 4. 登入處理
  const handleLogin = (name) => {
    setCurrentUser(name);
    localStorage.setItem('currentUser', name);
    setIsIdentityModalOpen(false);
    sendNotify(`👋 **[系統登入]** ${name} 已登入系統`);
  };

  // 5. 登出處理
  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    setCurrentUser('訪客');
    setIsIdentityModalOpen(true);
  };

  // 6. 初始化 CSS 變數 (防閃爍)
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
      {/* === Navbar === */}
      <nav className="sticky top-0 z-50 backdrop-blur-md border-b border-white/10 bg-black/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2 rounded-lg shadow-lg">
                <LayoutDashboard size={24} className="text-white" />
              </div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400 hidden sm:block">
                 Aion2帳務 網頁系統
              </h1>
              {/* 顯示當前版本號 (Optional) */}
              <span className="text-[10px] bg-white/10 px-1.5 rounded text-gray-400 font-mono hidden sm:block">
                v{APP_VERSION}
              </span>
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
                    <>
                      {/* 管理員專用：密碼管理 */}
                      <button 
                          onClick={() => setIsPasswordManagerOpen(true)} 
                          className="p-2 rounded-lg text-gray-400 hover:text-green-400 hover:bg-white/10 transition-colors" 
                          title="管理成員密碼"
                      >
                          <Key size={20}/>
                      </button>
                      
                      {/* ✅ 新增：管理員專用：系統版本設定 */}
                      <button 
                          onClick={() => setIsSystemSettingsOpen(true)} 
                          className="p-2 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-white/10 transition-colors" 
                          title="系統版本設定"
                      >
                          <Settings size={20}/>
                      </button>
                    </>
                  )}

                  {/* 一般成員：工程模式 (調色盤) */}
                  <button 
                    onClick={() => setIsDevModeOpen(true)} 
                    className="p-2 rounded-lg text-gray-400 hover:text-yellow-400 hover:bg-white/10 transition-colors" 
                    title="開啟工程模式 (調色盤)"
                  >
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

      {/* === Main Content === */}
      <main className="flex-1 overflow-hidden relative">
        <div className="h-full w-full overflow-auto custom-scrollbar">
            {activeTab === 'accounting' && <AccountingView isDarkMode={true} currentUser={currentUser} members={members} />}
            {activeTab === 'boss' && <BossTimerView isDarkMode={true} currentUser={currentUser} />}
            {activeTab === 'characters' && <CharacterListView isDarkMode={true} currentUser={currentUser} members={members} />}
        </div>
      </main>

      {/* === Modals & Notifications === */}
      
      {/* 1. 身分登入 Modal */}
      <UserIdentityModal 
        isOpen={isIdentityModalOpen} 
        onClose={() => { if(currentUser !== '訪客') setIsIdentityModalOpen(false); }} 
        onLogin={handleLogin}
        members={members}
      />

      {/* 2. 調色盤 Theme Editor */}
      <ThemeEditor 
        isOpen={isDevModeOpen} 
        onClose={() => setIsDevModeOpen(false)} 
      />

      {/* 3. 密碼管理器 (Wolf Only) */}
      <PasswordManagerModal 
        isOpen={isPasswordManagerOpen}
        onClose={() => setIsPasswordManagerOpen(false)}
        currentUser={currentUser}
      />

      {/* 4. ✅ 新增：系統設定 (Wolf Only, 用來改雲端版號) */}
      <SystemSettingsModal 
        isOpen={isSystemSettingsOpen} 
        onClose={() => setIsSystemSettingsOpen(false)} 
        theme={{ card: 'bg-gray-800 border-gray-700', text: 'text-white', input: 'bg-gray-700 text-white border-gray-600' }} 
        currentSettings={{ appVersion: remoteVersion }} // 傳入目前的雲端版本
      />

      {/* 5. ✅ 新增：版本更新通知 (所有人) */}
      <UpdateNotification 
        show={showUpdateNotice} 
        remoteVersion={remoteVersion} 
        onRefresh={handleRefreshApp} 
      />

    </div>
  );
};

export default App;