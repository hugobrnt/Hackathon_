import { useEffect, useState, type FormEvent } from "react";
import { request } from "../../api/client";
import { Button } from "../../shared/ui";
export interface Owner {
  name: string;
  email: string;
}
export function AuthForm({
  demo = false,
  onSuccess,
}: {
  demo?: boolean;
  onSuccess: (owner: Owner, created: boolean) => void;
}) {
  const [register, setRegister] = useState(true),
    [ready, setReady] = useState(demo),
    [name, setName] = useState(demo ? "Alex" : ""),
    [email, setEmail] = useState(demo ? "alex@lingo.example" : ""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (demo) return;
    let alive = true;
    request<{ registration_open: boolean }>("/auth/status")
      .then((s) => {
        if (alive) {
          setRegister(s.registration_open);
          setReady(true);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [demo]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const owner = demo
        ? { name, email }
        : await request<Owner>(register ? "/auth/register" : "/auth/login", {
            method: "POST",
            body: JSON.stringify({ name, email, password }),
          });
      setPassword("");
      onSuccess(owner, !demo && register);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>{register ? "Create your account." : "Welcome back."}</h1>
      <p className="step-intro">Your brand’s insights, in one place.</p>
      <form onSubmit={(e) => void submit(e)}>
        {register && (
          <label className="field">
            Your name
            <input
              required
              maxLength={100}
              autoComplete="name"
              value={name}
              readOnly={demo}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}
        <label className="field">
          Email
          <input
            type="email"
            required
            maxLength={254}
            autoComplete="username"
            value={email}
            readOnly={demo}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {!demo && (
          <label className="field">
            Password
            <input
              type="password"
              required
              minLength={10}
              maxLength={256}
              autoComplete={register ? "new-password" : "current-password"}
              placeholder={
                register ? "At least 10 characters" : "Your password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <Button
          primary
          type="submit"
          className="full-width"
          disabled={busy || !ready}
        >
          {busy
            ? "Please wait…"
            : demo
              ? "Continue →"
              : register
                ? "Create an account →"
                : "Sign in →"}
        </Button>
        {!demo && register && (
          <Button
            onClick={() => {
              setRegister(false);
              setError("");
            }}
          >
            Already have an account? Sign in
          </Button>
        )}
      </form>
    </>
  );
}
