import { useStore } from '../store';
import { api } from '../api/client';

export interface User {
  id: number;
  email: string;
  name: string | null;
}

export function useAuth() {
  const token = useStore((s) => s.token);
  const setToken = useStore((s) => s.setToken);

  async function login(email: string, password: string) {
    const data = await api.post<{ token: string; user: User }>('/api/auth/login', {
      email,
      password,
    });
    setToken(data.token);
    return data.user;
  }

  async function setup(email: string, password: string, name?: string) {
    const data = await api.post<{ token: string; user: User }>('/api/auth/setup', {
      email,
      password,
      name,
    });
    setToken(data.token);
    return data.user;
  }

  function logout() {
    setToken(null);
  }

  return { token, login, setup, logout };
}
