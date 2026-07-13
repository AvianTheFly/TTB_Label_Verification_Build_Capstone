import { useEffect, useState } from "react";

import { getHealth } from "../api/health";

const HEALTH_TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 2500;
const READY_VISIBLE_MS = 3500;

type StartupStatus = "checking" | "ready" | "hidden";

export function BackendStartupStatus() {
  const [status, setStatus] = useState<StartupStatus>("checking");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let isActive = true;
    let retryTimer: number | undefined;
    let hideTimer: number | undefined;
    let healthTimeout: number | undefined;
    let controller: AbortController | undefined;

    async function checkHealth() {
      controller = new AbortController();
      healthTimeout = window.setTimeout(() => controller?.abort(), HEALTH_TIMEOUT_MS);

      try {
        await getHealth({ signal: controller.signal });

        if (!isActive) {
          return;
        }

        setStatus("ready");
        hideTimer = window.setTimeout(() => {
          if (isActive) {
            setStatus("hidden");
          }
        }, READY_VISIBLE_MS);
      } catch {
        if (!isActive) {
          return;
        }

        setAttempts((currentAttempts) => currentAttempts + 1);
        retryTimer = window.setTimeout(checkHealth, RETRY_DELAY_MS);
      } finally {
        if (healthTimeout !== undefined) {
          window.clearTimeout(healthTimeout);
        }
      }
    }

    void checkHealth();

    return () => {
      isActive = false;
      controller?.abort();
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
      if (hideTimer !== undefined) {
        window.clearTimeout(hideTimer);
      }
      if (healthTimeout !== undefined) {
        window.clearTimeout(healthTimeout);
      }
    };
  }, []);

  if (status === "hidden") {
    return null;
  }

  const isReady = status === "ready";
  const title = isReady
    ? "Ready to go"
    : attempts > 0
      ? "Still waking verification service"
      : "Waking verification service";
  const detail = isReady
    ? "The live API is online."
    : "This can take a minute after the cloud server has been idle.";

  return (
    <aside
      className={`startup-status startup-status--${status}`}
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <span className="startup-status__indicator" aria-hidden="true" />
      <span className="startup-status__copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
    </aside>
  );
}
