import { ConfigManager, LoggerConfig } from '../config/config-manager';
import { IStorageStrategy, LogEntry } from '../storage/interface';
import { SqliteStorage } from '../storage/sqlite-strategy'; 
import { MemoryStorage } from '../storage/memory-strategy';
import { DashboardController } from '../monitoring/dashboard-controller'; 
// import { PostgresStorage } from '../storage/postgres-strategy'; 
import { expressMiddleware } from '../middleware/express';

export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private storageStrategy!: IStorageStrategy;
  private logBuffer: LogEntry[] = []; // Buffer
  private batchInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_TIME_MS = 1000; // 1s para guardar logs
  private dashboardController: DashboardController;

  private constructor() {
    this.config = ConfigManager.getInstance().getConfig();
    this.initializeStorage();
    this.startBatchProcessor();
    this.dashboardController = new DashboardController();
    this.dashboardController.start(); //startup

    this.getStorageStrategy = this.getStorageStrategy.bind(this);
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  //get middleware
  public static getMiddleware() {
      //middleware llama internamente a Logger.getInstance().save()
      return expressMiddleware; 
  }

  private initializeStorage() {
    // check DB local
    if (this.config.storage.strategy !== 'memory' && this.config.storage.strategy !== 'sqlite') {
        //else use local memory
        console.warn('Estrategia de almacenamiento externa no configurada. Usando Memory Storage por defecto.');
        this.config.storage.strategy = 'memory'; 
    }

    switch (this.config.storage.strategy) {
      case 'sqlite':
        this.storageStrategy = new SqliteStorage();
        break;
      case 'memory':
        //configuración específica de memoria (max_records)
        this.storageStrategy = new MemoryStorage(this.config.storage.config); 
        break;
      // case 'postgresql':
      //   break;
      default:
        //error
        console.error('Estrategia de almacenamiento inválida. Usando Memory Storage.');
        this.storageStrategy = new MemoryStorage(this.config.storage.config);
        break;
    }
    this.storageStrategy.init();
  }
  public getStorageStrategy(): IStorageStrategy {
  return this.storageStrategy;
}
  // batching o como se llame
  public save(log: LogEntry): void {
    this.logBuffer.push(log);
  }

  private startBatchProcessor() {
    this.batchInterval = setInterval(() => {
        if (this.logBuffer.length > 0) {
            const batch = this.logBuffer.splice(0, this.logBuffer.length);
            
            //enviar a almacenamiento
            this.storageStrategy.saveBatch(batch).catch(e => {
                //error
                console.error('[LoggerCore] Error en saveBatch asíncrono:', e);
            });
        }
    }, this.BATCH_TIME_MS);
  }

  public async shutdown() {
    //se supone que es graceful shutdown esto
    this.dashboardController.stop();
    if (this.batchInterval) {
        clearInterval(this.batchInterval);
    }
    if (this.logBuffer.length > 0) {
        console.log(`[Logger] Guardando ${this.logBuffer.length} logs restantes antes de cerrar...`);
        await this.storageStrategy.saveBatch(this.logBuffer);
        this.logBuffer = []; // limpiar buffer
    }
    await this.storageStrategy.close();
  }

  public info(message: string, metadata?: Record<string, any>) {
    this.save({
        id: new Date().getTime().toString(), 
        timestamp: new Date(),
        method: 'MANUAL',
        path: 'n/a',
        level: 'INFO',
        error_message: message,
        metadata: metadata
    } as LogEntry);
  }

  public warning(message: string, metadata?: Record<string, any>) {
    this.save({
        id: new Date().getTime().toString(),
        timestamp: new Date(),
        method: 'MANUAL',
        path: 'n/a',
        level: 'WARNING', // Establecer nivel WARNING
        error_message: message,
        metadata: metadata
    } as LogEntry);
  }

  public error(message: string, metadata?: Record<string, any>) {
    this.save({
        id: new Date().getTime().toString(),
        timestamp: new Date(),
        method: 'MANUAL',
        path: 'n/a',
        level: 'ERROR', // El nivel que se guarda en la base de datos/memoria
        error_message: message,
        metadata: metadata
    } as LogEntry);
  }

 
  public debug(message: string, metadata?: Record<string, any>) {
    this.save({
        id: new Date().getTime().toString(),
        timestamp: new Date(),
        method: 'MANUAL',
        path: 'n/a',
        level: 'DEBUG', // Establecer nivel DEBUG
        error_message: message,
        metadata: metadata
    } as LogEntry);
  }
}

  //TODO: error, warning, debug
