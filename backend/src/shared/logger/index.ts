/**
 * Structured Logger Service
 * Provides consistent logging across the application
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
    private format(level: LogLevel, message: string, meta?: any): string {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
    }

    info(message: string, meta?: any) {
        console.log(this.format('info', message, meta));
    }

    warn(message: string, meta?: any) {
        console.warn(this.format('warn', message, meta));
    }

    error(message: string, meta?: any) {
        console.error(this.format('error', message, meta));
    }

    debug(message: string, meta?: any) {
        if (process.env.NODE_ENV === 'development') {
            console.debug(this.format('debug', message, meta));
        }
    }

    /**
     * Log AI execution with timing
     */
    aiExecution(provider: string, model: string, durationMs: number, success: boolean) {
        this.info('AI Execution', { provider, model, durationMs, success });
    }
}

export default new Logger();
