import readline from 'readline';

/**
 * Interactive prompt utility for CLI-based input
 * Used by agents to gather information from humans
 */
export class PromptUtils {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Ask a question and get user input
   */
  async ask(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Ask for password (hidden input)
   */
  async askPassword(question: string): Promise<string> {
    return new Promise((resolve) => {
      const stdin = process.stdin;
      stdin.resume();
      stdin.setRawMode(true);

      this.rl.question(question, (answer) => {
        stdin.setRawMode(false);
        stdin.pause();
        resolve(answer);
      });
    });
  }

  /**
   * Display a message
   */
  print(message: string): void {
    console.log(message);
  }

  /**
   * Close the readline interface
   */
  close(): void {
    this.rl.close();
  }

  /**
   * Validate email format
   */
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain an uppercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain a number');
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
      errors.push('Password must contain a special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
