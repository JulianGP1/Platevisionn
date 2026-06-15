import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Plus, RefreshCw, X, Check, Camera, Wifi, WifiOff } from 'lucide-react';

interface Props {
  projectId: string;
  isDark: boolean;
  userRole?: string;                  
  userPermisos?: Record<string, boolean>;
}

interface Camara {
  id_camara: number;
  nombre: string | null;
  ip: string | null;
  funcion: string | null;
  estado: string | null;
}

interface FormState {
  nombre: string;
  ip: string;
  funcion: 'ENTRADA' | 'SALIDA';
}

export default function CamarasSection({ projectId, isDark, userRole, userPermisos }: Props) {
  const [camaras, setCamaras] = useState<Camara[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>({ nombre: '', ip: '', funcion: 'ENTRADA' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('camara')
      .select('id_camara, nombre, ip, funcion, estado')
      .eq('id_proyecto', projectId)
      .order('id_camara', { ascending: true });
    setCamaras((data ?? []) as Camara[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('camara').insert({
      id_proyecto: projectId,
      nombre: form.nombre.trim(),
      ip: form.ip.trim() || null,
      funcion: form.funcion,
      estado: 'A',
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setForm({ nombre: '', ip: '', funcion: 'ENTRADA' });
    setShowAdd(false);
    load();
  };

  const toggleEstado = async (cam: Camara) => {
    const nuevoEstado = cam.estado === 'A' ? 'I' : 'A';
    await supabase.from('camara').update({ estado: nuevoEstado }).eq('id_camara', cam.id_camara);
    load();
  };

  const puedeGestionarCamaras = userRole === 'ADMIN' || userPermisos?.gestionar_camaras === true;

  

  const card = `rounded-xl border ${isDark ? 'bg-[#111118] border-[#1e1e2a]' : 'bg-white border-slate-200'}`;
  const inp = `w-full rounded-lg px-3 py-2 text-sm border outline-none transition-colors
    ${isDark
      ? 'bg-[#0f1117] border-[#1e1e2a] text-white placeholder-slate-600 focus:border-emerald-500/50'
      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-emerald-500/50'}`;

  const th = `text-xs uppercase font-medium pb-3 px-4 text-left
    ${isDark ? 'text-slate-500 border-b border-[#1e1e2a]' : 'text-slate-400 border-b border-slate-100'}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          {camaras.filter(c => c.estado === 'A').length} activas · {camaras.length} total
        </p>
        {puedeGestionarCamaras && (
    <button
      onClick={() => { setShowAdd(true); setError(null); }}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors">
      <Plus className="w-4 h-4" />
      Nueva cámara
    </button>
  )}
      </div>

      {showAdd && (
        <div className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Nueva cámara LPR</span>
            <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Nombre *</label>
              <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Entrada principal" className={inp} />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>IP / URL</label>
              <input value={form.ip} onChange={e => setForm(p => ({ ...p, ip: e.target.value }))}
                placeholder="192.168.1.100" className={inp} />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Función</label>
              <div className="flex rounded-lg overflow-hidden border border-[#1e1e2a]">
                {(['ENTRADA', 'SALIDA'] as const).map(f => (
                  <button key={f} onClick={() => setForm(p => ({ ...p, funcion: f }))}
                    className={`flex-1 py-2 text-xs font-medium transition-colors
                      ${form.funcion === f ? 'bg-emerald-500 text-white' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)}
              className={`px-4 py-2 rounded-lg text-sm ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500'}`}>
              Cancelar
            </button>
            <button onClick={handleAdd} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* Camera cards */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
        </div>
      ) : camaras.length === 0 ? (
        <div className={`${card} p-12 text-center`}>
          <Camera className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className={`text-sm ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Sin cámaras registradas</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className={`w-full rounded-xl border overflow-hidden ${isDark ? 'border-[#1e1e2a]' : 'border-slate-200'}`}>
            <thead>
              <tr className={isDark ? 'bg-[#111118]' : 'bg-white'}>
                <th className={th}>ID</th>
                <th className={th}>Nombre</th>
                <th className={th}>IP / URL</th>
                <th className={th}>Función</th>
                <th className={th}>Estado</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-[#1e1e2a] bg-[#111118]' : 'divide-slate-100 bg-white'}`}>
              {camaras.map(cam => (
                <tr key={cam.id_camara} className={isDark ? 'hover:bg-[#0f1117]' : 'hover:bg-slate-50'}>
                  <td className={`py-3.5 px-4 text-xs text-slate-500`}>#{cam.id_camara}</td>
                  <td className={`py-3.5 px-4 text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {cam.nombre ?? '—'}
                  </td>
                  <td className={`py-3.5 px-4 text-sm font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {cam.ip ?? '—'}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                      ${cam.funcion === 'ENTRADA' ? 'bg-blue-500/15 text-blue-400' : 'bg-orange-500/15 text-orange-400'}`}>
                      {cam.funcion ?? '—'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <button onClick={() => toggleEstado(cam)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                        ${cam.estado === 'A'
                          ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                          : 'bg-slate-500/15 text-slate-400 hover:bg-slate-500/25'}`}>
                      {cam.estado === 'A' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                      {cam.estado === 'A' ? 'Activa' : 'Inactiva'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
