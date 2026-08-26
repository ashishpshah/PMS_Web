import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { LayoutDashboard, Mail, Lock, User, Eye, EyeOff, Phone, ArrowLeft, KeyRound } from 'lucide-react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSweetAlert } from '../context/SweetAlertContext';
import { useData } from '../context/DataContext';
import { showError, showSuccess } from '../lib/toast';
import { validateName, validateEmail, validateContact, PASSWORD_STRENGTH_REGEX } from '../lib/validation';
import { useAvailability, type AvailabilityState } from '../hooks/useAvailability';
import { apiRequest } from '../lib/api';

// ── types ─────────────────────────────────────────────────────────────────────

type AuthView = 'login' | 'register' | 'register-otp' | 'forgot' | 'reset-otp';

// ── OTP input ─────────────────────────────────────────────────────────────────

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, '').split('').slice(0, 6);

  const handleChange = (i: number, char: string) => {
    const d = char.replace(/\D/g, '').slice(0, 1);
    const next = [...digits];
    next[i] = d;
    onChange(next.join('').trimEnd());
    if (d && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = [...digits]; next[i] = ''; onChange(next.join('').trimEnd());
      } else if (i > 0) {
        refs.current[i - 1]?.focus();
      }
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted);
    refs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2.5">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] ?? ''}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="w-11 h-12 text-center text-xl font-black bg-gray-50 dark:bg-gray-950 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all text-gray-900 dark:text-white"
        />
      ))}
    </div>
  );
}

// ── availability hint ─────────────────────────────────────────────────────────

function AuthAvailabilityHint({ state, label }: { state: AvailabilityState; label: string }) {
  if (state === 'idle') return null;
  const text =
    state === 'checking' ? `Checking ${label}…` :
    state === 'available' ? `✓ ${label} is available` :
    `✕ ${label} is already taken`;
  const color = state === 'available' ? 'text-emerald-500' : state === 'taken' ? 'text-red-500' : 'text-gray-400';
  return <p className={`text-[10px] normal-case tracking-normal ml-1 mt-1 ${color}`}>{text}</p>;
}

// ── shared field style ────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-medium text-gray-900 dark:text-white placeholder-gray-400';
const LABEL_CLS = 'block text-[10px] ml-1 font-bold uppercase tracking-widest text-gray-400';

// ── main component ────────────────────────────────────────────────────────────

