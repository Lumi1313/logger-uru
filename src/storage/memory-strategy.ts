import { IStorageStrategy, LogEntry, PaginatedResponse, ApiMetrics } from './interface';

//default config
const DEFAULT_MAX_RECORDS = 5000; 

// intento de buffer circular
export class MemoryStorage implements IStorageStrategy {
  public async getMetrics(timeRange: '1h' | '6h' | '24h' | string): Promise<ApiMetrics> {
    // cutofftime
    const now = new Date();
    let cutoffTime: Date;

    // rangos 1h 6h 24h
    if (timeRange === '1h') cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
    else if (timeRange === '6h') cutoffTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    else if (timeRange === '24h') cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    else cutoffTime = new Date(0); //si todo falla, trae todos los logs

    const recentLogs = this.logs.filter(log => log.timestamp >= cutoffTime);

    let totalLatency = 0;
    const statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, 'other': 0 };

    for (const log of recentLogs) {
        if (log.latency_ms) {
            totalLatency += log.latency_ms;
        }

        //statuscode
        if (log.status_code) {
            const statusStr = log.status_code.toString();
            if (statusStr.startsWith('2')) statusCounts['2xx']++;
            else if (statusStr.startsWith('3')) statusCounts['3xx']++;
            else if (statusStr.startsWith('4')) statusCounts['4xx']++;
            else if (statusStr.startsWith('5')) statusCounts['5xx']++;
            else statusCounts['other']++;
        }
    }

    const totalRequests = recentLogs.length;
    const averageLatency = totalRequests > 0 ? totalLatency / totalRequests : 0;

    return {
        total_requests: totalRequests,
        average_latency_ms: parseFloat(averageLatency.toFixed(2)),
        status_code_distribution: statusCounts,
        time_range: timeRange
    };
}
  private logs: LogEntry[] = [];
  private maxRecords: number;
  private totalCount: number = 0; //numero de logs actual

  constructor(config: { max_records?: number } = {}) {
    this.maxRecords = config.max_records || DEFAULT_MAX_RECORDS;
    console.log(`[MemoryStorage] Inicializado con límite de ${this.maxRecords} registros.`);
  }
//init 
  public async init(): Promise<void> {
    return Promise.resolve();
  }

  //guardar logs
  public async saveBatch(newLogs: LogEntry[]): Promise<void> {
    //pasar logs a array
    this.logs.push(...newLogs);
    this.totalCount += newLogs.length;

    //límite 
    if (this.logs.length > this.maxRecords) {
      // borrar los logs mas antiguos
      const logsToRemove = this.logs.length - this.maxRecords;
      this.logs.splice(0, logsToRemove);
      //console.log "se borró esto"
    }

    return Promise.resolve();
  }

  //TODO: paginacion basada en cursor y no en indice
  public async getLogs(filters: any, cursor?: string, limit: number = 100): Promise<PaginatedResponse> {
    
    //levelfilter de datos
    let filteredLogs = this.logs;
    if (filters.level) {
      filteredLogs = filteredLogs.filter(log => log.level === filters.level);
    }
    //TODO: filtrar por status_code
    //el buffer circular deberia tener un orden así que se invierte para tener newest to oldest
    const sortedLogs = [...filteredLogs].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    //paginación index
    const offset = parseInt(cursor || '0', 10);
    const startIndex = offset;
    const endIndex = offset + limit;

    const paginatedData = sortedLogs.slice(startIndex, endIndex);
    
    const nextCursor = endIndex < sortedLogs.length ? endIndex.toString() : undefined;

    return {
      data: paginatedData,
      pagination: {
        has_more: !!nextCursor,
        next_cursor: nextCursor,
        total_count: filteredLogs.length, //logs que pasan el filtro
      }
    };
  }

  public async close(): Promise<void> {
    this.logs = []; //limpiamos la memoria
    return Promise.resolve();
  }
}