import type { RalphCommand } from './types';

type CommandHandler = (cmd: RalphCommand) => Promise<void>;

class CommandRegistry {
  private handlers: Map<RalphCommand['action'], CommandHandler> = new Map();

  register(action: RalphCommand['action'], handler: CommandHandler): void {
    this.handlers.set(action, handler);
  }

  async execute(cmd: RalphCommand): Promise<boolean> {
    const handler = this.handlers.get(cmd.action);
    if (!handler) {
      console.error(`[Commands] Unknown command: ${cmd.action}`);
      return false;
    }
    try {
      await handler(cmd);
      return true;
    } catch (error) {
      console.error(`[Commands] Error executing ${cmd.action}:`, error);
      return false;
    }
  }

  isRegistered(action: RalphCommand['action']): boolean {
    return this.handlers.has(action);
  }
}

export const ralphCommands = new CommandRegistry();
