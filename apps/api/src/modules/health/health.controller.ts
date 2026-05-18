import { Controller, Get } from '@nestjs/common';

const STARTED_AT = Date.now();

@Controller('health')
export class HealthController {
  /**
   * Lightweight liveness probe used by Render's health check + status pages.
   * Returns uptime and the deployed commit so we can tell which build is live.
   */
  @Get()
  ping() {
    return {
      ok: true,
      ts: new Date().toISOString(),
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
      commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
      env: process.env.NODE_ENV ?? 'development',
    };
  }
}
