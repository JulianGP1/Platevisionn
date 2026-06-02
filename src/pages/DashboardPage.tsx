import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../ThemeContext';
import { Link } from 'react-router-dom';
import { ScanLine, LogOut, Monitor, Activity, Car, Cpu } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function DashboardPage() {
  const { isDark } = useTheme();
  const { user, logout } = useAuth();

  const [historial, setHistorial] = useState<any[]>([]);

  //  PARA EVITAR DUPLICADOS
  const ultimaPlacaGuardada = useRef<string>("");

  //  FUNCIÓN PARA GUARDAR EN SUPABASE
  const registrarVehiculo = async (placa: string, dueno: string) => {
    const { error } = await supabase
      .from('vehiculos')
      .insert(
        [{ placa, dueno }],
       );

    if (error) {
      console.error("Error guardando:", error.message);
    } else {
      console.log("Vehículo guardado :", placa);
    }
  };

  //  CONEXIÓN CON FLASK + GUARDADO
  useEffect(() => {
    const consultarPython = async () => {
      try {
        const respuesta = await fetch('http://localhost:5000/api/detecciones');
        const datos = await respuesta.json();

        setHistorial(datos);

        //  GUARDAR SOLO LA ÚLTIMA PLACA
        if (datos.length > 0) {
          const placa = datos[0].placa;

          if (placa && placa !== ultimaPlacaGuardada.current) {
            await registrarVehiculo(placa, "Desconocido");
            ultimaPlacaGuardada.current = placa;
          }
        }

      } catch (error) {
        console.error("Error al conectar con la IA:", error);
      }
    };

    consultarPython();
    const intervalo = setInterval(consultarPython, 1000);

    return () => clearInterval(intervalo);
  }, []);

  const ultimaDeteccion = historial[0];

  const stats = [
    { label: 'Camaras activas', value: '1', icon: Monitor },
    { label: 'Detecciones hoy', value: historial.length.toString(), icon: Activity },
    { label: 'Vehículos registrados', value: historial.length.toString(), icon: Car },
    { 
      label: 'Precisión promedio', 
      value: ultimaDeteccion ? `${ultimaDeteccion.precision_ocr}%` : '--', 
      icon: Cpu 
    },
  ];

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0f1117]' : 'bg-[#F8FAFC]'}`}>
      
      {/* HEADER */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl border-b ${isDark ? 'bg-[#0f1117]/80 border-surface-border' : 'bg-white/80 border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <ScanLine className={`w-7 h-7 ${isDark ? 'text-accent-light' : 'text-slate-800'}`} />
            <span className={`text-base font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Vision<span className="text-accent-light">G</span>
              <span className={`${isDark ? 'text-slate-500' : 'text-slate-400'} font-medium ml-1.5`}>LPR</span>
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              {user?.email}
            </span>

            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-200 border border-transparent hover:border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              <LogOut className="w-4 h-4" />
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        <h1 className={`text-2xl font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Dashboard
        </h1>
        <p className={`mt-1 text-sm font-light ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
          Bienvenido a tu panel de control
        </p>

        {/* STATS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {stats.map((stat, i) => (
            <div key={i} className={`rounded-xl p-5 border ${isDark ? 'bg-surface-raised border-surface-border' : 'bg-white border-slate-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-accent/8 border border-accent/15 flex items-center justify-center">
                  <stat.icon className="w-4 h-4 text-accent-light" />
                </div>
                <span className="text-xs text-slate-500">{stat.label}</span>
              </div>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">

          {/* CAMARA */}
          <div className={`rounded-xl p-6 border ${isDark ? 'bg-surface-raised border-surface-border' : 'bg-white border-slate-200'}`}>
            <h2 className="text-base font-medium mb-4">Cámara en Vivo</h2>
            <img src="http://localhost:5000/video_feed" className="w-full rounded-lg" />
          </div>

          {/* ULTIMA DETECCION */}
          <div className={`rounded-xl p-6 border ${isDark ? 'bg-surface-raised border-surface-border' : 'bg-white border-slate-200'}`}>
            <h2 className="text-base font-medium mb-4">Última Detección</h2>

            {ultimaDeteccion ? (
              <div className="space-y-4">
                <img src={ultimaDeteccion.foto} className="rounded-lg" />

                <div className="text-center text-2xl font-mono font-bold text-accent-light">
                  {ultimaDeteccion.placa}
                </div>

                <div className="text-xs text-slate-400">
                  <p>Hora: {ultimaDeteccion.hora}</p>
                  <p>OCR: {ultimaDeteccion.precision_ocr}%</p>
                  <p>YOLO: {ultimaDeteccion.precision_yolo}%</p>
                </div>
              </div>
            ) : (
              <p className="text-center text-slate-500">Esperando vehículos...</p>
            )}
          </div>

          {/* TABLA */}
          <div className={`rounded-xl p-6 border lg:col-span-3 ${isDark ? 'bg-surface-raised border-surface-border' : 'bg-white border-slate-200'}`}>
            <h2 className="text-base font-medium mb-4">Historial</h2>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b">
                  <th>ID</th>
                  <th>Hora</th>
                  <th>Placa</th>
                  <th className="text-right">OCR</th>
                </tr>
              </thead>

              <tbody>
                {historial.map((item) => (
                  <tr key={item.id}>
                    <td>#{item.id}</td>
                    <td>{item.hora}</td>
                    <td className="font-bold text-accent-light">{item.placa}</td>
                    <td className="text-right">{item.precision_ocr}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </main>
    </div>
  );
}