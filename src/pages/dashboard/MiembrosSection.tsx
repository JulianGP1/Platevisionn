import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  RefreshCw, Users, Shield, User, UserPlus, Copy, Check,
  ChevronRight, ChevronLeft, X, Trash2, Mail, KeyRound,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  isDark: boolean;
  userRole?: string;
  userPermisos?: Record<string, boolean>;
}

interface Miembro {
  id_miembro: string;
  rol: string;
  created_at: string;
  id_usuario: string;
  permisos: Record<string, boolean>;
  profiles: { full_name: string | null; correo: string | null } | null;
}

interface Invitacion {
  id: string;
  email_invitado: string;
  token: string;
  permisos: Record<string, boolean>;
  estado: string;
  expires_at: string;
}

type InviteStep = 'email' | 'permisos' | 'token';

// ─── Permission catalogue ─────────────────────────────────────────────────────

const PERMISOS_CONFIG = [
  { key: 'renombrar_proyecto',    label: 'Renombrar el proyecto',            desc: 'Cambiar el nombre del proyecto' },
  { key: 'eliminar_proyecto',     label: 'Eliminar el proyecto',             desc: 'Borrar permanentemente el proyecto' },
  { key: 'invitar_usuarios',      label: 'Invitar usuarios',                 desc: 'Generar tokens de invitación para nuevos miembros' },
  { key: 'expulsar_miembro',      label: 'Expulsar miembros',                desc: 'Remover usuarios del proyecto' },
  { key: 'gestionar_camaras',     label: 'Gestionar cámaras LPR',           desc: 'Agregar, editar o eliminar cámaras' },
  { key: 'remover_lista_negra',   label: 'Remover de lista negra',          desc: 'Desbloquear vehículos bloqueados' },
  { key: 'corregir_placa',        label: 'Corregir placa manualmente',      desc: 'Editar placa capturada incorrectamente' },
  { key: 'eliminar_registros',    label: 'Eliminar registros incorrectos',  desc: 'Borrar registros de entrada/salida erróneos' },
  { key: 'registrar_salida_manual', label: 'Registrar salida manual',      desc: 'Registrar salida cuando el LPR falla' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0
        ${checked ? 'bg-emerald-500' : 'bg-slate-600'}`}>
      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform
        ${checked ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

interface InviteModalProps {
  isDark: boolean;
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function InviteModal({ isDark, projectId, onClose, onSuccess }: InviteModalProps) {
  const [step, setStep] = useState<InviteStep>('email');
  const [email, setEmail] = useState('');
  const [permisos, setPermisos] = useState<Record<string, boolean>>(
    Object.fromEntries(PERMISOS_CONFIG.map(p => [p.key, false]))
  );
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();
  const [validating, setValidating] = useState(false);

  const handleNextFromEmail = async () => {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) {
    setError('Ingresa un correo válido');
    return;
  }

   if (trimmed === user?.email) {
    setError('No puedes invitarte a ti mismo.');
    return;
  }

  setValidating(true);
  setError(null);

  const { data, error: dbError } = await supabase
    .from('profiles')
    .select('id')
    .eq('correo', trimmed)
    .maybeSingle();

  setValidating(false);

  if (dbError) {
    setError('Error al verificar el correo. Intenta de nuevo.');
    return;
  }

  if (!data) {
    setError('Este correo no está registrado en PlateVision. El usuario debe crear una cuenta primero.');
    return;
  }

  setStep('permisos');
};

  const handleGenerate = async () => {
    setSaving(true);
    setError(null);
    const newToken = generateToken();
    const { error: err } = await supabase.from('invitaciones').insert({
      id_proyecto: projectId,
      email_invitado: email.trim().toLowerCase(),
      token: newToken,
      permisos,
      rol: 'GUARDIA',
      estado: 'pendiente',
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setToken(newToken);
    setStep('token');
    onSuccess();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const overlay = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4';
  const modal = `w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden
    ${isDark ? 'bg-[#161b22] border-[#1e1e2a]' : 'bg-white border-slate-200'}`;
  const hdr = `flex items-center justify-between px-5 py-4 border-b
    ${isDark ? 'border-[#1e1e2a]' : 'border-slate-100'}`;
  const inp = `w-full rounded-lg px-3 py-2.5 text-sm border outline-none transition-colors
    ${isDark
      ? 'bg-[#0f1117] border-[#1e1e2a] text-white placeholder-slate-600 focus:border-emerald-500/50'
      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-emerald-500/50'}`;

  return (
    <div className={overlay}>
      <div className={modal}>
        {/* Header */}
        <div className={hdr}>
          <div className="flex items-center gap-2">
            {step !== 'email' && step !== 'token' && (
              <button onClick={() => { setStep('email'); setError(null); }}
                className={`p-1 rounded transition-colors ${isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}>
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {step === 'email' && 'Invitar miembro'}
              {step === 'permisos' && 'Configurar permisos'}
              {step === 'token' && 'Código generado'}
            </span>
          </div>
          <button onClick={onClose}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors
              ${isDark ? 'text-slate-500 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5">
          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-5">
            {(['email', 'permisos', 'token'] as InviteStep[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
                  ${step === s ? 'bg-emerald-500 text-white' :
                    (['email', 'permisos', 'token'].indexOf(step) > i) ? 'bg-emerald-500/20 text-emerald-400' :
                    isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>
                  {i + 1}
                </div>
                {i < 2 && <ChevronRight className={`w-3 h-3 ${isDark ? 'text-slate-700' : 'text-slate-300'}`} />}
              </div>
            ))}
            <span className={`text-xs ml-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {step === 'email' ? 'Correo del invitado' : step === 'permisos' ? 'Permisos del miembro' : 'Compartir código'}
            </span>
          </div>

          {/* Step: Email */}
          {step === 'email' && (
            <div className="space-y-4">
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Correo electrónico del miembro
                </label>
                <div className={`flex items-center gap-2 rounded-lg border px-3
                  ${isDark ? 'bg-[#0f1117] border-[#1e1e2a] focus-within:border-emerald-500/50' : 'bg-slate-50 border-slate-200 focus-within:border-emerald-500/50'}`}>
                  <Mail className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleNextFromEmail()}
                    placeholder="correo@ejemplo.com"
                    autoFocus
                    className={`flex-1 py-2.5 text-sm bg-transparent outline-none
                      ${isDark ? 'text-white placeholder-slate-600' : 'text-slate-900 placeholder-slate-400'}`}
                  />
                </div>
                <p className={`text-xs mt-1.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                  El código solo podrá ser usado con esta dirección de correo
                </p>
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          )}

          {/* Step: Permisos */}
          {step === 'permisos' && (
            <div className="space-y-3">
              <p className={`text-xs mb-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Activa los permisos que tendrá <span className="font-medium text-emerald-400">{email}</span>
              </p>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {PERMISOS_CONFIG.map(p => (
                  <div key={p.key}
                    className={`flex items-center justify-between p-3 rounded-lg
                      ${isDark ? 'bg-[#0f1117]' : 'bg-slate-50'}`}>
                    <div className="flex-1 pr-4">
                      <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>{p.label}</p>
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{p.desc}</p>
                    </div>
                    <Toggle checked={permisos[p.key]} onChange={v => setPermisos(prev => ({ ...prev, [p.key]: v }))} />
                  </div>
                ))}
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          )}

          {/* Step: Token generated */}
          {step === 'token' && (
            <div className="space-y-4">
              <div className={`rounded-xl p-4 border text-center ${isDark ? 'bg-[#0f1117] border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
                <p className={`text-xs font-medium mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Código de invitación generado
                </p>
                <p className="text-3xl font-mono font-bold tracking-widest text-emerald-400">
                  {token}
                </p>
                <p className={`text-xs mt-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  Válido por 7 días · Solo para {email}
                </p>
              </div>
              <button
                onClick={handleCopy}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-colors
                  ${copied
                    ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                    : isDark
                      ? 'border-[#1e1e2a] text-slate-300 hover:border-emerald-500/30 hover:text-emerald-400'
                      : 'border-slate-200 text-slate-600 hover:border-emerald-500/30 hover:text-emerald-600'}`}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? '¡Copiado!' : 'Copiar código'}
              </button>
              <p className={`text-xs text-center ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                Comparte este código con {email}. Lo necesitará para unirse en la sección "Unirse a proyecto".
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 px-5 py-4 border-t
          ${isDark ? 'border-[#1e1e2a]' : 'border-slate-100'}`}>
          {step === 'token' ? (
            <button onClick={onClose}
              className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors">
              Listo
            </button>
          ) : (
            <>
              <button onClick={step === 'email' ? onClose : () => setStep('email')}
                className={`px-4 py-2 rounded-lg text-sm transition-colors
                  ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`}>
                {step === 'email' ? 'Cancelar' : 'Atrás'}
              </button>
              {step === 'email' && (
                <button
                  onClick={handleNextFromEmail}
                  disabled={validating}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors disabled:opacity-60">
                  {validating
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <ChevronRight className="w-4 h-4" />}
                  {validating ? 'Verificando...' : 'Siguiente'}
                </button>
              )}
              {step === 'permisos' && (
                <button onClick={handleGenerate} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                  Generar código
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export default function MiembrosSection({ projectId, isDark, userRole, userPermisos }: Props) {
  const { user } = useAuth();
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [expelId, setExpelId] = useState<string | null>(null);
  const [expandedPermisos, setExpandedPermisos] = useState<string | null>(null);
  const [delInvId, setDelInvId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: proyData }, { data: membData }, { data: invData }] = await Promise.all([
      supabase.from('proyectos').select('creado_por').eq('id_proyecto', projectId).maybeSingle(),
      supabase.from('miembros_proyecto')
        .select('id_miembro, rol, created_at, id_usuario, permisos, profiles:id_usuario(full_name, correo)')
        .eq('id_proyecto', projectId)
        .order('created_at', { ascending: true }),
      supabase.from('invitaciones')
        .select('id, email_invitado, token, permisos, estado, expires_at')
        .eq('id_proyecto', projectId)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false }),
    ]);

    const createdBy = (proyData as { creado_por: string } | null)?.creado_por;
    setIsAdmin(createdBy === user?.id);
    setMiembros((membData ?? []) as unknown as Miembro[]);
    setInvitaciones((invData ?? []) as unknown as Invitacion[]);
    setLoading(false);
  }, [projectId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleExpel = async (idMiembro: string) => {
    await supabase.from('miembros_proyecto').delete().eq('id_miembro', idMiembro);
    setExpelId(null);
    load();
  };

  const handleDeleteInv = async (id: string) => {
    await supabase.from('invitaciones').delete().eq('id', id);
    setDelInvId(null);
    load();
  };

  const card = `rounded-xl border ${isDark ? 'bg-[#111118] border-[#1e1e2a]' : 'bg-white border-slate-200'}`;
  const th = `text-xs uppercase font-medium pb-3 px-4 text-left
    ${isDark ? 'text-slate-500 border-b border-[#1e1e2a]' : 'text-slate-400 border-b border-slate-100'}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <>
      {showInvite && (
        <InviteModal
          isDark={isDark}
          projectId={projectId}
          onClose={() => setShowInvite(false)}
          onSuccess={load}
        />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {miembros.length} miembro{miembros.length !== 1 ? 's' : ''}
            {isAdmin && ' · eres administrador'}
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors">
              <UserPlus className="w-4 h-4" />
              Invitar miembro
            </button>
          )}
        </div>

        {/* Members table */}
        <div className={`${card} overflow-hidden`}>
          {miembros.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <p className={`text-sm ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Sin miembros</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={th}>Miembro</th>
                    <th className={th}>Correo</th>
                    <th className={th}>Rol</th>
                    <th className={th}>Desde</th>
                    {isAdmin && <th className={th}>Permisos</th>}
                    {isAdmin && <th className={th}></th>}
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-[#1e1e2a]' : 'divide-slate-100'}`}>
                  {miembros.map(m => {
                    const nombre = m.profiles?.full_name ?? 'Sin nombre';
                    const correo = m.profiles?.correo ?? '—';
                    const esCreador = m.id_usuario === (miembros.find(x =>
                      // The project creator has rol from proyectos.creado_por
                      x.id_usuario === user?.id && isAdmin
                    )?.id_usuario);
                    const esAdmin = m.rol === 'ADMIN';
                    const activoPermisos = Object.values(m.permisos ?? {}).filter(Boolean).length;
                    const isExpanded = expandedPermisos === m.id_miembro;

                    return (
                      <>
                        <tr key={m.id_miembro} className={isDark ? 'hover:bg-[#0f1117]' : 'hover:bg-slate-50'}>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                                ${esAdmin ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                {nombre.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className={`text-sm font-medium block ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                  {nombre}
                                </span>
                                {m.id_usuario === user?.id && (
                                  <span className="text-[10px] text-emerald-400 font-medium">Tú</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className={`py-3.5 px-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            {correo}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                              ${esAdmin ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'}`}>
                              {esAdmin ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                              {m.rol}
                            </span>
                          </td>
                          <td className={`py-3.5 px-4 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {fmtDate(m.created_at)}
                          </td>
                          {isAdmin && (
                            <td className="py-3.5 px-4">
                              {esAdmin ? (
                                <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Todos</span>
                              ) : (
                                <button
                                  onClick={() => setExpandedPermisos(isExpanded ? null : m.id_miembro)}
                                  className={`text-xs flex items-center gap-1 transition-colors
                                    ${isDark ? 'text-slate-400 hover:text-emerald-400' : 'text-slate-500 hover:text-emerald-600'}`}>
                                  {activoPermisos} activos
                                  <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                </button>
                              )}
                            </td>
                          )}
                          {isAdmin && (
                            <td className="py-3.5 px-4 text-right">
                              {m.id_usuario !== user?.id && !esAdmin && (
                                expelId === m.id_miembro ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>¿Expulsar?</span>
                                    <button onClick={() => handleExpel(m.id_miembro)}
                                      className="text-xs text-red-400 hover:text-red-300 font-medium">Confirmar</button>
                                    <button onClick={() => setExpelId(null)}
                                      className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setExpelId(m.id_miembro)}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </td>
                          )}
                        </tr>

                        {/* Expanded permisos row */}
                        {isExpanded && isAdmin && (
                          <tr key={`${m.id_miembro}-permisos`} className={isDark ? 'bg-[#0a0a0f]' : 'bg-slate-50'}>
                            <td colSpan={6} className="px-4 py-3">
                              <div className="flex flex-wrap gap-2 ml-11">
                                {PERMISOS_CONFIG.map(p => (
                                  <span key={p.key}
                                    className={`text-xs px-2 py-0.5 rounded-full
                                      ${m.permisos?.[p.key]
                                        ? 'bg-emerald-500/15 text-emerald-400'
                                        : isDark ? 'bg-slate-800 text-slate-600' : 'bg-slate-200 text-slate-400'}`}>
                                    {p.label}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pending invitations (admin only) */}
        {isAdmin && invitaciones.length > 0 && (
          <div>
            <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Invitaciones pendientes
            </h3>
            <div className={`${card} overflow-hidden`}>
              <div className="divide-y divide-inherit">
                {invitaciones.map(inv => (
                  <div key={inv.id}
                    className={`flex flex-wrap items-center gap-3 px-4 py-3
                      ${isDark ? 'divide-[#1e1e2a]' : 'divide-slate-100'}`}>
                    <Mail className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                    <span className={`text-sm flex-1 min-w-0 truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {inv.email_invitado}
                    </span>
                    <span className={`font-mono text-sm font-bold text-emerald-400 tracking-widest`}>
                      {inv.token}
                    </span>
                    <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      Expira {fmtDate(inv.expires_at)}
                    </span>
                    {delInvId === inv.id ? (
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleDeleteInv(inv.id)}
                          className="text-xs text-red-400 hover:text-red-300 font-medium">Revocar</button>
                        <button onClick={() => setDelInvId(null)}
                          className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No</button>
                      </div>
                    ) : (
                      <button onClick={() => setDelInvId(inv.id)}
                        className={`text-xs transition-colors ${isDark ? 'text-slate-500 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}>
                        Revocar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}


