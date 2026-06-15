import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../ThemeContext';
import { supabase } from '../lib/supabaseClient';
import {
  LayoutDashboard, ClipboardList, Car, Camera, ShieldBan, Users,
  ChevronLeft, ChevronRight, LogOut, Menu, X, Sun, Moon, ArrowLeft,
} from 'lucide-react';

import OverviewSection from './dashboard/OverviewSection';
import RegistrosSection from './dashboard/RegistrosSection';
import VehiculosSection from './dashboard/VehiculosSection';
import CamarasSection from './dashboard/CamarasSection';
import MiembrosSection from './dashboard/MiembrosSection';
import ListaNegraSection from './dashboard/ListaNegraSection';

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = 'overview' | 'registros' | 'vehiculos' | 'camaras' | 'lista-negra' | 'miembros';

interface NavItem {
  id: Section;
  label: string;
  Icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview',    label: 'Resumen',     Icon: LayoutDashboard },
  { id: 'registros',   label: 'Registros',   Icon: ClipboardList   },
  { id: 'vehiculos',   label: 'Vehículos',   Icon: Car             },
  { id: 'camaras',     label: 'Cámaras LPR', Icon: Camera          },
  { id: 'lista-negra', label: 'Lista Negra', Icon: ShieldBan       },
  { id: 'miembros',    label: 'Miembros',    Icon: Users           },
];

const SECTION_TITLE: Record<Section, string> = {
  'overview':    'Resumen del Proyecto',
  'registros':   'Registros de Estadía',
  'vehiculos':   'Lista Blanca de Vehículos',
  'camaras':     'Cámaras LPR',
  'lista-negra': 'Lista Negra',
  'miembros':    'Miembros del Proyecto',
};



// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 overflow-hidden ${collapsed ? 'justify-center' : ''}`}>
      <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-emerald-500/20 border border-emerald-500/30
        flex items-center justify-center">
        <Camera className="w-4 h-4 text-emerald-400" />
      </div>
      {!collapsed && (
        <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
          Plate<span className="text-emerald-400">Vision</span>
        </span>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  activeSection: Section;
  isDark: boolean;
  projectName: string;
  onNavigate: (s: Section) => void;
  onCollapse: () => void;
  onLogout: () => void;
  onChangeProject: () => void;
  onToggleTheme: () => void;
}

function Sidebar({
  collapsed, activeSection, isDark, projectName,
  onNavigate, onCollapse, onLogout, onChangeProject, onToggleTheme,
}: SidebarProps) {
  const bg = isDark ? 'bg-[#0a0a0f] border-[#1e1e2a]' : 'bg-white border-slate-200';

  return (
    <aside className={`flex flex-col h-full border-r transition-all duration-300 ${bg}
      ${collapsed ? 'w-16' : 'w-60'}`}>

      {/* Header */}
      <div className={`flex items-center border-b px-4 h-16 flex-shrink-0 ${isDark ? 'border-[#1e1e2a]' : 'border-slate-200'}`}>
        <div className="flex-1 overflow-hidden">
          <Logo collapsed={collapsed} />
        </div>
        <button
          onClick={onCollapse}
          className={`hidden lg:flex ml-2 flex-shrink-0 w-6 h-6 rounded items-center justify-center transition-colors
            ${isDark ? 'text-slate-500 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}>
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Project name */}
      {!collapsed && (
        <div className={`px-4 py-3 border-b ${isDark ? 'border-[#1e1e2a]' : 'border-slate-200'}`}>
          <p className={`text-xs font-medium truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Proyecto</p>
          <p className={`text-sm font-semibold truncate mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {projectName || '—'}
          </p>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeSection === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              title={collapsed ? label : undefined}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150
                ${isActive
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : isDark
                    ? 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }
                ${collapsed ? 'justify-center' : ''}`}>
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-emerald-400' : ''}`} />
              {!collapsed && <span className="truncate">{label}</span>}
              {isActive && !collapsed && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`px-2 py-3 border-t space-y-0.5 ${isDark ? 'border-[#1e1e2a]' : 'border-slate-200'}`}>
        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          title={collapsed ? 'Cambiar tema' : undefined}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors
            ${collapsed ? 'justify-center' : ''}
            ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800/70' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
          {isDark ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
          {!collapsed && <span>{isDark ? 'Modo claro' : 'Modo oscuro'}</span>}
        </button>

        {/* Change project */}
        <button
          onClick={onChangeProject}
          title={collapsed ? 'Cambiar proyecto' : undefined}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors
            ${collapsed ? 'justify-center' : ''}
            ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800/70' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
          <ArrowLeft className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Cambiar proyecto</span>}
        </button>

        {/* Logout */}
        <button
          onClick={onLogout}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors
            ${collapsed ? 'justify-center' : ''}
            text-red-400 hover:bg-red-500/10`}>
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [userRole, setUserRole] = useState<string>('');
  const [userPermisos, setUserPermisos] = useState<Record<string, boolean>>({});
  const [section, setSection] = useState<Section>('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const projectId = localStorage.getItem('pv_project_id') ?? '';

  // Redirect if no project selected
  useEffect(() => {
    if (!projectId) navigate('/onboarding', { replace: true });
  }, [projectId, navigate]);

  // Fetch project name
  useEffect(() => {
    if (!projectId) return;
    supabase
      .from('proyectos')
      .select('nombre_proyecto')
      .eq('id_proyecto', projectId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProjectName((data as { nombre_proyecto: string }).nombre_proyecto);
      });
  }, [projectId]);

  useEffect(() => {
  if (!projectId || !user) return;
  supabase
    .from('miembros_proyecto')
    .select('rol, permisos')
    .eq('id_proyecto', projectId)
    .eq('id_usuario', user.id)
    .maybeSingle()
    .then(({ data }) => {
      if (data) {
        setUserRole((data as any).rol ?? '');
        const p = (data as any).permisos;
        setUserPermisos(typeof p === 'string' ? JSON.parse(p) : (p ?? {}));
      }
    });
}, [projectId, user]);
  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleChangeProject = () => {
    localStorage.removeItem('pv_project_id');
    navigate('/onboarding', { replace: true });
  };

  const handleNavigate = (s: Section) => {
    setSection(s);
    setMobileOpen(false);
  };

  if (!projectId) return null;

  const mainBg = isDark ? 'bg-[#0f1117]' : 'bg-[#F8FAFC]';
  const headerBg = isDark ? 'bg-[#0f1117]/80 border-[#1e1e2a]' : 'bg-white/80 border-slate-200';

  return (
    <div className={`flex h-screen overflow-hidden ${mainBg}`}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop fixed, mobile overlay */}
      <div className={`
        fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto
        transition-transform duration-300
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `} style={{ flexShrink: 0 }}>
        <Sidebar
          collapsed={collapsed}
          activeSection={section}
          isDark={isDark}
          projectName={projectName}
          onNavigate={handleNavigate}
          onCollapse={() => setCollapsed(c => !c)}
          onLogout={handleLogout}
          onChangeProject={handleChangeProject}
          onToggleTheme={toggleTheme}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className={`sticky top-0 z-30 backdrop-blur-xl border-b flex items-center h-16 px-4 gap-4 ${headerBg}`}>
          {/* Mobile hamburger */}
          <button
            className={`lg:hidden flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
              ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
            onClick={() => setMobileOpen(o => !o)}>
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {/* Section title */}
          <h1 className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
            {SECTION_TITLE[section]}
          </h1>

          <div className="ml-auto flex items-center gap-3">
            {/* User pill */}
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border
              ${isDark ? 'border-[#1e1e2a] text-slate-400' : 'border-slate-200 text-slate-600'}`}>
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30
                flex items-center justify-center text-emerald-400 font-bold text-[10px]">
                {(user?.email ?? 'U').charAt(0).toUpperCase()}
              </div>
              <span className="max-w-[140px] truncate">{user?.email}</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {section === 'overview'    && <OverviewSection    projectId={projectId} isDark={isDark} />}
          
          {section === 'registros' && (
            <RegistrosSection 
              projectId={projectId} 
              isDark={isDark} 
              userRole={userRole} 
              userPermisos={userPermisos} 
            />
          )}

          {section === 'vehiculos' && (
            <VehiculosSection 
              projectId={projectId} 
              isDark={isDark} 
              userRole={userRole} 
              userPermisos={userPermisos} 
            />
          )}

          {section === 'camaras' && (
            <CamarasSection 
              projectId={projectId} 
              isDark={isDark} 
              userRole={userRole} 
              userPermisos={userPermisos} 
            />
          )}

          {section === 'lista-negra' && (
            <ListaNegraSection 
              projectId={projectId} 
              isDark={isDark} 
              userRole={userRole} 
              userPermisos={userPermisos} 
            />
          )}

          {section === 'miembros' && (
            <MiembrosSection
              projectId={projectId}
              isDark={isDark}
              userRole={userRole}
              userPermisos={userPermisos}
            />
          )}

        </main>
      </div>
    </div>
  );
}
