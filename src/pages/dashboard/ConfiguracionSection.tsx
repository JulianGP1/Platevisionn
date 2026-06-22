import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  Copy, Check, Download, Trash2, Sun, Moon, RefreshCw,
  FolderOpen, KeyRound, Package, X, AlertTriangle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  isDark: boolean;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onDeleteProject: () => void;
  onToggleTheme: () => void;
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteModal({
  isDark,
  projectName,
  onConfirm,
  onClose,
}: {
  isDark: boolean;
  projectName: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const match = input.trim() === projectName.trim();

  const handleConfirm = async () => {
    if (!match) return;
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  };

  const overlay = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4';
  const modal = `w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden
    ${isDark ? 'bg-[#161b22] border-[#1e1e2a]' : 'bg-white border-slate-200'}`;

  return (
    <div className={overlay}>
      <div className={modal}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b
          ${isDark ? 'border-[#1e1e2a]' : 'border-slate-100'}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Eliminar proyecto
            </span>
          </div>
          <button onClick={onClose}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors
              ${isDark ? 'text-slate-500 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Esta acción es <span className="text-red-400 font-semibold">permanente e irreversible</span>.
            Se eliminarán todos los registros, cámaras, miembros e invitaciones del proyecto.
          </p>
          <div className={`rounded-lg px-3 py-2.5 border text-sm font-mono
            ${isDark ? 'bg-[#0f1117] border-[#1e1e2a] text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
            {projectName}
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Escribe el nombre del proyecto para confirmar
            </label>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={projectName}
              autoFocus
              className={`w-full rounded-lg px-3 py-2.5 text-sm border outline-none transition-colors
                ${isDark
                  ? 'bg-[#0f1117] border-[#1e1e2a] text-white placeholder-slate-600 focus:border-red-500/50'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-red-400/50'}`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-end gap-3 px-5 py-4 border-t
          ${isDark ? 'border-[#1e1e2a]' : 'border-slate-100'}`}>
          <button onClick={onClose}
            className={`px-4 py-2 rounded-lg text-sm transition-colors
              ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-800'}`}>
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!match || deleting}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600
              text-white text-sm font-medium transition-colors disabled:opacity-40">
            {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Eliminar proyecto
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ isDark, children }: { isDark: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-5
      ${isDark ? 'bg-[#111118] border-[#1e1e2a]' : 'bg-white border-slate-200'}`}>
      {children}
    </div>
  );
}

function CardTitle({ isDark, icon: Icon, label }: { isDark: boolean; icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-4 h-4 text-emerald-400" />
      <h2 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>{label}</h2>
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export default function ConfiguracionSection({
  projectId,
  isDark,
  projectName,
  onProjectNameChange,
  onDeleteProject,
  onToggleTheme,
}: Props) {
  const [nameInput, setNameInput] = useState(projectName);
  const [savingName, setSavingName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // ── Rename project ──────────────────────────────────────────────────────────
  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === projectName) return;
    setSavingName(true);
    const { error } = await supabase
      .from('proyectos')
      .update({ nombre_proyecto: trimmed })
      .eq('id_proyecto', projectId);
    setSavingName(false);
    if (!error) {
      onProjectNameChange(trimmed);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 2000);
    }
  };

  // ── Copy project ID ─────────────────────────────────────────────────────────
  const handleCopyId = () => {
    navigator.clipboard.writeText(projectId).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    });
  };

  // ── Delete project ──────────────────────────────────────────────────────────
  const handleDelete = async () => {
    await supabase.from('proyectos').delete().eq('id_proyecto', projectId);
    onDeleteProject();
  };

  // ── Download module ─────────────────────────────────────────────────────────
  const MODULE_URL = 'https://hmamdfurohwodzbdgpnl.supabase.co/storage/v1/object/public/moduloLPR/moduloLPR.zip';

  const inp = `w-full rounded-lg px-3 py-2.5 text-sm border outline-none transition-colors
    ${isDark
      ? 'bg-[#0f1117] border-[#1e1e2a] text-white placeholder-slate-600 focus:border-emerald-500/50'
      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-emerald-500/50'}`;

  return (
    <>
      {showDelete && (
        <DeleteModal
          isDark={isDark}
          projectName={projectName}
          onConfirm={handleDelete}
          onClose={() => setShowDelete(false)}
        />
      )}

      <div className="max-w-2xl mx-auto space-y-5">

        {/* ── Nombre del proyecto ─────────────────────────────────────────── */}
        <Card isDark={isDark}>
          <CardTitle isDark={isDark} icon={FolderOpen} label="Nombre del proyecto" />
          <div className="flex gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveName()}
              className={inp}
            />
            <button
              onClick={handleSaveName}
              disabled={savingName || !nameInput.trim() || nameInput.trim() === projectName}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600
                text-white text-sm font-medium transition-colors disabled:opacity-40 flex-shrink-0">
              {savingName
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : nameSuccess
                  ? <Check className="w-3.5 h-3.5" />
                  : null}
              {nameSuccess ? 'Guardado' : 'Guardar'}
            </button>
          </div>
        </Card>

        {/* ── ID del proyecto ─────────────────────────────────────────────── */}
        <Card isDark={isDark}>
          <CardTitle isDark={isDark} icon={KeyRound} label="ID del proyecto" />
          <p className={`text-xs mb-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Necesitas este ID para configurar el archivo <span className="font-mono text-emerald-400">.env</span> del módulo LPR local.
          </p>
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5
            ${isDark ? 'bg-[#0f1117] border-[#1e1e2a]' : 'bg-slate-50 border-slate-200'}`}>
            <span className={`flex-1 text-sm font-mono truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {projectId}
            </span>
            <button
              onClick={handleCopyId}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors flex-shrink-0
                ${copiedId
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : isDark
                    ? 'bg-slate-800 text-slate-400 hover:text-white'
                    : 'bg-slate-200 text-slate-600 hover:text-slate-900'}`}>
              {copiedId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedId ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <div className={`mt-3 rounded-lg border px-3 py-2.5 space-y-1
            ${isDark ? 'bg-[#0a0a0f] border-[#1e1e2a]' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`text-xs font-medium mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Variables para tu <span className="font-mono">.env</span>
            </p>
            {[
              { key: 'SUPABASE_URL', value: import.meta.env.VITE_SUPABASE_URL },
              { key: 'SUPABASE_KEY', value: 'clave dada' },
              { key: 'ID_PROYECTO',   value: projectId },
            ].map(({ key, value }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs font-mono text-emerald-400 flex-shrink-0">{key}=</span>
                <span className={`text-xs font-mono truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {key === 'PROJECT_ID' ? projectId : value}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Módulo LPR ─────────────────────────────────────────────────── */}
        <Card isDark={isDark}>
          <CardTitle isDark={isDark} icon={Package} label="Módulo LPR local" />
          <p className={`text-xs mb-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Descarga el módulo Python que ejecuta el reconocimiento de placas en tu equipo local.
            Incluye el script principal, dependencias y un <span className="font-mono text-emerald-400">.env.example</span> preconfigurado.
          </p>
          <a
            href={MODULE_URL}
            download
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600
              text-white text-sm font-medium transition-colors">
            <Download className="w-4 h-4" />
            Descargar módulo (.zip)
          </a>
          <p className={`text-xs mt-3 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
            Requiere Python 3.9+, CUDA opcional para GPU. Consulta el <span className="font-mono">README.md</span> incluido.
          </p>
        </Card>

        {/* ── Apariencia ──────────────────────────────────────────────────── */}
        <Card isDark={isDark}>
          <CardTitle isDark={isDark} icon={isDark ? Sun : Moon} label="Apariencia" />
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {isDark ? 'Modo oscuro activo' : 'Modo claro activo'}
              </p>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                La preferencia se guarda en este dispositivo
              </p>
            </div>
            <button
              onClick={onToggleTheme}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors
                ${isDark
                  ? 'border-[#1e1e2a] text-slate-300 hover:border-emerald-500/30 hover:text-emerald-400'
                  : 'border-slate-200 text-slate-600 hover:border-emerald-500/30 hover:text-emerald-600'}`}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {isDark ? 'Cambiar a claro' : 'Cambiar a oscuro'}
            </button>
          </div>
        </Card>

        {/* ── Zona de peligro ─────────────────────────────────────────────── */}
        <div className={`rounded-xl border p-5 ${isDark ? 'bg-[#111118] border-red-500/20' : 'bg-white border-red-200'}`}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h2 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Zona de peligro</h2>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Eliminar proyecto
              </p>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Borra permanentemente todos los datos, miembros, cámaras y registros.
              </p>
            </div>
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-500/30
                text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors flex-shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
