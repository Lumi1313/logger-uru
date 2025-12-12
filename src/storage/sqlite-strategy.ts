
import Database, { Database as SqliteDB } from 'better-sqlite3';
import { IStorageStrategy, LogEntry, PaginatedResponse, ApiMetrics } from './interface'; 
interface AggregateResult {
  total_requests: number;
  average_latency_ms: number | null; //null si no hay registros aun
}

//consulta sql
interface DistributionResult {
  count_2xx: number | null;
  count_3xx: number | null;
  count_4xx: number | null;
  count_5xx: number | null;
}
interface LogRow {
  id: string;
  timestamp: string; //string en vez de Date
  method: string;
  path: string;
  status_code: number | null;
  latency_ms: number | null;}

//nombre y tamaño default
const DB_FILE = 'logger_data.db'; 
const BATCH_SIZE = 100;

export class SqliteStorage implements IStorageStrategy {
  public async getMetrics(timeRange: '1h' | '6h' | '24h' | string): Promise<ApiMetrics> {
    
    // calcular tiempo cutoff (sqlite compara strings magicamente)
    const now = new Date();
    let secondsOffset = 0;
    if (timeRange === '1h') secondsOffset = 3600;
    else if (timeRange === '6h') secondsOffset = 21600;
    else if (timeRange === '24h') secondsOffset = 86400;

    //timestamp cutoff
    const cutoffDate = new Date(now.getTime() - (secondsOffset * 1000));
    const cutoffTimestamp = cutoffDate.toISOString(); 

    // SQL de latency y count
    const aggregateSQL = `
      SELECT 
        COUNT(*) AS total_requests,
        AVG(latency_ms) AS average_latency_ms
      FROM logs
      WHERE timestamp >= ?;
    `;
    
    // SQL para la distribución de códigos de estado
    //consulta condicional para clasificarlos por estado
    const distributionSQL = `
      SELECT 
        SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) AS count_2xx,
        SUM(CASE WHEN status_code >= 300 AND status_code < 400 THEN 1 ELSE 0 END) AS count_3xx,
        SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END) AS count_4xx,
        SUM(CASE WHEN status_code >= 500 AND status_code < 600 THEN 1 ELSE 0 END) AS count_5xx
      FROM logs
      WHERE timestamp >= ?;
    `;
    
    const aggregateResult = this.db.prepare(aggregateSQL).get(cutoffTimestamp) as AggregateResult;
    const distributionResult = this.db.prepare(distributionSQL).get(cutoffTimestamp) as DistributionResult;

    const avgLatency = aggregateResult.average_latency_ms || 0;

    return {
        total_requests: aggregateResult.total_requests || 0,
        average_latency_ms: parseFloat(avgLatency.toFixed(2)),
        status_code_distribution: {
            '2xx': distributionResult.count_2xx || 0,
            '3xx': distributionResult.count_3xx || 0,
            '4xx': distributionResult.count_4xx || 0,
            '5xx': distributionResult.count_5xx || 0,
            'other': 0 // no deberia ser necesario el other 
        },
        time_range: timeRange
    };
}
  private db!: SqliteDB; // '!' para que se inicie en init()
  private insertStatement!: Database.Statement;

  // init connection a la tabla
  public async init(): Promise<void> {
    try {
      //crea la DB o la abre si ya existe
      this.db = new Database(DB_FILE);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('busy_timeout = 5000'); //esperar 5s maximo

      // SQL para tabla logs
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS logs (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          status_code INTEGER,
          latency_ms INTEGER,
          client_ip TEXT,
          user_agent TEXT,
          request_body TEXT,
          response_body TEXT,
          error_message TEXT,
          metadata TEXT,
          level TEXT NOT NULL
        );
      `;
      this.db.exec(createTableSQL);

      //indices en db
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_timestamp ON logs (timestamp DESC);');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_status_code ON logs (status_code);');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_level ON logs (level);');

      // para usar en saveBatch
      const insertSQL = `
        INSERT INTO logs (id, timestamp, method, path, status_code, latency_ms, client_ip, user_agent, request_body, response_body, error_message, metadata, level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      this.insertStatement = this.db.prepare(insertSQL);
      
      console.log(`[SQLite] Conexión establecida y tabla 'logs' lista en ${DB_FILE}`);

    } catch (error) {
      console.error('[SQLite] Error al inicializar la base de datos:', error);
      throw error;
    }
  }

  //saveBatch para guardar varios logs
  public async saveBatch(logs: LogEntry[]): Promise<void> {
    if (logs.length === 0) return;

    //de alguna forma sqlite es mejor sincrono que asincrono
    const transaction = this.db.transaction((logEntries: LogEntry[]) => {
      for (const log of logEntries) {
        try {
          this.insertStatement.run(
            log.id,
            log.timestamp.toISOString(),
            log.method,
            log.path,
            log.status_code,
            log.latency_ms,
            log.client_ip,
            log.user_agent,
            //JSON a string para almacenamiento
            log.request_body ? JSON.stringify(log.request_body) : null,
            log.response_body ? JSON.stringify(log.response_body) : null,
            log.error_message || null,
            log.metadata ? JSON.stringify(log.metadata) : null,
            log.level
          );
        } catch (e) {
            //ignorar log mal formado y seguir
            console.error(`[SQLite] Falló la inserción del log ${log.id}.`, e);
        }
      }
    });

    //en el nombre de dios
    transaction(logs);
  }

  //intento de getLogs CON CURSOR
  public async getLogs(filters: any, cursor?: string, limit: number = BATCH_SIZE): Promise<PaginatedResponse> {
   
    //cursor=timestamp del ultimo registro 
    const cursorValue = cursor || new Date().toISOString(); 
    const queryLimit = limit + 1; //uno mas para ver si hay nextcursor
    
    let whereClauses: string[] = [`timestamp < '${cursorValue}'`];
    let params: (string | number)[] = [];

    // logica de filtros (mejorar)
    if (filters.status_code) {
        whereClauses.push(`status_code = ?`);
        params.push(filters.status_code);
    }
    if (filters.level) {
        whereClauses.push(`level = ?`);
        params.push(filters.level);
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const selectSQL = `
      SELECT * FROM logs ${whereSQL}
      ORDER BY timestamp DESC
      LIMIT ${queryLimit}
    `;

    const rows = this.db.prepare(selectSQL).all(...params) as LogRow[];
    const hasMore = rows.length === queryLimit;
    const finalData: LogRow[] = hasMore ? rows.slice(0, limit) : rows;

    const nextCursor = hasMore ? finalData[finalData.length - 1].timestamp : undefined;

    //volver a LogEntry
    const logs: LogEntry[] = finalData.map((row: any) => ({
      ...row,
      timestamp: new Date(row.timestamp),
      request_body: row.request_body ? JSON.parse(row.request_body) : undefined,
      response_body: row.response_body ? JSON.parse(row.response_body) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      status_code: row.status_code ?? undefined,
      latency_ms: row.latency_ms ?? undefined,
    }));

    // TODO: total_count, tabla separada de métricas
    return {
      data: logs,
      pagination: {
        has_more: hasMore,
        next_cursor: nextCursor,
        total_count: 0 // placeholder
      }
    };
  }

  //cerrar la db
  public async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      console.log('[SQLite] Conexión cerrada.');
    }
  }
}