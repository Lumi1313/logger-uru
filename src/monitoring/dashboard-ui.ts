//html con render en linea 56

export const DASHBOARD_HTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Logger Dashboard | Monitoreo</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; background-color: #f4f7f9; color: #333; }
        .container { max-width: 1200px; margin: 20px auto; padding: 0 20px; }
        h1 { color: #1e3a8a; border-bottom: 2px solid #eff3f6; padding-bottom: 10px; }
        .controls { display: flex; gap: 15px; margin-bottom: 20px; align-items: center; }
        .controls button, .controls select { padding: 8px 15px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; background-color: #fff; transition: background-color 0.2s; }
        .controls button:hover { background-color: #e6e6e6; }
        .log-list { background-color: #fff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden; }
        .log-item { padding: 15px; border-bottom: 1px solid #eee; cursor: pointer; }
        .log-item:last-child { border-bottom: none; }
        .log-header { display: flex; justify-content: space-between; font-weight: bold; }
        .log-meta { font-size: 0.9em; color: #666; }
        .log-body { margin-top: 10px; background-color: #f9f9f9; padding: 10px; border-radius: 4px; white-space: pre-wrap; word-break: break-all; font-family: monospace; font-size: 0.8em; display: none; }
        
        .level-INFO { color: #16a34a; }
        .level-WARNING { color: #f59e0b; }
        .level-ERROR { color: #dc2626; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Logger Dashboard</h1>
        
        <div class="controls">
            <select id="levelFilter">
                <option value="">Todos los Niveles</option>
                <option value="INFO">INFO</option>
                <option value="WARNING">WARNING</option>
                <option value="ERROR">ERROR</option>
            </select>
            <button id="loadMoreBtn">Cargar Más Logs</button>
            <p id="status" style="font-style: italic;"></p>
        </div>

        <div class="log-list" id="logList">
            </div>
    </div>

    <script>
        //lógica .js
        let currentCursor = null;
        const logList = document.getElementById('logList');
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        const levelFilter = document.getElementById('levelFilter');
        const statusEl = document.getElementById('status');
        
        //render log
        function renderLog(log) {
            const item = document.createElement('div');
            item.className = 'log-item';
            item.innerHTML = \`
                <div class="log-header">
                    <span><span class="level-\${log.level}">[\${log.level}]</span> \${log.method} \${log.path}</span>
                    <span>\${log.status_code || 'N/A'} (\${log.latency_ms || 0}ms)</span>
                </div>
                <div class="log-meta">
                    \${new Date(log.timestamp).toLocaleString()} | IP: \${log.client_ip || 'N/A'}
                </div>
                <div class="log-body">
                    <strong>ID:</strong> \${log.id}<br>
                    <strong>Request Body:</strong> \${JSON.stringify(log.request_body, null, 2) || 'N/A'}<br>
                    <strong>Response Body:</strong> \${JSON.stringify(log.response_body, null, 2) || 'N/A'}<br>
                    <strong>Metadata:</strong> \${JSON.stringify(log.metadata, null, 2) || 'N/A'}<br>
                    <strong>Error Msg:</strong> \${log.error_message || 'N/A'}
                </div>
            \`;
            
            //toggle para mostrar body
            item.addEventListener('click', () => {
                const body = item.querySelector('.log-body');
                body.style.display = body.style.display === 'block' ? 'none' : 'block';
            });
            
            return item;
        }
        
        //main function
        async function loadLogs(reset = false) {
            if (reset) {
                currentCursor = null;
                logList.innerHTML = '';
            }
            
            statusEl.textContent = 'Cargando...';
            loadMoreBtn.disabled = true;

            const selectedLevel = levelFilter.value;
            
            let url = \`/api/logs?limit=50\`;
            if (currentCursor) {
                url += \`&cursor=\${currentCursor}\`;
            }
            if (selectedLevel) {
                url += \`&level=\${selectedLevel}\`;
            }

            try {
                const response = await fetch(url);
                if (response.status === 401) {
                    statusEl.textContent = 'Error: No autorizado. Revise la autenticación.';
                    loadMoreBtn.style.display = 'none';
                    return;
                }
                const data = await response.json();
                
                if (data.data && data.data.length > 0) {
                    data.data.forEach(log => {
                        logList.appendChild(renderLog(log));
                    });
                    currentCursor = data.pagination.next_cursor;
                }
                
                if (data.pagination && !data.pagination.has_more) {
                    loadMoreBtn.textContent = 'No hay más logs';
                    loadMoreBtn.disabled = true;
                } else {
                    loadMoreBtn.textContent = 'Cargar Más Logs';
                    loadMoreBtn.disabled = false;
                }
                
                statusEl.textContent = \`Mostrando \${logList.children.length} logs. Total: \${data.pagination.total_count || 'N/A'}\`;

            } catch (error) {
                console.error('Error fetching logs:', error);
                statusEl.textContent = 'Error al cargar los logs. Verifique el servidor.';
                loadMoreBtn.disabled = false;
            }
        }
        
        //event listeners
        loadMoreBtn.addEventListener('click', () => loadLogs(false));
        levelFilter.addEventListener('change', () => loadLogs(true)); // Resetear al cambiar filtro

        //initial load
        document.addEventListener('DOMContentLoaded', () => loadLogs(true));
    </script>
</body>
</html>
`;