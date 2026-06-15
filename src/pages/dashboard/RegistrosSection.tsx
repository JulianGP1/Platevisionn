import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  projectId: string;
  isDark: boolean;
  userRole?: string;            
  userPermisos?: Record<string, boolean>;
}

interface Registro {
  id_registro: number;
  placa_capturada: string;
  fecha_ingreso: string | null;
  fecha_salida: string | null;
  estado: string | null;
  foto_entrada_url: string | null;
  foto_salida_url: string | null;
}

const PAGE_SIZE = 20;

function fmtDatetime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function calcDuration(entrada: string | null, salida: string | null): string {
  if (!entrada || !salida) return '—';
  const ms = new Date(salida).getTime() - new Date(entrada).getTime();
  if (ms < 0) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export default function RegistrosSection({ projectId, isDark, userRole, userPermisos }: Props) {
  const [rows, setRows] = useState<Registro[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState<'all' | 'adentro' | 'afuera'>('all');
  const [filterDate, setFilterDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('registros_estadia')
      .select('id_registro, placa_capturada, fecha_ingreso, fecha_salida, estado, foto_entrada_url, foto_salida_url', { count: 'exact' })
      .eq('id_proyecto', projectId)
      .order('fecha_ingreso', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (filterEstado !== 'all') q = q.eq('estado', filterEstado);
    if (filterDate) {
      const start = `${filterDate}T00:00:00`;
      const end = `${filterDate}T23:59:59`;
      q = q.gte('fecha_ingreso', start).lte('fecha_ingreso', end);
    }

    const { data, count } = await q;
    setRows((data ?? []) as Registro[]);
    setTotal(count ?? 0);
    setLoading(false);
  }, [projectId, page, filterEstado, filterDate]);

  useEffect(() => { setPage(0); }, [filterEstado, filterDate]);
  useEffect(() => { load(); }, [load]);

  const th = `text-xs uppercase font-medium pb-3 px-3 text-left
    ${isDark ? 'text-slate-500 border-b border-[#1e1e2a]' : 'text-slate-400 border-b border-slate-100'}`;

  const td = `py-3.5 px-3 text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-emerald-500/30">
          {(['all', 'adentro', 'afuera'] as const).map(v => (
            <button key={v}
              onClick={() => setFilterEstado(v)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors
                ${filterEstado === v
                  ? 'bg-emerald-500 text-white'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`}>
              {v === 'all' ? 'Todos' : v === 'adentro' ? 'Adentro' : 'Salidos'}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className={`rounded-lg px-3 py-1.5 text-xs border outline-none
            ${isDark
              ? 'bg-[#111118] border-[#1e1e2a] text-slate-300 focus:border-emerald-500/50'
              : 'bg-white border-slate-200 text-slate-700 focus:border-emerald-500/50'}`}
        />
        {filterDate && (
          <button onClick={() => setFilterDate('')}
            className="text-xs text-emerald-400 hover:text-emerald-300">
            Limpiar
          </button>
        )}
        <span className={`ml-auto text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          {total.toLocaleString('es-CO')} registros
        </span>
      </div>

      {/* Table */}
      <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-[#111118] border-[#1e1e2a]' : 'bg-white border-slate-200'}`}>
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>#</th>
                  <th className={th}>Placa</th>
                  <th className={th}>Ingreso</th>
                  <th className={th}>Salida</th>
                  <th className={th}>Duración</th>
                  <th className={th}>Estado</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-[#1e1e2a]' : 'divide-slate-100'}`}>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className={`text-center py-12 text-sm ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                      Sin registros
                    </td>
                  </tr>
                )}
                {rows.map(r => (
                  <tr key={r.id_registro} className={`transition-colors ${isDark ? 'hover:bg-[#0f1117]' : 'hover:bg-slate-50'}`}>
                    <td className={`${td} text-xs text-slate-500`}>#{r.id_registro}</td>
                    <td className={td}>
                      <span className="font-mono font-bold text-emerald-400 tracking-wider">{r.placa_capturada}</span>
                    </td>
                    <td className={`${td} text-xs`}>{fmtDatetime(r.fecha_ingreso)}</td>
                    <td className={`${td} text-xs`}>{fmtDatetime(r.fecha_salida)}</td>
                    <td className={`${td} text-xs font-medium`}>{calcDuration(r.fecha_ingreso, r.fecha_salida)}</td>
                    <td className={td}>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                        ${r.estado === 'adentro'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-slate-500/15 text-slate-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${r.estado === 'adentro' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                        {r.estado === 'adentro' ? 'Adentro' : 'Salido'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Página {page + 1} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className={`p-1.5 rounded-lg border text-sm transition-colors disabled:opacity-40
                ${isDark ? 'border-[#1e1e2a] text-slate-400 hover:border-emerald-500/40' : 'border-slate-200 text-slate-500 hover:border-emerald-500/40'}`}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className={`p-1.5 rounded-lg border text-sm transition-colors disabled:opacity-40
                ${isDark ? 'border-[#1e1e2a] text-slate-400 hover:border-emerald-500/40' : 'border-slate-200 text-slate-500 hover:border-emerald-500/40'}`}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