export default function Auth() {
  const [view, setView] = useState<AuthView>('login');

  // login
  const [showPassword, setShowPassword]   = useState(false);
  const [loginError, setLoginError]       = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting]   = useState(false);

  // register step 1
  const [regEmail, setRegEmail]         = useState('');
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName]   = useState('');
  const [regContact, setRegContact]     = useState('');
  const [regPassword, setRegPassword]   = useState('');
  const [showRegPwd, setShowRegPwd]     = useState(false);

  // register/reset OTP step
  const [otpValue, setOtpValue]         = useState('');
  const [pendingEmail, setPendingEmail] = useState('');

  // resend cooldown
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // reset password step
  const [newPassword, setNewPassword] = useState('');
  const [showNewPwd, setShowNewPwd]   = useState(false);

  const navigate = useNavigate();
  const { login, register, user } = useAuth();
  const { showAlert } = useSweetAlert();
  const { refreshData } = useData();

  const regEmailAvail = useAvailability(regEmail, { field: 'email', enabled: view === 'register' && !validateEmail(regEmail) });

  const startResendCooldown = useCallback(() => {
    setResendCooldown(60);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(resendTimerRef.current!); resendTimerRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    setLoginError(null);
    setOtpValue('');
    setShowPassword(false);
    setShowRegPwd(false);
    setShowNewPwd(false);
    setResendCooldown(0);
    if (resendTimerRef.current) { clearInterval(resendTimerRef.current); resendTimerRef.current = null; }
  }, [view]);

  useEffect(() => () => { if (resendTimerRef.current) clearInterval(resendTimerRef.current); }, []);

  if (user) return <Navigate to="/" replace />;

  // ── handlers ──

  const goBack = (target: AuthView) => setView(target);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const identifier = (fd.get('identifier') as string ?? '').trim();
    const password   = fd.get('password') as string ?? '';
    setLoginError(null);
    if (!identifier) { setLoginError('Enter your email or mobile number'); return; }
    if (password.length < 6) { setLoginError('Password must be at least 6 characters'); return; }
    setIsSubmitting(true);
    try {
      await login(identifier, password);
      navigate('/');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Invalid credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInitiateRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const firstErr = validateName(regFirstName, 'First name');
    if (firstErr) { showAlert(firstErr, 'error'); return; }
    const lastErr = validateName(regLastName, 'Last name');
    if (lastErr) { showAlert(lastErr, 'error'); return; }
    const emailErr = validateEmail(regEmail);
    if (emailErr) { showAlert(emailErr, 'error'); return; }
    if (regEmailAvail === 'taken') { showAlert('This email is already registered.', 'error'); return; }
    const contactErr = validateContact(regContact);
    if (contactErr) { showAlert(contactErr, 'error'); return; }
    if (regPassword.length < 6) { showAlert('Password must be at least 6 characters', 'error'); return; }
    if (!PASSWORD_STRENGTH_REGEX.test(regPassword)) {
      showAlert('Password must contain at least one uppercase letter, one lowercase letter, and one number', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest('/auth/register/initiate', {
        method: 'POST',
        body: JSON.stringify({ firstName: regFirstName, lastName: regLastName, email: regEmail, contactNo: regContact || undefined, password: regPassword }),
      });
      setPendingEmail(regEmail);
      setView('register-otp');
      startResendCooldown();
      showSuccess('OTP sent to your email address.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to send OTP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpValue.length < 6) { showError('Enter the 6-digit code.'); return; }
    setIsSubmitting(true);
    try {
      await apiRequest('/auth/register/confirm', {
        method: 'POST',
        body: JSON.stringify({ email: pendingEmail, otpCode: otpValue }),
      });
      // Log in directly after verification
      await login(pendingEmail, regPassword);
      await refreshData();
      navigate('/');
      showSuccess('Account created successfully!');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = (fd.get('forgotEmail') as string ?? '').trim();
    const emailErr = validateEmail(email);
    if (emailErr) { showError(emailErr); return; }
    setIsSubmitting(true);
    try {
      await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setPendingEmail(email);
      setView('reset-otp');
      startResendCooldown();
      showSuccess('If that email is registered, a reset code has been sent.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpValue.length < 6) { showError('Enter the 6-digit code.'); return; }
    if (newPassword.length < 6) { showError('Password must be at least 6 characters.'); return; }
    if (!PASSWORD_STRENGTH_REGEX.test(newPassword)) {
      showError('Password must contain at least one uppercase, one lowercase, and one number.');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiRequest<boolean>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: pendingEmail, otpCode: otpValue, newPassword }),
      });
      showSuccess('Password reset successfully. Please log in.');
      setView('login');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async (purpose: 'register' | 'reset') => {
    setIsSubmitting(true);
    try {
      if (purpose === 'register') {
        await apiRequest('/auth/register/initiate', {
          method: 'POST',
          body: JSON.stringify({ firstName: regFirstName, lastName: regLastName, email: pendingEmail, contactNo: regContact || undefined, password: regPassword, forceResend: true }),
        });
      } else {
        await apiRequest('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: pendingEmail, forceResend: true }),
        });
      }
      setOtpValue('');
      startResendCooldown();
      showSuccess('A new code has been sent.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to resend.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── branding ──

  const brand = (
    <div className="mb-10 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 mb-6">
        <LayoutDashboard size={28} />
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 mb-1">Padhya Software Technologies</p>
      <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white uppercase italic leading-none">
        Project Management System — <span className="text-indigo-600">PMS</span>
      </h1>
    </div>
  );

  const card = (children: React.ReactNode) => (
    <Card className="border-none shadow-2xl shadow-indigo-500/5 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl ring-1 ring-gray-100 dark:ring-gray-800">
      <CardContent className="p-8 sm:p-10">{children}</CardContent>
    </Card>
  );

  // ── views ──

  if (view === 'login') return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6 transition-colors font-sans">
      <div className="w-full max-w-md">
        {brand}
        {card(
          <form className="space-y-6 text-left" onSubmit={handleLogin}>
            <div className="space-y-1.5">
              <label className={LABEL_CLS}>Email or Mobile No <span className="text-red-500">*</span></label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="text" name="identifier" placeholder="Enter email or mobile" autoComplete="email" tabIndex={1} className={INPUT_CLS} />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center ml-1">
                <label className={LABEL_CLS}>Password <span className="text-red-500">*</span></label>
                <button type="button" tabIndex={4} onClick={() => setView('forgot')} className="text-[10px] font-bold text-indigo-600 hover:underline uppercase tracking-widest">
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Enter password"
                  autoComplete="current-password"
                  tabIndex={2}
                  className={INPUT_CLS + ' pr-12'}
                />
                <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-500 transition-colors">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {loginError && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400 font-medium">
                <span className="shrink-0">⚠</span>{loginError}
              </div>
            )}

            <Button type="submit" disabled={isSubmitting} tabIndex={3} className="w-full py-4 font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-600/20 active:scale-[0.98] transition-transform">
              {isSubmitting ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        )}
        <div className="mt-8 text-center">
          <button onClick={() => setView('register')} className="text-[11px] font-bold text-gray-500 hover:text-indigo-600 transition-colors uppercase tracking-widest">
            New User? <span className="text-indigo-600 underline underline-offset-4">Register from here</span>
          </button>
        </div>
        <p className="mt-10 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-gray-300 dark:text-gray-600">
          Advanced Project Architecture &copy; 2026
        </p>
      </div>
    </div>
  );

  if (view === 'register') return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6 transition-colors font-sans">
      <div className="w-full max-w-md">
        {brand}
        {card(
          <form className="space-y-5 text-left" onSubmit={handleInitiateRegister}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={LABEL_CLS}>First Name <span className="text-red-500">*</span></label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input type="text" placeholder="John" autoComplete="given-name" value={regFirstName} onChange={e => setRegFirstName(e.target.value)} className={INPUT_CLS} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={LABEL_CLS}>Last Name <span className="text-red-500">*</span></label>
                <input type="text" placeholder="Doe" autoComplete="family-name" value={regLastName} onChange={e => setRegLastName(e.target.value)} className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-medium text-gray-900 dark:text-white placeholder-gray-400" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={LABEL_CLS}>Email Address <span className="text-red-500">*</span></label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="email" placeholder="Enter your email" autoComplete="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} className={INPUT_CLS} />
              </div>
              <AuthAvailabilityHint state={regEmailAvail} label="Email" />
            </div>

            <div className="space-y-1.5">
              <label className={LABEL_CLS}>Contact Number <span className="opacity-60 normal-case tracking-normal">(optional)</span></label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="tel" placeholder="+1 234 567 8900" autoComplete="tel" value={regContact} onChange={e => setRegContact(e.target.value)} className={INPUT_CLS} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={LABEL_CLS}>Password <span className="text-red-500">*</span></label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type={showRegPwd ? 'text' : 'password'} placeholder="Min 6 chars, A–Z, a–z, 0–9" autoComplete="new-password" value={regPassword} onChange={e => setRegPassword(e.target.value)} className={INPUT_CLS + ' pr-12'} />
                <button type="button" onClick={() => setShowRegPwd(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-500 transition-colors">
                  {showRegPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full py-4 font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-600/20">
              {isSubmitting ? 'Sending OTP…' : 'Send Verification Code'}
            </Button>
          </form>
        )}
        <div className="mt-8 text-center">
          <button onClick={() => setView('login')} className="text-[11px] font-bold text-gray-500 hover:text-indigo-600 transition-colors uppercase tracking-widest">
            <span className="inline-flex items-center gap-1"><ArrowLeft size={12} /> Back to Sign In</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (view === 'register-otp') return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6 transition-colors font-sans">
      <div className="w-full max-w-md">
        {brand}
        {card(
          <form className="space-y-6 text-center" onSubmit={handleConfirmRegister}>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 mx-auto">
              <KeyRound size={22} />
            </div>
            <div>
              <p className="text-base font-bold text-gray-800 dark:text-gray-100">Check your inbox</p>
              <p className="text-sm text-gray-500 mt-1">
                We sent a 6-digit code to <strong className="text-gray-700 dark:text-gray-300">{pendingEmail}</strong>
              </p>
            </div>

            <OtpInput value={otpValue} onChange={setOtpValue} />

            <Button type="submit" disabled={isSubmitting || otpValue.length < 6} className="w-full py-4 font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-600/20">
              {isSubmitting ? 'Verifying…' : 'Verify & Create Account'}
            </Button>

            <p className="text-[11px] text-gray-400">
              Didn't receive it?{' '}
              <button type="button" disabled={isSubmitting || resendCooldown > 0} onClick={() => handleResendOtp('register')} className={`font-bold transition-colors ${resendCooldown > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-indigo-600 hover:underline'}`}>
                {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
              </button>
            </p>
          </form>
        )}
        <div className="mt-8 text-center">
          <button onClick={() => setView('register')} className="text-[11px] font-bold text-gray-500 hover:text-indigo-600 transition-colors uppercase tracking-widest">
            <span className="inline-flex items-center gap-1"><ArrowLeft size={12} /> Edit Registration Details</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (view === 'forgot') return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6 transition-colors font-sans">
      <div className="w-full max-w-md">
        {brand}
        {card(
          <form className="space-y-6 text-left" onSubmit={handleForgotPassword}>
            <div className="text-center mb-2">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 mx-auto mb-3">
                <KeyRound size={22} />
              </div>
              <p className="text-base font-bold text-gray-800 dark:text-gray-100">Forgot your password?</p>
              <p className="text-sm text-gray-500 mt-1">Enter your account email and we'll send a reset code.</p>
            </div>

            <div className="space-y-1.5">
              <label className={LABEL_CLS}>Email Address <span className="text-red-500">*</span></label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input type="email" name="forgotEmail" placeholder="Enter your email" autoComplete="email" className={INPUT_CLS} />
              </div>
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full py-4 font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-600/20">
              {isSubmitting ? 'Sending…' : 'Send Reset Code'}
            </Button>
          </form>
        )}
        <div className="mt-8 text-center">
          <button onClick={() => goBack('login')} className="text-[11px] font-bold text-gray-500 hover:text-indigo-600 transition-colors uppercase tracking-widest">
            <span className="inline-flex items-center gap-1"><ArrowLeft size={12} /> Back to Sign In</span>
          </button>
        </div>
      </div>
    </div>
  );

  // view === 'reset-otp'
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6 transition-colors font-sans">
      <div className="w-full max-w-md">
        {brand}
        {card(
          <form className="space-y-6 text-center" onSubmit={handleResetPassword}>
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 mx-auto">
              <KeyRound size={22} />
            </div>
            <div>
              <p className="text-base font-bold text-gray-800 dark:text-gray-100">Enter reset code</p>
              <p className="text-sm text-gray-500 mt-1">
                Code sent to <strong className="text-gray-700 dark:text-gray-300">{pendingEmail}</strong>
              </p>
            </div>

            <OtpInput value={otpValue} onChange={setOtpValue} />

            <div className="space-y-1.5 text-left">
              <label className={LABEL_CLS}>New Password <span className="text-red-500">*</span></label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type={showNewPwd ? 'text' : 'password'}
                  placeholder="Min 6 chars, A–Z, a–z, 0–9"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className={INPUT_CLS + ' pr-12'}
                />
                <button type="button" onClick={() => setShowNewPwd(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-500 transition-colors">
                  {showNewPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={isSubmitting || otpValue.length < 6 || !newPassword} className="w-full py-4 font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-600/20">
              {isSubmitting ? 'Resetting…' : 'Reset Password'}
            </Button>

            <p className="text-[11px] text-gray-400">
              Didn't receive it?{' '}
              <button type="button" disabled={isSubmitting || resendCooldown > 0} onClick={() => handleResendOtp('reset')} className={`font-bold transition-colors ${resendCooldown > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-indigo-600 hover:underline'}`}>
                {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
              </button>
            </p>
          </form>
        )}
        <div className="mt-8 text-center">
          <button onClick={() => goBack('login')} className="text-[11px] font-bold text-gray-500 hover:text-indigo-600 transition-colors uppercase tracking-widest">
            <span className="inline-flex items-center gap-1"><ArrowLeft size={12} /> Back to Sign In</span>
          </button>
        </div>
      </div>
    </div>
  );
}
