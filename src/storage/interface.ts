export interface LogEntry {
  id: string;              // UUID v4
  timestamp: Date;         // ISO 8601
  method: string;          // GET, POST
  path: string;            // /api/users
  status_code?: number;    // 200, 404
  latency_ms?: number;     // response time
  client_ip?: string;
  user_agent?: string;
  request_body?: any;      // JSON o String
  response_body?: any;     // cambiable
  error_message?: string;  // errores
  metadata?: Record<string, any>; // logs manuales que no he terminado 
  level: 'INFO' | 'WARNING' | 'ERROR' | 'DEBUG'; 
}

export interface ApiMetrics {
  total_requests: number;
  average_latency_ms: number;
  status_code_distribution: {
    '2xx': number;
    '3xx': number;
    '4xx': number;
    '5xx': number;
    'other': number;
  };
  time_range: string;
}

//paginacion
export interface PaginatedResponse {
  data: LogEntry[];
  pagination: {
    has_more: boolean;
    next_cursor?: string;
    total_count: number;
  };
}

//para sqlite y localstorage
export interface IStorageStrategy {
  //init
  init(): Promise<void>;

  //guardar un array de logs 
  saveBatch(logs: LogEntry[]): Promise<void>;

  //logs dashboard
  getLogs(filters: any, cursor?: string, limit?: number): Promise<PaginatedResponse>;

  //metrics 
  getMetrics(timeRange: '1h' | '6h' | '24h' | string): Promise<ApiMetrics>;

  //graceful shutdown?
  close(): Promise<void>;
}
