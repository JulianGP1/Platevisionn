import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  Car, DoorOpen, DoorClosed, Camera, Clock, ListChecks, RefreshCw, TrendingUp,
} from 'lucide-react';

interface Props {
  projectId: string;
  isDark: boolean;
}

interface Metrics {
  adentro: number;
  entraronHoy: number;
  salieronHoy: number;
  camarasActivas: number;
  totalRegistros: number;
  promedioMinutos: number | null;
}

interface RegistroReciente {
  id_registro: number;
  placa_capturada: string;
  fecha_ingreso: string | null;
  fecha_salida: string | null;
  estado: string | null;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

function fmtHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

// SVG bar chart for hourly entries
function HourlyChart({ counts, isDark }: { counts: number[]; isDark: boolean }) {
  const max = Math.max(1, ...counts);
  const chartH = 80;
  const barW = 14;
  const gap = 4;
  const totalW = 24 * (barW + gap);

  return (
    <div className="overflow-x-auto">
      <svg width={totalW} height={chartH + 24} className="block mx-auto">
        {counts.map((v, h) => {
          const barH = Math.max(2, (v / max) * chartH);
          const x = h * (barW + gap);
          const y = chartH - barH;
          const isNow = h === new Date().getHours();
          return (
            <g key={h}>
              <rect
                x={x} y={y} width={barW} height={barH} rx={3}
                fill={isNow ? '#34d399' : isDark ? '#34d39960' : '#10b98160'}
              />
              {(h % 4 === 0) && (
                <text
                  x={x + barW / 2} y={chartH + 16}
                  textAnchor="middle" fontSize={9}
                  fill={isDark ? '#64748b' : '#94a3b8'}
                >
                  {String(h).padStart(2, '0')}h
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function OverviewSection({ projectId, isDark }: Props) {
  const [metrics, setMetrics] = useState<Metrics>({
    adentro: 0, entraronHoy: 0, salieronHoy: 0,
    camarasActivas: 0, totalRegistros: 0, promedioMinutos: null,
  });
  const [hourlyCounts, setHourlyCounts] = useState<number[]>(Array(24).fill(0));
  const [recientes, setRecientes] = useState<RegistroReciente[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const hoy = startOfToday();

    const [
      { count: adentro },
      { count: entraronHoy },
      { count: salieronHoy },
      { count: camarasActivas },
      { count: totalRegistros },
      { data: estadiasCompletas },
      { data: horasData },
      { data: recientesData },
    ] = await Promise.all([
      supabase.from('registros_estadia').select('*', { count: 'exact', head: true })
        .eq('id_proyecto', projectId).eq('estado', 'adentro'),
      supabase.from('registros_estadia').select('*', { count: 'exact', head: true })
        .eq('id_proyecto', projectId).gte('fecha_ingreso', hoy),
      supabase.from('registros_estadia').select('*', { count: 'exact', head: true })
        .eq('id_proyecto', projectId).eq('estado', 'afuera').gte('fecha_salida', hoy),
      supabase.from('camara').select('*', { count: 'exact', head: true })
        .eq('id_proyecto', projectId).eq('estado', 'A'),
      supabase.from('registros_estadia').select('*', { count: 'exact', head: true })
        .eq('id_proyecto', projectId),
      supabase.from('registros_estadia')
        .select('fecha_ingreso, fecha_salida')
        .eq('id_proyecto', projectId).eq('estado', 'afuera').not('fecha_salida', 'is', null),
      supabase.from('registros_estadia')
        .select('fecha_ingreso').eq('id_proyecto', projectId).gte('fecha_ingreso', hoy),
      supabase.from('registros_estadia')
        .select('id_registro, placa_capturada, fecha_ingreso, fecha_salida, estado')
        .eq('id_proyecto', projectId).order('fecha_ingreso', { ascending: false }).limit(8),
    ]);

    // Average stay in minutes
    let promedioMinutos: number | null = null;
    if (estadiasCompletas && estadiasCompletas.length > 0) {
      const total = estadiasCompletas.reduce((acc: number, r: { fecha_ingreso: string | null; fecha_salida: string | null }) => {
        if (!r.fecha_ingreso || !r.fecha_salida) return acc;
        return acc + (new Date(r.fecha_salida).getTime() - new Date(r.fecha_ingreso).getTime());
      }, 0);
      promedioMinutos = total / estadiasCompletas.length / 60000;
    }

    // Hourly counts
    const counts = Array(24).fill(0);
    (horasData ?? []).forEach((r: { fecha_ingreso: string | null }) => {
      if (r.fecha_ingreso) {
        const h = new Date(r.fecha_ingreso).getHours();
        counts[h]++;
      }
    });

    setMetrics({
      adentro: adentro ?? 0,
      entraronHoy: entraronHoy ?? 0,
      salieronHoy: salieronHoy ?? 0,
      camarasActivas: camarasActivas ?? 0,
      totalRegistros: totalRegistros ?? 0,
      promedioMinutos,
    });
    setHourlyCounts(counts);
    setRecientes((recientesData ?? []) as RegistroReciente[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const card = `rounded-xl p-5 border ${isDark ? 'bg-[#111118] border-[#1e1e2a]' : 'bg-white border-slate-200'}`;

  const statCards = [
    { label: 'Vehículos adentro', value: metrics.adentro, icon: Car, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Entraron hoy', value: metrics.entraronHoy, icon: DoorOpen, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Salieron hoy', value: metrics.salieronHoy, icon: DoorClosed, color: 'text-slate-400', bg: 'bg-slate-500/10' },
    { label: 'Cámaras activas', value: metrics.camarasActivas, icon: Camera, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Total registros', value: metrics.totalRegistros, icon: ListChecks, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    {
      label: 'Estadía promedio',
      value: metrics.promedioMinutos !== null ? fmtDuration(metrics.promedioMinutos) : '—',
      icon: Clock,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((s, i) => (
          <div key={i} className={card}>
            <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center mb-3`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {typeof s.value === 'number' ? s.value.toLocaleString('es-CO') : s.value}
            </p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Chart + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hourly chart */}
        <div className={`${card} lg:col-span-2`}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Ocupación por hora — hoy
            </span>
          </div>
          {hourlyCounts.every(c => c === 0) ? (
            <p className={`text-sm text-center py-10 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
              Sin registros hoy
            </p>
          ) : (
            <HourlyChart counts={hourlyCounts} isDark={isDark} />
          )}
        </div>

        {/* Recent entries */}
        <div className={card}>
          <div className="flex items-center gap-2 mb-4">
            <ListChecks className="w-4 h-4 text-emerald-400" />
            <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Actividad reciente
            </span>
          </div>
          <div className="space-y-2">
            {recientes.length === 0 && (
              <p className={`text-sm text-center py-6 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Sin actividad</p>
            )}
            {recientes.map(r => (
              <div key={r.id_registro}
                className={`flex items-center justify-between p-2.5 rounded-lg
                  ${isDark ? 'bg-[#0f1117]' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.estado === 'adentro' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                  <span className={`font-mono font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {r.placa_capturada}
                  </span>
                </div>
                <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {fmtHora(r.fecha_ingreso)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
