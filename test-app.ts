import express, { Request, Response } from 'express';
import { ConfigManager } from './dist/config/config-manager';
import { Logger } from './dist/core/logger'; 
import { expressMiddleware } from './dist/middleware/express';
import { LogEntry } from './dist/storage/interface';

// 1. Inicializar el Logger Core (Esto también inicia el Dashboard Controller)
const logger = Logger.getInstance();

const app = express();
const PORT = 3000;

// Middleware necesario para Express
app.use(express.json()); // Necesario para leer req.body en POST/PUT

// 2. Conectar el Logger Middleware
// Esto debe ir ANTES de tus rutas para que capture todo
app.use(expressMiddleware); 

// Rutas de Prueba

// 1. Ruta de Éxito (200 OK)
app.get('/api/users', (req: Request, res: Response) => {
    // Simular un request con latencia
    setTimeout(() => {
        const users = [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
        ];
        res.status(200).json(users);
    }, Math.random() * 50); 
});

// 2. Ruta de Error 404
app.get('/api/not-found', (req: Request, res: Response) => {
    res.status(404).json({ message: 'Resource not found' });
});

// 3. Ruta de Error 500 (Internal Server Error)
app.get('/api/error', (req: Request, res: Response) => {
    // Simular un error interno
    logger.error('Database connection failed while processing /api/error');
    res.status(500).send('Internal Server Error');
});

// 4. Ruta con Captura de Body (POST)
app.post('/api/register', (req: Request, res: Response) => {
    // La información del body (req.body) será capturada por el middleware
    if (!req.body.username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    res.status(201).json({ 
        success: true, 
        message: `User ${req.body.username} registered successfully`
    });
});

// 5. Ejemplo de Log Manual (RF-05)
app.get('/api/manual-log', (req: Request, res: Response) => {
    logger.info('Este es un evento informativo generado manualmente.', {
        source: 'CustomService',
        user_id: 123
    });
    res.send('Logged manually!');
});
app.get('/', (req: Request, res: Response) => {
    res.send(`
        <h1>Logger API de Prueba Activa</h1>
        <p>Visita <a href="http://localhost:8080" target="_blank">http://localhost:8080</a> para ver el Dashboard de logs.</p>
        <p>Prueba las rutas: /api/users, /api/error, /api/manual-log</p>
    `);
});

const server = app.listen(PORT, () => {
    // 🛑 CORRECCIÓN: Usar ConfigManager.getInstance().getConfig()
    const config = ConfigManager.getInstance().getConfig();

    console.log(`Test API Running on: http://localhost:${PORT}`);
    console.log(`Logger Dashboard Running on: http://localhost:${config.monitoring.port || 8080}`);
    console.log('----------------------------------------------------');
    console.log('Visite el Dashboard y haga requests a la API para ver los logs.');
});

// Asegurar un apagado limpio (Graceful Shutdown)
process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    server.close(async () => {
        await logger.shutdown();
        console.log('All connections closed. Exiting.');
        process.exit(0);
    });
});
