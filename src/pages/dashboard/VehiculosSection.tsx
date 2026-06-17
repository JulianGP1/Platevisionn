import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Plus, Trash2, Search, RefreshCw, X, Check, ShieldAlert } from 'lucide-react';

interface Props {
  projectId: string;
  isDark: boolean;
  userRole?: string;                  
  userPermisos?: Record<string, boolean>;
}

interface Vehiculo {
  id_carro: number;
  placa: string;
  dueno: string | null;
}

interface FormState {
  placa: string;
  dueno: string;
}

export default function VehiculosSection({ projectId, isDark, userRole, userPermisos }: Props) {
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormState>({ placa: '', dueno: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // 🔐 VALIDACIÓN DE PERMISOS EN FRONTEND (Corregido a MAYÚSCULAS para alinearse con la BD)
  const puedeGestionar = userRole?.toUpperCase() === 'ADMIN' || userPermisos?.gestionar_camaras === true;

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vehiculos')
      .select('id_carro, placa, dueno')
      .eq('id_proyecto', projectId)
      .order('id_carro', { ascending: false });
    setVehiculos((data ?? []) as Vehiculo[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const filtered = vehiculos.filter(v =>
    v.placa.toUpperCase().includes(search.toUpperCase()) ||
    (v.dueno ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async () => {
    if (!puedeGestionar) {
      setError('No tienes permisos para registrar vehículos en este proyecto.');
      return;
    }

    const placa = form.placa.trim().toUpperCase();
    if (!placa) { setError('La placa es requerida'); return; }
    setSaving(true);
    setError(null);
    
    const { error: err } = await supabase
      .from('vehiculos')
      .insert({ id_proyecto: projectId, placa, dueno: form.dueno.trim() || null });
    
    setSaving(false);
    if (err) { setError(err.message); return; }
    setForm({ placa: '', dueno: '' });
    setShowAdd(false);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!puedeGestionar) return; 
    await supabase.from('vehiculos').delete().eq('id_carro', id);
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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border flex-1 min-w-[200px]
          ${isDark ? 'bg-[#111118] border-[#1e1e2a]' : 'bg-white border-slate-200'}`}>
          <Search className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por placa o dueño..."
            className={`bg-transparent outline-none text-sm w-full ${isDark ? 'text-white placeholder-slate-600' : 'text-slate-900 placeholder-slate-400'}`}
          />
        </div>
        
        {/* El botón de agregar solo aparece si tiene permisos reales */}
        {puedeGestionar && (
          <button
            onClick={() => { setShowAdd(true); setError(null); setForm({ placa: '', dueno: '' }); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" />
            Agregar vehículo
          </button>
        )}
      </div>

      {/* Advertencia visual si es un usuario sin permisos */}
      {!puedeGestionar && (
        <div className="flex items-center gap-2 p-3 text-xs rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span>Modo lectura: No tienes permisos para modificar la lista de vehículos de este proyecto.</span>
        </div>
      )}

      {/* Add form */}
      {showAdd && puedeGestionar && (
        <div className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Nuevo vehículo</span>
            <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Placa *
              </label>
              <input
                value={form.placa}
                onChange={e => setForm(p => ({ ...p, placa: e.target.value.toUpperCase() }))}
                placeholder="ABC123"
                className={inp}
              />
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Dueño (opcional)
              </label>
              <input
                value={form.dueno}
                onChange={e => setForm(p => ({ ...p, dueno: e.target.value }))}
                placeholder="Nombre del propietario"
                className={inp}
              />
            </div>
          </div>
          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <X className="w-3.5 h-3.5" /> {error}
            </p>
          )}
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setShowAdd(false)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors
                ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`}>
              Cancelar
            </button>
            <button
              onClick={handleAdd} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600
                text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className={`${card} overflow-hidden`}>
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>ID</th>
                  <th className={th}>Placa</th>
                  <th className={th}>Dueño</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-[#1e1e2a]' : 'divide-slate-100'}`}>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className={`text-center py-12 text-sm ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                      Sin vehículos registrados
                    </td>
                  </tr>
                )}
                {filtered.map(v => (
                  <tr key={v.id_carro} className={`transition-colors ${isDark ? 'hover:bg-[#0f1117]' : 'hover:bg-slate-50'}`}>
                    <td className={`py-3.5 px-4 text-xs text-slate-500`}>#{v.id_carro}</td>
                    <td className={`py-3.5 px-4`}>
                      <span className="font-mono font-bold text-emerald-400 tracking-wider text-sm">{v.placa}</span>
                    </td>
                    <td className={`py-3.5 px-4 text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {v.dueno ?? <span className="text-slate-500">—</span>}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {/* Oculta los controles de eliminación si el miembro actual no tiene permisos */}
                      {puedeGestionar && (
                        deleteId === v.id_carro ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>¿Confirmar?</span>
                            <button onClick={() => handleDelete(v.id_carro)}
                              className="text-xs text-red-400 hover:text-red-300 font-medium">Eliminar</button>
                            <button onClick={() => setDeleteId(null)}
                              className={`text-xs ${isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}>
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteId(v.id_carro)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}