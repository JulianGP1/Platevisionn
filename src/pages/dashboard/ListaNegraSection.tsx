import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Plus, Trash2, RefreshCw, X, Check, ShieldBan } from 'lucide-react';

interface Props {
  projectId: string;
  isDark: boolean;
  userRole?: string;                
  userPermisos?: Record<string, boolean>;
}

interface ListaNegra {
  id_lista: number;
  causa: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  vehiculos: { placa: string; dueno: string | null } | null;
}

interface VehiculoOpt {
  id_carro: number;
  placa: string;
}

interface FormState {
  id_vehiculo: string;
  causa: string;
  fecha_inicio: string;
  fecha_fin: string;
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Indefinido';
  return new Date(iso).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isActive(fin: string | null): boolean {
  if (!fin) return true;
  return new Date(fin) >= new Date();
}

export default function ListaNegraSection({ projectId, isDark, userRole, userPermisos }: Props) {
  const [lista, setLista] = useState<ListaNegra[]>([]);
  const [vehiculosOpt, setVehiculosOpt] = useState<VehiculoOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>({ id_vehiculo: '', causa: '', fecha_inicio: '', fecha_fin: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: listaData }, { data: vehicData }] = await Promise.all([
      supabase.from('lista_negra')
        .select('id_lista, causa, fecha_inicio, fecha_fin, vehiculos:id_vehiculo(placa, dueno)')
        .eq('id_proyecto', projectId)
        .order('id_lista', { ascending: false }),
      supabase.from('vehiculos')
        .select('id_carro, placa')
        .eq('id_proyecto', projectId)
        .order('placa', { ascending: true }),
    ]);
    setLista((listaData ?? []) as unknown as ListaNegra[]);
    setVehiculosOpt((vehicData ?? []) as VehiculoOpt[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.id_vehiculo) { setError('Selecciona un vehículo'); return; }
    setSaving(true);
    setError(null);
    const today = new Date().toISOString().split('T')[0];
    const { error: err } = await supabase.from('lista_negra').insert({
      id_proyecto: projectId,
      id_vehiculo: parseInt(form.id_vehiculo),
      causa: form.causa.trim() || null,
      fecha_inicio: form.fecha_inicio || today,
      fecha_fin: form.fecha_fin || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setForm({ id_vehiculo: '', causa: '', fecha_inicio: '', fecha_fin: '' });
    setShowAdd(false);
    load();
  };

  const handleDelete = async (id: number) => {
    await supabase.from('lista_negra').delete().eq('id_lista', id);
    setDeleteId(null);
    load();
  };

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
          {lista.filter(l => isActive(l.fecha_fin)).length} bloqueos activos
        </p>
        <button
          onClick={() => { setShowAdd(true); setError(null); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" />
          Bloquear vehículo
        </button>
      </div>

      {showAdd && (
        <div className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Agregar a lista negra</span>
            <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Vehículo *</label>
              <select
                value={form.id_vehiculo}
                onChange={e => setForm(p => ({ ...p, id_vehiculo: e.target.value }))}
                className={inp}>
                <option value="">Seleccionar vehículo...</option>
                {vehiculosOpt.map(v => (
                  <option key={v.id_carro} value={v.id_carro}>{v.placa}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Causa</label>
              <input value={form.causa} onChange={e => setForm(p => ({ ...p, causa: e.target.value }))}
                placeholder="Motivo del bloqueo" className={inp} />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Fecha inicio</label>
              <input type="date" value={form.fecha_inicio} onChange={e => setForm(p => ({ ...p, fecha_inicio: e.target.value }))}
                className={inp} />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Fecha fin <span className="opacity-60">(vacío = indefinido)</span>
              </label>
              <input type="date" value={form.fecha_fin} onChange={e => setForm(p => ({ ...p, fecha_fin: e.target.value }))}
                className={inp} />
            </div>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)}
              className={`px-4 py-2 rounded-lg text-sm ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500'}`}>
              Cancelar
            </button>
            <button onClick={handleAdd} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Bloquear
            </button>
          </div>
        </div>
      )}

      <div className={`${card} overflow-hidden`}>
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="w-5 h-5 text-red-400 animate-spin" />
          </div>
        ) : lista.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldBan className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <p className={`text-sm ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Sin vehículos bloqueados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Placa</th>
                  <th className={th}>Causa</th>
                  <th className={th}>Inicio</th>
                  <th className={th}>Fin</th>
                  <th className={th}>Estado</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-[#1e1e2a]' : 'divide-slate-100'}`}>
                {lista.map(l => {
                  const activo = isActive(l.fecha_fin);
                  return (
                    <tr key={l.id_lista} className={isDark ? 'hover:bg-[#0f1117]' : 'hover:bg-slate-50'}>
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-red-400 tracking-wider text-sm">
                          {l.vehiculos?.placa ?? '—'}
                        </span>
                      </td>
                      <td className={`py-3.5 px-4 text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        {l.causa ?? <span className="text-slate-500">—</span>}
                      </td>
                      <td className={`py-3.5 px-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {fmtDate(l.fecha_inicio)}
                      </td>
                      <td className={`py-3.5 px-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        {fmtDate(l.fecha_fin)}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                          ${activo ? 'bg-red-500/15 text-red-400' : 'bg-slate-500/15 text-slate-400'}`}>
                          {activo ? 'Bloqueado' : 'Expirado'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {deleteId === l.id_lista ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>¿Confirmar?</span>
                            <button onClick={() => handleDelete(l.id_lista)}
                              className="text-xs text-red-400 hover:text-red-300 font-medium">Eliminar</button>
                            <button onClick={() => setDeleteId(null)}
                              className={`text-xs ${isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400'}`}>
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteId(l.id_lista)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
