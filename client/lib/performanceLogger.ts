/**
 * Performance Logger Service
 * Tracks timing, memory usage, and system metrics for biometric capture
 */

interface LogEntry {
  timestamp: number;
  type: 'info' | 'timing' | 'memory' | 'error' | 'warning';
  category: string;
  message: string;
  data?: any;
}

interface TimingMark {
  startTime: number;
  endTime?: number;
  duration?: number;
}

interface MemorySnapshot {
  timestamp: number;
  jsHeapSize?: number;
  jsHeapSizeLimit?: number;
  totalJSHeapSize?: number;
  usedJSHeapSize?: number;
}

class PerformanceLogger {
  private logs: LogEntry[] = [];
  private timings: Map<string, TimingMark> = new Map();
  private memorySnapshots: MemorySnapshot[] = [];
  private sessionStartTime: number;

  constructor() {
    this.sessionStartTime = performance.now();
    this.log('info', 'Session', 'Performance logging initialized');
    this.captureMemorySnapshot('Session Start');
  }

  /**
   * Start timing a specific operation
   */
  startTiming(label: string): void {
    this.timings.set(label, {
      startTime: performance.now(),
    });
    this.log('timing', label, `Started`);
  }

  /**
   * End timing and log the duration
   */
  endTiming(label: string): number {
    const timing = this.timings.get(label);
    if (!timing) {
      this.log('warning', label, 'Timing not found - was startTiming called?');
      return 0;
    }

    const endTime = performance.now();
    const duration = endTime - timing.startTime;
    
    timing.endTime = endTime;
    timing.duration = duration;

    this.log('timing', label, `Completed in ${duration.toFixed(2)}ms`, {
      duration,
      startTime: timing.startTime,
      endTime,
    });

    return duration;
  }

  /**
   * Log a general message
   */
  log(
    type: 'info' | 'timing' | 'memory' | 'error' | 'warning',
    category: string,
    message: string,
    data?: any
  ): void {
    const entry: LogEntry = {
      timestamp: performance.now(),
      type,
      category,
      message,
      data,
    };
    this.logs.push(entry);

    // Also log to console with emoji prefixes for easy identification
    const prefix = {
      info: '📋',
      timing: '⏱️',
      memory: '💾',
      error: '❌',
      warning: '⚠️',
    }[type];

    console.log(`${prefix} [${category}] ${message}`, data || '');
  }

  /**
   * Capture current memory usage snapshot
   */
  captureMemorySnapshot(label: string): void {
    if ('memory' in performance && (performance as any).memory) {
      const mem = (performance as any).memory;
      const snapshot: MemorySnapshot = {
        timestamp: performance.now(),
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
        totalJSHeapSize: mem.totalJSHeapSize,
        usedJSHeapSize: mem.usedJSHeapSize,
      };
      this.memorySnapshots.push(snapshot);

      const usedMB = (snapshot.usedJSHeapSize! / 1024 / 1024).toFixed(2);
      const totalMB = (snapshot.totalJSHeapSize! / 1024 / 1024).toFixed(2);
      const limitMB = (snapshot.jsHeapSizeLimit! / 1024 / 1024).toFixed(2);

      this.log('memory', label, 
        `Memory: ${usedMB}MB used / ${totalMB}MB total (limit: ${limitMB}MB)`,
        snapshot
      );
    } else {
      this.log('warning', label, 'Memory API not available in this browser');
    }
  }

