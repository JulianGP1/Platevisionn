import { useState, type FormEvent } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../ThemeContext';
import { Eye, EyeOff, ChevronRight, AlertCircle } from 'lucide-react';

export default function RegisterPage() {
  const { isDark } = useTheme();
  const { user, register } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  if (user) {
    return <Navigate to="/onboarding" replace />;
  }

  const validate = (): string | null => {
    if (!fullName.trim()) return 'El nombre completo es obligatorio';
    if (!email.trim()) return 'El correo es obligatorio';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Correo invalido';
    if (!password) return 'La contrasena es obligatoria';
    if (password.length < 6) return 'La contrasena debe tener al menos 6 caracteres';
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const { error: err } = await register(email, password, fullName);
      if (err) {
        setError(
          err.includes('already registered')
            ? 'Este correo ya esta registrado'
            : err
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass = `w-full px-4 py-3 rounded-lg text-sm outline-none transition-all duration-200 ${
    isDark
      ? 'bg-surface border border-surface-border text-white placeholder:text-slate-600 focus:border-accent/50'
      : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-accent/50'
  }`;
  

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 py-12 ${isDark ? 'bg-[#0f1117]' : 'bg-[#F0F4F8]'}`}>
      <div className={`absolute inset-0 ${isDark ? 'bg-grid-pattern' : 'bg-grid-pattern-light'} bg-grid ${isDark ? 'opacity-[0.15]' : 'opacity-[0.10]'}`} />

      <div className="relative z-10 w-full max-w-md">
        <div className={`rounded-2xl overflow-hidden backdrop-blur-xl ${
          isDark
            ? 'bg-surface-raised/80 border border-surface-border'
            : 'bg-white/80 border border-slate-200'
        }`}
          style={{
            boxShadow: isDark
              ? '0 20px 60px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.4)'
              : '0 20px 60px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.04)',
          }}
        >
          <div className="px-6 pt-6 pb-4 text-center border-b border-slate-200 dark:border-surface-border">
            <Link to="/" className="inline-flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
                {/* Replace this div content with your custom logo icon */}
              </div>
              <span className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Plate<span className="text-accent-light">Vision</span>
                <span className={`${isDark ? 'text-slate-500' : 'text-slate-400'} font-medium ml-1.5`}>LPR</span>
              </span>
            </Link>
            <h1 className={`text-2xl font-semibold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Crea tu cuenta
            </h1>
            <p className={`mt-2 text-sm font-light ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
              Comienza con el reconocimiento de matriculas
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Nombre completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Juan Perez"
                className={inputClass}
              />
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Correo electronico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Contrasena
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                  className={`${inputClass} !pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-600 hover:text-slate-400' : 'text-slate-400 hover:text-slate-600'} transition-colors`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 !mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Crear cuenta
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="px-0 py-4 text-center border-t border-slate-200 dark:border-surface-border">
              <p className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                Ya tienes cuenta?{' '}
                <Link to="/login" className="text-accent-light hover:underline">
                  Inicia sesion aqui
                </Link>
              </p>
            </div>
          </form>
        </div>

        <p className={`text-center text-xs mt-6 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
          <Link to="/" className="hover:text-accent-light transition-colors">
            Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}