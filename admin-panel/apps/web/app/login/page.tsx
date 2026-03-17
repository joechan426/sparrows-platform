"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiLogin, apiRegister } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { setMember } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [preferredName, setPreferredName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (isLogin) {
      if (!email.trim() || !password) {
        setError("Email and password are required.");
        return;
      }
    } else {
      if (!preferredName.trim() || !email.trim() || !password) {
        setError("Preferred name, email and password are required.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
    }
    setLoading(true);
    try {
      if (isLogin) {
        const member = await apiLogin(email, password);
        setMember(member);
      } else {
        const member = await apiRegister(preferredName.trim(), email.trim().toLowerCase(), password);
        setMember(member);
      }
      router.push("/calendar");
    } catch (err) {
      setError(err instanceof Error ? err.message : (isLogin ? "Login failed." : "Registration failed."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-content auth-page">
      <div className="profile-section-card">
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={isLogin}
            className={isLogin ? "active" : ""}
            onClick={() => { setIsLogin(true); setError(""); }}
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isLogin}
            className={!isLogin ? "active" : ""}
            onClick={() => { setIsLogin(false); setError(""); }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="field">
              <label htmlFor="auth-name">Preferred name</label>
              <input
                id="auth-name"
                type="text"
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                autoComplete="name"
                placeholder="Preferred name"
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="Email"
            />
          </div>
          <div className="field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="Password"
              minLength={isLogin ? undefined : 6}
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? (isLogin ? "Logging in…" : "Registering…") : (isLogin ? "Log in" : "Register")}
          </button>
        </form>
      </div>
      <p className="auth-footer">
        {isLogin ? "Don't have an account? " : "Already have an account? "}
        <button type="button" className="link-btn" onClick={() => { setIsLogin(!isLogin); setError(""); }}>
          {isLogin ? "Register" : "Log in"}
        </button>
      </p>
    </div>
  );
}