  /**
   * Get timing summary
   */
  getTimingSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    this.timings.forEach((timing, label) => {
      if (timing.duration !== undefined) {
        summary[label] = timing.duration;
      }
    });
    return summary;
  }

  /**
   * Get memory usage summary
   */
  getMemorySummary(): {
    initial?: MemorySnapshot;
    final?: MemorySnapshot;
    peak?: MemorySnapshot;
  } {
    if (this.memorySnapshots.length === 0) return {};

    const initial = this.memorySnapshots[0];
    const final = this.memorySnapshots[this.memorySnapshots.length - 1];
    
    let peak = initial;
    this.memorySnapshots.forEach(snapshot => {
      if (snapshot.usedJSHeapSize! > peak.usedJSHeapSize!) {
        peak = snapshot;
      }
    });

    return { initial, final, peak };
  }

  /**
   * Generate a comprehensive performance report
   */
  generateReport(): string {
    const sessionDuration = performance.now() - this.sessionStartTime;
    const timingSummary = this.getTimingSummary();
    const memorySummary = this.getMemorySummary();

    let report = '='.repeat(80) + '\n';
    report += 'BIOMETRIC CAPTURE PERFORMANCE REPORT\n';
    report += '='.repeat(80) + '\n\n';

    // Session Info
    report += '📊 SESSION INFORMATION\n';
    report += '-'.repeat(80) + '\n';
    report += `Session Duration: ${(sessionDuration / 1000).toFixed(2)} seconds\n`;
    report += `Total Log Entries: ${this.logs.length}\n`;
    report += `Timestamp: ${new Date().toISOString()}\n`;
    report += `User Agent: ${navigator.userAgent}\n\n`;

    // Timing Summary
    report += '⏱️  TIMING SUMMARY\n';
    report += '-'.repeat(80) + '\n';
    const sortedTimings = Object.entries(timingSummary).sort((a, b) => b[1] - a[1]);
    sortedTimings.forEach(([label, duration]) => {
      report += `${label.padEnd(40)} ${duration.toFixed(2).padStart(10)}ms\n`;
    });
    report += '\n';

    // Memory Summary
    report += '💾 MEMORY SUMMARY\n';
    report += '-'.repeat(80) + '\n';
    if (memorySummary.initial && memorySummary.final && memorySummary.peak) {
      const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
      
      report += `Initial Memory: ${formatMB(memorySummary.initial.usedJSHeapSize!)}\n`;
      report += `Final Memory:   ${formatMB(memorySummary.final.usedJSHeapSize!)}\n`;
      report += `Peak Memory:    ${formatMB(memorySummary.peak.usedJSHeapSize!)}\n`;
      report += `Memory Growth:  ${formatMB(memorySummary.final.usedJSHeapSize! - memorySummary.initial.usedJSHeapSize!)}\n`;
      report += `Heap Limit:     ${formatMB(memorySummary.final.jsHeapSizeLimit!)}\n`;
    } else {
      report += 'Memory API not available in this browser\n';
    }
    report += '\n';

    // Detailed Log Entries
    report += '📋 DETAILED LOG ENTRIES\n';
    report += '-'.repeat(80) + '\n';
    this.logs.forEach(entry => {
      const time = (entry.timestamp / 1000).toFixed(3);
      const icon = {
        info: '📋',
        timing: '⏱️',
        memory: '💾',
        error: '❌',
        warning: '⚠️',
      }[entry.type];
      
      report += `[${time}s] ${icon} [${entry.category}] ${entry.message}\n`;
      if (entry.data && typeof entry.data === 'object') {
        report += `  Data: ${JSON.stringify(entry.data, null, 2).split('\n').join('\n  ')}\n`;
      }
    });

    report += '\n' + '='.repeat(80) + '\n';
    report += 'END OF REPORT\n';
    report += '='.repeat(80) + '\n';

    return report;
  }

  /**
   * Download report as a text file
   */
  downloadReport(filename: string = 'biometric-performance-report.txt'): void {
    const report = this.generateReport();
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    this.log('info', 'Report', `Performance report downloaded: ${filename}`);
  }

  /**
   * Clear all logs and reset
   */
  reset(): void {
    this.logs = [];
    this.timings.clear();
    this.memorySnapshots = [];
    this.sessionStartTime = performance.now();
    this.log('info', 'Session', 'Performance logger reset');
  }

  /**
   * Get all logs
   */
  getAllLogs(): LogEntry[] {
    return [...this.logs];
  }
}

// Export singleton instance
export const performanceLogger = new PerformanceLogger();
