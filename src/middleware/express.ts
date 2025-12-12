import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LogEntry } from '../storage/interface';
import { ConfigManager } from '../config/config-manager';
// import { Logger } from '../core/logger'; 

export const expressMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const config = ConfigManager.getInstance().getConfig();
  
  //excluded_paths
  if (config.capture.excluded_paths.some(p => req.path.startsWith(p))) {
    return next();
  }

  //timestamp UUID
  const startTime = process.hrtime();
  const requestId = uuidv4();
  const requestDate = new Date();

  // inyectar ID
  (req as any).id = requestId;
  res.setHeader('X-Request-ID', requestId);

  // guardar las referencias de los métodos
  const originalSend = res.send;
  const originalJson = res.json;
  
  // variable para acumular el body de respuesta
  let responseBody: any;

  // sobrescribir res.json
  res.json = function (body: any): Response {
    responseBody = body;
    // llamar al método original
    return originalJson.call(this, body);
  };

  // sobrescribir res.send 
  res.send = function (body: any): Response {
    // if json() fue agarrado, no sobrescribimos, else, esto
    if (responseBody === undefined) {
      responseBody = body;
    }
    return originalSend.call(this, body);
  };

  // lo que se supone que debería pasar si se le manda al cliente la respuesta
  res.on('finish', () => {
    try {
      // latency
      const diff = process.hrtime(startTime);
      const latencyMs = (diff[0] * 1000) + (diff[1] / 1e6);

      // headers 
      const safeReqHeaders = maskHeaders(req.headers, config.capture.sensitive_headers);
      const safeResHeaders = maskHeaders(res.getHeaders(), config.capture.sensitive_headers);

      // if mas de 500 caracteres probablemente sea un error
      let level: 'INFO' | 'WARNING' | 'ERROR' = 'INFO';
      if (res.statusCode >= 500) level = 'ERROR';
      else if (res.statusCode >= 400) level = 'WARNING';

      // logentry completo
      const logEntry: LogEntry = {
        id: requestId,
        timestamp: requestDate,
        method: req.method,
        path: req.path,
        status_code: res.statusCode,
        latency_ms: Math.round(latencyMs),
        client_ip: req.ip || req.socket.remoteAddress || 'unknown',
        user_agent: req.get('user-agent'),
        // captura condicional
        request_body: config.capture.request_body ? req.body : undefined,
        response_body: config.capture.response_body ? responseBody : undefined,
        metadata: {
          query: req.query,
          headers: config.capture.request_headers ? safeReqHeaders : undefined,
          response_headers: config.capture.response_headers ? safeResHeaders : undefined
        },
        level: level
      };

      const Logger = require('../core/logger').Logger;
      Logger.getInstance().save(logEntry);

    }  catch (error) {
      //catch error basico 
      console.error('Error interno en Logger Middleware:', error);
    }
  });

  next();
};

// ocultar sensitive headers
function maskHeaders(headers: any, sensitiveList: string[]) {
  const clean = { ...headers };
  sensitiveList.forEach(h => {
    if (clean[h] || clean[h.toLowerCase()]) {
      clean[h] = '***MASKED***';
      clean[h.toLowerCase()] = '***MASKED***';
    }
  });
  return clean;
}