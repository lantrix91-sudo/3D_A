import { useState, type FormEvent } from 'react';
import { signIn } from '../services/serverHub';
import { Field } from './common/Field';

/** Экран входа: POST /api/v1/auth/login/ */
export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Введите логин и пароль');
      return;
    }
    setBusy(true);
    setError(null);
    const message = await signIn(username.trim(), password);
    // При успехе App покажет основной экран, и эта форма исчезнет сама
    if (message) {
      setError(message);
      setBusy(false);
    }
  };

  return (
    <div className="boot">
      <form className="login panel" onSubmit={submit} noValidate>
        <h1>Цифровой двойник цеха</h1>
        <p className="login__hint">Войдите под пользователем Django</p>
        <Field label="Логин" htmlFor="login-user">
          <input id="login-user" className="input" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Пароль" htmlFor="login-pass">
          <input id="login-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Вход…' : 'Войти'}</button>
      </form>
    </div>
  );
}
