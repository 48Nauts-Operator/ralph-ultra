/**
 * Tailscale Integration Module
 *
 * Provides utilities for detecting Tailscale status, retrieving network information,
 * and generating shareable remote access URLs for Ralph Ultra.
 */

export interface TailscaleStatus {
  isInstalled: boolean;
  isConnected: boolean;
  tailscaleIP?: string;
  magicDNS?: string;
  machineName?: string;
  tailnetName?: string;
}

/**
 * Detects if Tailscale CLI is installed and available
 */
async function isTailscaleInstalled(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['which', 'tailscale'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Parses Tailscale status output to extract connection information
 */
async function parseTailscaleStatus(): Promise<Omit<TailscaleStatus, 'isInstalled'>> {
  try {
    const proc = Bun.spawn(['tailscale', 'status', '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    if (proc.exitCode !== 0) {
      return { isConnected: false };
    }

    const data = JSON.parse(output);

    // Extract self peer information
    const self = data.Self;
    if (!self) {
      return { isConnected: false };
    }

    // Get Tailscale IP (first address, usually IPv4)
    const tailscaleIP = self.TailscaleIPs?.[0];

    // Get machine and tailnet names
    const machineName = self.HostName;
    const tailnetName = data.MagicDNSSuffix?.replace(/\.$/, ''); // Remove trailing dot

    // Construct MagicDNS name
    const magicDNS = tailnetName ? `${machineName}.${tailnetName}` : undefined;

    return {
      isConnected: true,
      tailscaleIP,
      magicDNS,
      machineName,
      tailnetName,
    };
  } catch {
    return { isConnected: false };
  }
}

/**
 * Retrieves current Tailscale status including installation and connection state
 */
export async function getTailscaleStatus(): Promise<TailscaleStatus> {
  const isInstalled = await isTailscaleInstalled();

  if (!isInstalled) {
    return { isInstalled: false, isConnected: false };
  }

  const status = await parseTailscaleStatus();

  return {
    isInstalled: true,
    ...status,
  };
}

/**
 * Generates a shareable remote access URL for Ralph Ultra
 *
 * @param token - Authentication token for remote connections
 * @param port - WebSocket server port (default: 7890)
 * @returns Full URL with token parameter, or null if Tailscale not available
 */
export async function generateRemoteURL(
  token: string,
  port: number = 7890,
): Promise<string | null> {
  const status = await getTailscaleStatus();

  if (!status.isConnected || !status.magicDNS) {
    return null;
  }

  return `ws://${status.magicDNS}:${port}?token=${token}`;
}

/**
 * Copies text to system clipboard using pbcopy (macOS) or xclip (Linux)
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Try macOS pbcopy first
    const pbcopyProc = Bun.spawn(['pbcopy'], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Write to stdin using Bun's WritableStreamDefaultWriter
    pbcopyProc.stdin.write(text);
    pbcopyProc.stdin.end();
    await pbcopyProc.exited;

    if (pbcopyProc.exitCode === 0) {
      return true;
    }

    // Fallback to Linux xclip
    const xclipProc = Bun.spawn(['xclip', '-selection', 'clipboard'], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    xclipProc.stdin.write(text);
    xclipProc.stdin.end();
    await xclipProc.exited;

    return xclipProc.exitCode === 0;
  } catch {
    return false;
  }
}
