import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../ThemeContext';
import { supabase } from '../lib/supabaseClient';
import {
  LogOut,
  Plus,
  Users,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  Building2,
  Loader2,
  ArrowRight,
  Sparkles,
  Shield,
  Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id_proyecto: string;
  nombre_proyecto: string;
  plan_id: string;
  created_at: string;
  rol: string;
}

type Mode =
  | 'loading'
  | 'zero-initial'
  | 'create-plan'
  | 'create-name'
  | 'join'
  | 'select-project';

const PLANS = [
  {
    id: 'free',
    name: 'Starter',
    price: 'Gratis',
    icon: Zap,
    colorClass: 'from-slate-500 to-slate-600',
    features: ['Hasta 2 cámaras', '500 registros/mes', 'Lista blanca básica'],
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49 / mes',
    icon: Sparkles,
    colorClass: 'from-blue-500 to-blue-700',
    features: ['Hasta 10 cámaras', '5.000 registros/mes', 'Pico y placa + lista negra'],
    highlighted: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$149 / mes',
    icon: Shield,
    colorClass: 'from-violet-500 to-violet-700',
    features: ['Cámaras ilimitadas', 'Registros ilimitados', 'API + soporte prioritario'],
    highlighted: false,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { user, logout } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('loading');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('free');
  const [projectName, setProjectName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // 1. Buscamos todas las membresías del usuario
      const { data, error: fetchError } = await supabase
        .from('miembros_proyecto')
        .select(`
          rol,
          proyectos (
            id_proyecto,
            nombre_proyecto,
            plan_id,
            created_at
          )
        `)
        .eq('id_usuario', user.id);

      if (fetchError) {
        console.error("Error cargando proyectos:", fetchError);
        setMode('zero-initial');
        return;
      }

      // 2. Mapeamos los datos de manera ultra segura controlando arreglos u objetos
      const parsed: Project[] = ((data ?? []) as any[])
        .map((row) => {
          // Supabase a veces anida el objeto en un array según la config de la FK
          const p = Array.isArray(row.proyectos) ? row.proyectos[0] : row.proyectos;
          if (!p) return null;
          
          return {
            id_proyecto: p.id_proyecto,
            nombre_proyecto: p.nombre_proyecto,
            plan_id: p.plan_id,
            created_at: p.created_at,
            rol: row.rol // Extraemos el rol de la tabla miembros_proyecto
          } as Project;
        })
        .filter((x): x is Project => x !== null);

      // 3. Establecemos la vista correcta según los proyectos encontrados
      if (parsed.length === 0) {
        setMode('zero-initial');
      } else {
        setProjects(parsed);
        setMode('select-project');
      }
    })();
  }, [user, navigate]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setError('Ingresa un nombre para el proyecto');
      return;
    }
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      // 1. Perfil limpio (Supabase ya sabe que va a platevision)
      await supabase
        .from('profiles')
        .upsert({ 
          id: user.id, 
          full_name: user.user_metadata?.full_name ?? '', 
          correo: user.email ?? '' 
        });

      // 2. Creación del proyecto limpia
      const { data: proj, error: projErr } = await supabase
        .from('proyectos')
        .insert({ 
          nombre_proyecto: projectName.trim(), 
          plan_id: selectedPlan, 
          creado_por: user.id 
        })
        .select('id_proyecto')
        .maybeSingle();

      if (projErr || !proj) {
        setError(projErr?.message ?? 'Error creando proyecto');
        return;
      }

      // Add creator as ADMIN member with all permissions enabled
      const todosLosPermisos = {
        renombrar_proyecto: true,
        eliminar_proyecto: true,
        invitar_usuarios: true,
        expulsar_miembro: true,
        gestionar_camaras: true,
        remover_lista_negra: true,
        corregir_placa: true,
        eliminar_registros: true,
        registrar_salida_manual: true,
      };
      await supabase.from('miembros_proyecto').insert({
        id_proyecto: proj.id_proyecto,
        id_usuario: user.id,
        rol: 'ADMIN',
        permisos: todosLosPermisos,
      });

      localStorage.setItem('pv_project_id', proj.id_proyecto);
      navigate('/dashboard', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const handleJoinProject = async () => {
    const token = joinCode.trim().toUpperCase();
    if (!token || token.length < 6) {
      setError('Ingresa el código de invitación que te compartió el administrador');
      return;
    }
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      // Query invitation by token — RLS only shows it if email matches JWT
      const { data: inv, error: invErr } = await supabase
        .from('invitaciones')
        .select('id, id_proyecto, email_invitado, permisos, rol, estado')
        .eq('token', token)
        .eq('estado', 'pendiente')
        .maybeSingle();

      // Después de que inv sea null/error, verificar si ya es miembro del proyecto
if (invErr || !inv) {
  // Buscar la invitación sin filtrar por estado, para saber si ya fue usada
  const { data: invUsada } = await supabase
    .from('invitaciones')
    .select('id_proyecto, estado')
    .eq('token', token)
    .maybeSingle();

  if (invUsada?.estado === 'usado') {
    // Verificar si ya es miembro
    const { data: yaEsMiembro } = await supabase
      .from('miembros_proyecto')
      .select('id_proyecto')
      .eq('id_proyecto', invUsada.id_proyecto)
      .eq('id_usuario', user.id)
      .maybeSingle();

    if (yaEsMiembro) {
      // Ya es miembro, simplemente entrar al proyecto
      enterProject(invUsada.id_proyecto);
      return;
    }
  }

  setError('Código inválido, ya fue usado, o no está dirigido a tu correo.');
  return;
}

      const invitacion = inv as {
        id: string;
        id_proyecto: string;
        email_invitado: string;
        permisos: Record<string, boolean>;
        rol: string;
        estado: string;
      };

      // Double-check email on client side
      if (invitacion.email_invitado.toLowerCase() !== (user.email ?? '').toLowerCase()) {
        setError('Este código de invitación no corresponde a tu correo electrónico.');
        return;
      }

      // Ensure profile exists
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: user.user_metadata?.full_name ?? '',
        correo: user.email ?? '',
      });

      // Add user as project member with the configured permissions
      const { error: memberErr } = await supabase.from('miembros_proyecto').insert({
        id_proyecto: invitacion.id_proyecto,
        id_usuario: user.id,
        rol: invitacion.rol,
        permisos: invitacion.permisos,
      });

      if (memberErr) {
        if (memberErr.message.includes('duplicate') || memberErr.message.includes('unique')) {
          setError('Ya eres miembro de este proyecto.');
        } else {
          setError(memberErr.message);
        }
        return;
      }

      // Mark invitation as used
      await supabase.from('invitaciones').update({ estado: 'usado' }).eq('id', invitacion.id);

      localStorage.setItem('pv_project_id', invitacion.id_proyecto);
      navigate('/dashboard', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const enterProject = (id: string) => {
    localStorage.setItem('pv_project_id', id);
    navigate('/dashboard', { replace: true });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const goBack = () => {
    setError(null);
    if (mode === 'create-plan') setMode('zero-initial');
    else if (mode === 'create-name') setMode('create-plan');
    else if (mode === 'join') setMode('zero-initial');
    else if (mode === 'select-project') setMode('zero-initial');
  };
  // ─── Derived ───────────────────────────────────────────────────────────────

  const displayName = (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Usuario';
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? '')
    .join('');

  const bg = isDark ? 'bg-[#0f1117]' : 'bg-[#F0F4F8]';
  const surface = isDark
    ? 'bg-zinc-900/70 border border-white/8 backdrop-blur-xl'
    : 'bg-white border border-slate-200';
  const cardShadow = isDark
    ? '0 8px 32px rgba(0,0,0,0.4)'
    : '0 8px 32px rgba(0,0,0,0.06)';
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-500';

  // ─── Content renderer ──────────────────────────────────────────────────────

  const renderContent = () => {
    if (mode === 'loading') {
      return (
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-accent-light animate-spin" />
          <span className={textSub}>Cargando tus proyectos...</span>
        </div>
      );
    }

    if (mode === 'zero-initial') {
      return (
        <div className="w-full max-w-2xl">
          <div className="text-center mb-10">
            <h1 className={`text-2xl sm:text-3xl font-semibold tracking-tight ${textMain}`}>
              Bienvenido a{' '}
              <span className="text-accent-light">PlateVision</span>
            </h1>
            <p className={`mt-2 text-sm font-light ${textSub}`}>
              Comienza configurando tu primer proyecto de reconocimiento de matrículas
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => { setError(null); setMode('create-plan'); }}
              className={`group relative p-7 rounded-2xl text-left transition-all duration-200 hover:-translate-y-0.5 ${surface} hover:border-accent/30`}
              style={{ boxShadow: cardShadow }}
            >
              <div className="w-11 h-11 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-5">
                <Plus className="w-5 h-5 text-accent-light" />
              </div>
              <h2 className={`text-lg font-semibold ${textMain}`}>Crear un proyecto</h2>
              <p className={`mt-1.5 text-sm font-light leading-relaxed ${textSub}`}>
                Configura un nuevo espacio con cámaras, vehículos y control de acceso.
              </p>
              <div className="flex items-center gap-1.5 mt-5 text-accent-light text-sm">
                <span>Comenzar</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </button>

            <button
              onClick={() => { setError(null); setMode('join'); }}
              className={`group relative p-7 rounded-2xl text-left transition-all duration-200 hover:-translate-y-0.5 ${surface} hover:border-accent/30`}
              style={{ boxShadow: cardShadow }}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
                <Users className={`w-5 h-5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`} />
              </div>
              <h2 className={`text-lg font-semibold ${textMain}`}>Unirse a un proyecto</h2>
              <p className={`mt-1.5 text-sm font-light leading-relaxed ${textSub}`}>
                Ingresa el código de acceso que te compartió el administrador del proyecto.
              </p>
              <div className={`flex items-center gap-1.5 mt-5 text-sm ${textSub}`}>
                <span>Ingresar código</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          </div>
        </div>
      );
    }

    if (mode === 'create-plan') {
      return (
        <div className="w-full max-w-3xl">
          <div className="flex items-center gap-3 mb-8">
            <button
              onClick={goBack}
              className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/8 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <p className={`text-xs uppercase tracking-widest font-mono ${textSub}`}>Paso 1 de 2</p>
              <h1 className={`text-xl font-semibold ${textMain}`}>Elige tu plan</h1>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {PLANS.map((plan) => {
              const Icon = plan.icon;
              const active = selectedPlan === plan.id;
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`relative p-6 rounded-2xl text-left transition-all duration-200 ${
                    active
                      ? isDark
                        ? 'border border-accent/50 bg-accent/8'
                        : 'border border-accent/40 bg-accent/5'
                      : surface
                  }`}
                  style={{ boxShadow: active ? (isDark ? '0 0 0 1px rgba(99,102,241,0.3)' : '0 0 0 1px rgba(99,102,241,0.2)') : cardShadow }}
                >
                  {plan.highlighted && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-accent-light text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      Popular
                    </span>
                  )}
                  {active && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-accent-light flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${plan.colorClass} flex items-center justify-center mb-4`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <p className={`text-base font-semibold ${textMain}`}>{plan.name}</p>
                  <p className={`text-sm font-medium mt-0.5 ${active ? 'text-accent-light' : textSub}`}>
                    {plan.price}
                  </p>
                  <ul className="mt-4 space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className={`flex items-start gap-2 text-xs ${textSub}`}>
                        <div className="w-1 h-1 rounded-full bg-current mt-1.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setMode('create-name')}
            className="btn-primary flex items-center gap-2"
          >
            Siguiente
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      );
    }

    if (mode === 'create-name') {
      return (
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <button
              onClick={goBack}
              className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/8 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <p className={`text-xs uppercase tracking-widest font-mono ${textSub}`}>Paso 2 de 2</p>
              <h1 className={`text-xl font-semibold ${textMain}`}>Nombra tu proyecto</h1>
            </div>
          </div>

          <div className={`rounded-2xl p-6 ${surface}`} style={{ boxShadow: cardShadow }}>
            <label className={`block text-xs font-medium mb-2 ${textSub}`}>
              Nombre del proyecto
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && handleCreateProject()}
              placeholder="ej. Universidad Nacional, Conjunto Los Pinos..."
              autoFocus
              className={`w-full px-4 py-3 rounded-lg text-sm outline-none transition-all duration-200 ${
                isDark
                  ? 'bg-surface border border-surface-border text-white placeholder:text-slate-600 focus:border-accent/50'
                  : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-accent/50'
              }`}
            />
            <p className={`mt-2 text-xs ${textSub}`}>
              Plan seleccionado:{' '}
              <span className="font-medium">
                {PLANS.find((p) => p.id === selectedPlan)?.name}
              </span>
            </p>

            {error && (
              <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}
          </div>

          <button
            onClick={handleCreateProject}
            disabled={busy}
            className="btn-primary flex items-center gap-2 mt-5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Crear proyecto
          </button>
        </div>
      );
    }

    if (mode === 'join') {
      return (
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8">
            <button
              onClick={goBack}
              className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/8 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className={`text-xl font-semibold ${textMain}`}>Unirse a un proyecto</h1>
          </div>

          <div className={`rounded-2xl p-6 ${surface}`} style={{ boxShadow: cardShadow }}>
            <label className={`block text-xs font-medium mb-2 ${textSub}`}>
              Código de invitación
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && !busy && handleJoinProject()}
              placeholder="AB3KXYZ9"
              autoFocus
              maxLength={8}
              className={`w-full px-4 py-3 rounded-lg text-sm font-mono tracking-widest uppercase outline-none transition-all duration-200 ${
                isDark
                  ? 'bg-surface border border-surface-border text-white placeholder:text-slate-600 focus:border-accent/50'
                  : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-accent/50'
              }`}
            />
            <p className={`mt-2 text-xs ${textSub}`}>
              Ingresa el código de 8 caracteres que el administrador del proyecto generó para ti.
              Solo funciona con tu correo <span className="font-medium">{user?.email}</span>.
            </p>

            {error && (
              <div className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}
          </div>

          <button
            onClick={handleJoinProject}
            disabled={busy}
            className="btn-primary flex items-center gap-2 mt-5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            Unirse
          </button>
        </div>
      );
    }

    if (mode === 'select-project') {
      return (
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <h1 className={`text-2xl font-semibold tracking-tight ${textMain}`}>Tus proyectos</h1>
            <p className={`mt-1.5 text-sm font-light ${textSub}`}>
              Selecciona el proyecto al que deseas ingresar
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {projects.map((p) => (
              <button
                key={p.id_proyecto}
                onClick={() => enterProject(p.id_proyecto)}
                className={`group p-5 rounded-2xl text-left transition-all duration-200 hover:-translate-y-0.5 ${surface} hover:border-accent/30`}
                style={{ boxShadow: cardShadow }}
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-accent-light" />
                  </div>
                  <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ${isDark ? 'bg-white/5 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>
                    {p.rol}
                  </span>
                </div>
                <p className={`mt-3 font-semibold text-sm ${textMain}`}>{p.nombre_proyecto}</p>
                <p className={`text-xs mt-0.5 capitalize ${textSub}`}>Plan {p.plan_id}</p>
                <div className="flex items-center gap-1 mt-4 text-accent-light text-xs">
                  <span>Entrar</span>
                  <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={() => { setError(null); setMode('zero-initial'); }}
            className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border transition-colors ${
              isDark
                ? 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5'
                : 'border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Crear o unirse a otro proyecto
          </button>
        </div>
      );
    }

    return null;
  };

  // ─── Layout ────────────────────────────────────────────────────────────────

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${bg}`}>
      {isDark && (
        <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-[0.08] pointer-events-none" />
      )}

      {/* Top navbar */}
      <header
        className={`relative z-20 flex-none flex items-center justify-between px-6 h-14 border-b ${
          isDark
            ? 'border-white/6 bg-[#0f1117]/60 backdrop-blur-xl'
            : 'border-slate-200 bg-white/70 backdrop-blur-xl'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center" />
          <span className={`text-base font-bold tracking-tight ${textMain}`}>
            Plate<span className="text-accent-light">Vision</span>
          </span>
        </div>

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileMenuOpen((v) => !v)}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-colors ${
              isDark ? 'hover:bg-white/6' : 'hover:bg-slate-100'
            }`}
          >
            <div className="w-7 h-7 rounded-full bg-accent-light flex items-center justify-center text-white text-xs font-semibold select-none">
              {initials || '?'}
            </div>
            <span className={`hidden sm:block text-sm max-w-[140px] truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {displayName}
            </span>
            <svg
              className={`w-3.5 h-3.5 transition-transform ${profileMenuOpen ? 'rotate-180' : ''} ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {profileMenuOpen && (
            <div
              className={`absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden z-50 ${
                isDark ? 'bg-zinc-900 border border-white/10' : 'bg-white border border-slate-200'
              }`}
              style={{ boxShadow: isDark ? '0 16px 40px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.1)' }}
            >
              <div className={`px-4 py-3 border-b ${isDark ? 'border-white/6' : 'border-slate-100'}`}>
                <p className={`text-xs font-medium truncate ${textMain}`}>{displayName}</p>
                <p className={`text-xs truncate mt-0.5 ${textSub}`}>{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                  isDark ? 'text-red-400 hover:bg-red-500/10' : 'text-red-500 hover:bg-red-50'
                }`}
              >
                <LogOut className="w-3.5 h-3.5" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-8 overflow-auto">
        {renderContent()}
      </main>
    </div>
  );
}
