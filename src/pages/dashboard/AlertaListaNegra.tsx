import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient'; // Ajusta la ruta a tu cliente de Supabase
import { ShieldAlert } from 'lucide-react';
interface AlertaProps {
  projectId: string;
  isDark: boolean;
}

interface AlertaEstado {
  visible: boolean;
  placa: string;
  causa: string;
}

export default function AlertaListaNegra({ projectId, isDark }: AlertaProps) {
  const [alerta, setAlerta] = useState<AlertaEstado | null>(null);

  // Función para ir a comprobar a Supabase si la placa está reportada
  const comprobarListaNegra = async (placa: string) => {
    const today = new Date().toISOString().split('T')[0];

    // 1. Buscamos el carro en el proyecto para obtener su ID
    const { data: vehiculo } = await supabase
      .from('vehiculos')
      .select('id_carro')
      .eq('placa', placa)
      .eq('id_proyecto', projectId)
      .maybeSingle();

    if (!vehiculo) return { estaBloqueado: false, causa: '' };

    // 2. Buscamos si ese ID de vehículo está registrado en la lista negra
    const { data: listaNegra } = await supabase
      .from('lista_negra')
      .select('causa, fecha_fin')
      .eq('id_proyecto', projectId)
      .eq('id_vehiculo', vehiculo.id_carro);

    if (!listaNegra || listaNegra.length === 0) return { estaBloqueado: false, causa: '' };

    // 3. Revisamos si el bloqueo está vigente hoy
    const bloqueoVigente = listaNegra.find((b) => {
      if (!b.fecha_fin) return true; // Si está vacío es indefinido (activo)
      return new Date(b.fecha_fin) >= new Date(today);
    });

    return {
      estaBloqueado: !!bloqueoVigente,
      causa: bloqueoVigente?.causa || 'Motivo no especificado',
    };
  };

// 2. Este useEffect es el que "ESCUCHA" en tiempo real a Supabase constantemente
  useEffect(() => {
    if (!projectId) return;

    // Modificamos el nombre del canal y añadimos la configuración explícita para el schema 'platevision'
    const canalRealtime = supabase
      .channel('realtime-cambios-lpr') 
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'platevision', // 👈 Forzamos a escuchar tu esquema personalizado
          table: 'registros_estadia' 
        },
        async (payload) => {
          const nuevoRegistro = payload.new;
          const placa = nuevoRegistro.placa_capturada;

          if (!placa) return;

          console.log("🚗 ¡Detectada nueva placa en tiempo real!:", placa);

          // En cuanto Python inserta, corremos la comprobación
          const resultado = await comprobarListaNegra(placa);

          if (resultado.estaBloqueado) {
            setAlerta({
              visible: true,
              placa: placa,
              causa: resultado.causa,
            });
          }
        }
      )
      .subscribe((status) => {
        console.log("Estado de conexión Realtime LPR:", status);
      });

    return () => {
      supabase.removeChannel(canalRealtime);
    };
  }, [projectId]);

  // Si no hay ninguna alerta activa, el componente no dibuja nada en pantalla
  if (!alerta?.visible) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] animate-fade-in">
      <div className={`p-8 rounded-2xl max-w-md w-full border-2 border-red-500 text-center shadow-2xl ${isDark ? 'bg-[#111118]' : 'bg-white'}`}>
        
       {/* Icono animado minimalista */}
        <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
        <ShieldAlert className="w-8 h-8" />
        </div>
        
        <h2 className="text-2xl font-black text-red-500 tracking-wide uppercase">¡Vehículo Bloqueado!</h2>
        <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Se ha detectado un vehículo de la lista negra en los accesos.
        </p>
        
        {/* Caja de la placa */}
        <div className="my-6 p-4 bg-red-500/5 rounded-xl border border-red-500/20 font-mono">
          <span className="text-3xl font-extrabold tracking-widest text-red-400 block">
            {alerta.placa}
          </span>
          <span className={`text-xs block mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <strong>Motivo:</strong> {alerta.causa}
          </span>
        </div>

        {/* Botones solicitados (Sin afectar nada por ahora) */}
        <div className="flex gap-3 mt-6">
          <button 
            onClick={() => setAlerta(null)} // Cierra la advertencia
            className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-colors ${
              isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Ignorar Alarma
          </button>
          
          <button 
            onClick={() => setAlerta(null)} // Cierra la advertencia sin ejecutar lógicas pesadas aún
            className="flex-1 py-3 px-4 rounded-xl text-sm font-medium bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 transition-colors"
          >
            Bloquear Acceso
          </button>
        </div>

      </div>
    </div>
  );
}