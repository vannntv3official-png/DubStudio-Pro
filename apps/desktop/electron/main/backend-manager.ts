import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import net from 'net';
import crypto from 'crypto';
import http from 'http';
import { app } from 'electron';

export interface BackendConnectionInfo {
  host: string;
  port: number;
  token: string;
}

export class BackendManager {
  private process: ChildProcess | null = null;
  private port: number = 8765;
  private host: string = '127.0.0.1';
  private token: string = crypto.randomUUID();
  private isShuttingDown: boolean = false;
  private onRestartCallback: ((info: BackendConnectionInfo) => void) | null = null;

  public onRestart(cb: (info: BackendConnectionInfo) => void): void {
    this.onRestartCallback = cb;
  }

  public async getAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on('error', reject);
      server.listen(0, this.host, () => {
        const address = server.address() as net.AddressInfo;
        const port = address.port;
        server.close(() => resolve(port));
      });
    });
  }

  public getConnectionInfo(): BackendConnectionInfo {
    return {
      host: this.host,
      port: this.port,
      token: this.token,
    };
  }

  public async start(): Promise<BackendConnectionInfo> {
    this.port = await this.getAvailablePort().catch(() => 8765);

    const isDev = !app.isPackaged;
    const rootDir = path.resolve(__dirname, '../../../../');
    let pythonExecutable: string;
    let mainPyPath: string;

    if (isDev) {
      // In development: look for root backend virtual environment
      pythonExecutable = path.join(rootDir, 'backend', '.venv', 'Scripts', 'python.exe');
      mainPyPath = path.join(rootDir, 'backend', 'app', 'main.py');
    } else {
      // In production: packaged executable or bundled venv
      pythonExecutable = path.join(process.resourcesPath, 'backend', 'dubstudio-backend.exe');
      mainPyPath = '';
    }

    const env = {
      ...process.env,
      DUBSTUDIO_BACKEND_HOST: this.host,
      DUBSTUDIO_BACKEND_PORT: this.port.toString(),
      DUBSTUDIO_AUTH_TOKEN: this.token,
      HOST: this.host,
      PORT: this.port.toString(),
      AUTH_TOKEN: this.token,
      PYTHONUNBUFFERED: '1',
      PYTHONPATH: path.resolve(rootDir, 'backend'),
    };

    const args = mainPyPath ? [mainPyPath] : [];
    const workingDir = isDev ? path.resolve(rootDir, 'backend') : process.resourcesPath;

    console.log(`[BackendManager] Starting backend on ${this.host}:${this.port}...`);

    this.process = spawn(pythonExecutable, args, {
      cwd: workingDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    this.process.stdout?.on('data', (data) => {
      console.log(`[Backend stdout] ${data.toString().trim()}`);
    });

    this.process.stderr?.on('data', (data) => {
      console.error(`[Backend stderr] ${data.toString().trim()}`);
    });

    this.process.on('exit', (code, signal) => {
      console.warn(`[BackendManager] Backend exited with code ${code}, signal ${signal}`);
      this.process = null;
      if (!this.isShuttingDown) {
        console.log('[BackendManager] Unexpected crash, restarting backend...');
        setTimeout(async () => {
          try {
            const info = await this.start();
            if (this.onRestartCallback) {
              this.onRestartCallback(info);
            }
          } catch (e) {
            console.error('[BackendManager] Failed to restart backend process:', e);
          }
        }, 2000);
      }
    });

    // Wait for health endpoint readiness
    await this.waitForReady(30000);

    return this.getConnectionInfo();
  }

  private async waitForReady(timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const url = `http://${this.host}:${this.port}/api/v1/health`;

    while (Date.now() - startTime < timeoutMs) {
      const isUp = await new Promise<boolean>((resolve) => {
        const req = http.get(url, (res) => {
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
          req.destroy();
          resolve(false);
        });
      });

      if (isUp) {
        console.log('[BackendManager] Backend is ready and responding to health check.');
        return;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`Backend failed to start within ${timeoutMs}ms.`);
  }

  public stop(): void {
    this.isShuttingDown = true;
    if (this.process && this.process.pid) {
      console.log('[BackendManager] Stopping backend process...');
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', this.process.pid.toString(), '/f', '/t']);
        } else {
          this.process.kill('SIGTERM');
        }
      } catch (e) {
        console.error('[BackendManager] Error terminating backend process:', e);
      }
      this.process = null;
    }
  }
}

export const backendManager = new BackendManager();
