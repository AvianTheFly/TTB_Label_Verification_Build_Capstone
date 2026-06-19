import { useEffect, useState } from "react";

import { getHealth } from "../api/health";
import type { HealthResponse } from "../types/api";

type HealthState =
  | { status: "loading" }
  | { status: "ready"; data: HealthResponse }
  | { status: "error"; message: string };

export function App() {
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    getHealth()
      .then((data) => setHealth({ status: "ready", data }))
      .catch(() =>
        setHealth({
          status: "error",
          message: "The backend is not responding yet. Start the backend and refresh this page."
        })
      );
  }, []);

  return (
    <main className="app-shell">
      <section className="status-panel" aria-labelledby="status-title">
        <p className="phase-label">Phase 0</p>
        <h1 id="status-title">TTB Label Verification</h1>
        <p className="status-copy">
          The project foundation is ready. This page checks that the frontend can reach the
          backend before any verification features are added.
        </p>

        <div className="health-box" role="status" aria-live="polite">
          {health.status === "loading" && <span>Checking backend...</span>}
          {health.status === "error" && <span>{health.message}</span>}
          {health.status === "ready" && (
            <div className="health-result">
              <strong>Backend connected</strong>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>{health.data.status}</dd>
                </div>
                <div>
                  <dt>Service</dt>
                  <dd>{health.data.service}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{health.data.version}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
