import fs from 'fs';
import path from 'path';

export interface LoggerConfig {
  storage: {
    strategy: 'memory' | 'sqlite' | 'postgresql';
    config: any; 
  };
  capture: {
    request_headers: boolean;
    request_body: boolean;
    response_body: boolean;
    response_headers: boolean;
    excluded_paths: string[];
    sensitive_headers: string[]; // ['authorization', 'cookie']
  };
  monitoring: {
    enabled: boolean;
    port?: number;
    auth?: {
      enabled: boolean;
      username?: string;
      password?: string;
    }
  };
}

// default config
const DEFAULT_CONFIG: LoggerConfig = {
  storage: {
    strategy: 'sqlite',
    config: { max_records: 5000 }
  },
  capture: {
    request_headers: true,
    request_body: true,
    response_body: false,
    response_headers: false,
    excluded_paths: [],
    sensitive_headers: ['authorization', 'cookie', 'password']
  },
  monitoring: {
    enabled: true,
    auth: { enabled: false }
  }
};

export class ConfigManager {
  private static instance: ConfigManager;
  private config: LoggerConfig;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): LoggerConfig {
    // find logger.config.json donde se instale
    const configPath = path.resolve(process.cwd(), 'logger.config.json');
    
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      try {
        const userConfig = JSON.parse(fileContent);
        //(TODO: deep merge)
        return { ...DEFAULT_CONFIG, ...userConfig };
      } catch (error) {
        console.error('Error parseando logger.config.json, usando defaults');
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  }

  public getConfig(): LoggerConfig {
    return this.config;
  }
}