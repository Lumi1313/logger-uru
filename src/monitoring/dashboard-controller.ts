import express, { Express, Request, Response, NextFunction } from 'express';
import http from 'http';
import { ConfigManager } from '../config/config-manager';
import { Logger } from '../core/logger'; //instancia de Storage
import { DASHBOARD_HTML } from './dashboard-ui'; 


export class DashboardController {
  private app: Express;
  private server: http.Server | null = null;
  private config = ConfigManager.getInstance().getConfig();
  private port: number;

  constructor() {
    this.app = express();
    //puerto que será usado en express
    this.port = this.config.monitoring.port || 8080; 
    this.setupRoutes();
  }

  private setupRoutes() {
    // authmiddleware
    this.app.use(this.authMiddleware.bind(this));

    // ruta al html
    this.app.get('/', (req: Request, res: Response) => {
      res.send(DASHBOARD_HTML);
    });

    //api logs
    this.app.get('/api/logs', async (req: Request, res: Response) => {
      try {
        const loggerInstance = Logger.getInstance();
        const limit = parseInt(req.query.limit as string) || 50;
        const cursor = req.query.cursor as string | undefined;
        const filters = {
          level: req.query.level as string,
          // TODO: status_code, path
        };

        const logs = await loggerInstance.getStorageStrategy().getLogs(filters, cursor, limit);
        res.json(logs);
      } catch (error) {
        console.error('Error al obtener logs:', error);
        res.status(500).json({ error: 'Fallo interno al obtener logs' });
      }
    });

    //metrics (terminar)
   this.app.get('/api/metrics', async (req: Request, res: Response) => {
      try {
        const loggerInstance = Logger.getInstance();
        
        //rango de tiempo
        const timeRange = (req.query.range as string) || '1h';

        //call getmetrics
        const metrics = await loggerInstance.getStorageStrategy().getMetrics(timeRange);
        res.json(metrics);
      } catch (error) {
        console.error('Error al obtener métricas:', error);
        res.status(500).json({ error: 'Fallo interno al obtener métricas' });
      }
    });

    //ver si el dashboard no murió en el intento
    this.app.get('/health', (req: Request, res: Response) => {
      res.status(200).send('OK');
    });
  }

  //auth
  private authMiddleware(req: Request, res: Response, next: NextFunction) {
    const authConfig = this.config.monitoring.auth;
    if (req.path === '/health') return next();//tas vivo

    if (authConfig?.enabled && authConfig.username && authConfig.password) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Logger Dashboard"');
        return res.status(401).send('Unauthorized');
      }

      const encoded = authHeader.substring(6); // quita "Basic"
      const decoded = Buffer.from(encoded, 'base64').toString();
      const [username, password] = decoded.split(':');

      if (username === authConfig.username && password === authConfig.password) {
        return next();
      } else {
        res.set('WWW-Authenticate', 'Basic realm="Logger Dashboard"');
        return res.status(401).send('Invalid Credentials');
      }
    }
    next(); //if auth disabled go next ggs
  }

  public start() {
    if (!this.config.monitoring.enabled) {
      console.warn('[Dashboard] Monitoreo deshabilitado por configuración.');
      return;
    }
    this.server = this.app.listen(this.port, () => {
      console.log(`[Dashboard] Monitoreo disponible en: http://localhost:${this.port}`);
    });
  }

  public stop() {
    if (this.server) {
      this.server.close(() => {
        console.log('[Dashboard] Servidor de monitoreo cerrado.');
      });
    }
  }
}