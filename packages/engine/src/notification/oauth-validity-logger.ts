import { schedulerLog } from "../logger.js";
import type { AuthStorageLike } from "./oauth-expiry-monitor.js";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface OAuthValidityLoggerOptions {
  authStorage: AuthStorageLike;
  intervalMs?: number;
  clock?: () => number;
  logger?: (msg: string, meta?: Record<string, unknown>) => void;
}

export class OAuthValidityLogger {
  private readonly intervalMs: number;
  private readonly clock: () => number;
  private readonly logger: (msg: string, meta?: Record<string, unknown>) => void;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: OAuthValidityLoggerOptions) {
    this.intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.clock = opts.clock ?? Date.now;
    this.logger = opts.logger ?? ((message, meta) => schedulerLog.warn(message, meta));
  }

  async start(): Promise<void> {
    if (this.timer) {
      return;
    }

    await this.check();
    this.timer = setInterval(() => {
      void this.check();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  async check(): Promise<void> {
    this.opts.authStorage.reload?.();
    const providers = this.opts.authStorage.getOAuthProviders?.() ?? [];
    const now = this.clock();

    for (const provider of providers) {
      try {
        const credential = this.opts.authStorage.get?.(provider.id);
        if (credential?.type !== "oauth" || typeof credential.expires !== "number") {
          continue;
        }
        if (credential.expires > now) {
          continue;
        }

        this.logger("oauth credential expired — provider re-login required", {
          providerId: provider.id,
          providerName: provider.name,
          expiresAt: new Date(credential.expires).toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        schedulerLog.warn(`OAuth validity logger failed for provider=${provider.id}: ${message}`);
      }
    }
  }
}
