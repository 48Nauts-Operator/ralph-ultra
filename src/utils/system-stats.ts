import { execSync } from 'child_process';
import { platform } from 'os';

export interface SystemStats {
  cpuUsage: number;
  memUsage: number;
  memTotal: number;
  memUsed: number;
  memFree: number;
}

export function getSystemStats(): SystemStats {
  const isMac = platform() === 'darwin';

  try {
    if (isMac) {
      return getMacStats();
    }
    return getLinuxStats();
  } catch {
    return { cpuUsage: 0, memUsage: 0, memTotal: 0, memUsed: 0, memFree: 0 };
  }
}

function getMacStats(): SystemStats {
  const topOutput = execSync('top -l 1 -n 0', { encoding: 'utf-8', timeout: 5000 });

  const cpuMatch = topOutput.match(/CPU usage:\s+([\d.]+)%\s+user/);
  const cpuUsage = cpuMatch ? parseFloat(cpuMatch[1] || '0') : 0;

  const memMatch = topOutput.match(/PhysMem:\s+(\d+)([GMK])\s+used.*?(\d+)([GMK])\s+unused/);
  let memUsed = 0;
  let memFree = 0;

  if (memMatch) {
    const usedVal = parseInt(memMatch[1] || '0');
    const usedUnit = memMatch[2];
    const freeVal = parseInt(memMatch[3] || '0');
    const freeUnit = memMatch[4];

    memUsed =
      usedUnit === 'G' ? usedVal : usedUnit === 'M' ? usedVal / 1024 : usedVal / (1024 * 1024);
    memFree =
      freeUnit === 'G' ? freeVal : freeUnit === 'M' ? freeVal / 1024 : freeVal / (1024 * 1024);
  }

  const memTotalBytes = parseInt(execSync('sysctl -n hw.memsize', { encoding: 'utf-8' }).trim());
  const memTotal = Math.round(memTotalBytes / (1024 * 1024 * 1024));
  const memUsage = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

  return {
    cpuUsage: Math.round(cpuUsage),
    memUsage: Math.round(memUsage),
    memTotal,
    memUsed: Math.round(memUsed),
    memFree: Math.round(memFree),
  };
}

function getLinuxStats(): SystemStats {
  const cpuOutput = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | tr -d '%'", {
    encoding: 'utf-8',
    timeout: 5000,
  }).trim();
  const cpuUsage = parseFloat(cpuOutput) || 0;

  const memOutput = execSync('free -m | grep Mem', { encoding: 'utf-8', timeout: 5000 });

  const parts = memOutput.trim().split(/\s+/);
  const memTotal = parseInt(parts[1] || '0');
  const memUsed = parseInt(parts[2] || '0');
  const memUsage = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

  const memFree = memTotal - memUsed;
  return {
    cpuUsage: Math.round(cpuUsage),
    memUsage: Math.round(memUsage),
    memTotal: Math.round(memTotal / 1024),
    memUsed: Math.round(memUsed / 1024),
    memFree: Math.round(memFree / 1024),
  };
}
