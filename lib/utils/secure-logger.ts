// Log levels
interface LogLevel {
  ERROR: 'error';
  WARN: 'warn';
  INFO: 'info';
  DEBUG: 'debug';
}

const LOG_LEVELS: LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

// Log entry structure
interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

// Secure logger with data sanitization
class SecureLogger {
  // Sanitize sensitive data from log context
  private sanitizeData(data: unknown): unknown {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sensitiveFields = [
      'password', 'password_hash', 'token', 'secret', 'key', 'auth',
      'session', 'cookie', 'authorization', 'x-api-key', 'csrf'
    ];

    const sanitized = { ...(data as Record<string, unknown>) };
    
    for (const key in sanitized) {
      if (sensitiveFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        sanitized[key] = '[REDACTED]';
      } else if (key.toLowerCase().includes('ip')) {
        sanitized[key] = this.anonymizeIP(String(sanitized[key]));
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitizeData(sanitized[key]);
      }
    }

    return sanitized;
  }

  // Anonymize IP addresses
  private anonymizeIP(ip: string): string {
    if (!ip || ip === 'unknown') return 'unknown';
    
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
      }
    }
    
    if (ip.includes(':')) {
      const parts = ip.split(':');
      if (parts.length >= 4) {
        return `${parts[0]}:${parts[1]}:${parts[2]}:xxxx:xxxx:xxxx:xxxx:xxxx`;
      }
    }
    
    return 'xxx.xxx.xxx.xxx';
  }

  // Format log entry with sanitized context
  private formatLog(level: string, message: string, context?: Record<string, unknown>): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: context ? (this.sanitizeData(context) as Record<string, unknown>) : undefined
    };
  }

  // Write log entry (formatted in dev, JSON in production)
  private writeLog(entry: LogEntry): void {
    if (process.env.NODE_ENV === 'development') {
      const logMethod = entry.level === 'error' ? console.error :
                       entry.level === 'warn' ? console.warn :
                       entry.level === 'info' ? console.info :
                       console.log;
      
      logMethod(
        `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`,
        entry.context ? entry.context : ''
      );
    } else {
      console.log(JSON.stringify(entry));
    }
  }

  // Log error
  error(message: string, context?: Record<string, unknown>): void {
    const entry = this.formatLog(LOG_LEVELS.ERROR, message, context);
    this.writeLog(entry);
  }

  // Log warning
  warn(message: string, context?: Record<string, unknown>): void {
    const entry = this.formatLog(LOG_LEVELS.WARN, message, context);
    this.writeLog(entry);
  }

  // Log info
  info(message: string, context?: Record<string, unknown>): void {
    const entry = this.formatLog(LOG_LEVELS.INFO, message, context);
    this.writeLog(entry);
  }

  // Log debug (only in development)
  debug(message: string, context?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'development') {
      const entry = this.formatLog(LOG_LEVELS.DEBUG, message, context);
      this.writeLog(entry);
    }
  }
}

export const logger = new SecureLogger();

