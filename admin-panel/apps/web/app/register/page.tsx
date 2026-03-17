"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiRegister } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const { setMember } = useAuth();
  const [preferredName, setPreferredName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const name = preferredName.trim();
    const em = email.trim().toLowerCase();
    if (!name || !em || !password) {
      setError("Preferred name, email and password are required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const member = await apiRegister(name, em, password);
      setMember(member);
      router.push("/calendar");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-content auth-page">
      <div className="profile-section-card">
        <h2 className="profile-section-title">Register</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field">
            <label htmlFor="reg-name">Preferred name</label>
            <input
              id="reg-name"
              type="text"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="reg-password">Password (min 6 characters)</label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Registering…" : "Register"}
          </button>
        </form>
      </div>
      <p className="auth-footer">
        Already have an account? <Link href="/login" className="link">Log in</Link>
      </p>
    </div>
  );
}
