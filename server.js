const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
const app = express();

// Validar variáveis de ambiente
const requiredEnvVars = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGPORT'];
requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
        console.error(`Erro crítico: Variável de ambiente ${varName} não definida`);
        process.exit(1);
    }
});

console.log('Variáveis de ambiente:', {
    PGHOST: process.env.PGHOST,
    PGDATABASE: process.env.PGDATABASE,
    PGUSER: process.env.PGUSER,
    PGPORT: process.env.PGPORT
});

// Configuração do PostgreSQL
const pool = new Pool({
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT || 5432,
    ssl: process.env.PGHOST ? { rejectUnauthorized: false } : false,
    max: 10, // Reduzido para evitar esgotamento de conexões
    idleTimeoutMillis: 10000, // 10s para liberar conexões inativas
    connectionTimeoutMillis: 5000, // Aumentado para 5s
    maxUses: 7500, // Limita reutilização de conexões
    allowExitOnIdle: true // Importante para serverless
});

// Testar conexão ao iniciar
(async () => {
    try {
        const client = await pool.connect();
        console.log('Conexão ao banco Neon PostgreSQL bem-sucedida');
        const res = await client.query('SELECT NOW()', { timeout: 5000 });
        console.log('Resposta do banco:', res.rows[0]);
        client.release();
    } catch (err) {
        console.error('Erro ao conectar ao banco Neon:', err);
    }
})();

app.use(express.json());
app.use(express.static('public'));

// Endpoint para configurar o banco
app.get('/api/setup-database', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN', { timeout: 5000 });
        console.log('Criando tabelas...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                name TEXT,
                phone TEXT
            )
        `, { timeout: 5000 });
        await client.query(`
            CREATE TABLE IF NOT EXISTS barbers (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL
            )
        `, { timeout: 5000 });
        await client.query(`
            CREATE TABLE IF NOT EXISTS appointments (
                id SERIAL PRIMARY KEY,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                barber_id INTEGER NOT NULL,
                client_id INTEGER NOT NULL,
                FOREIGN KEY (barber_id) REFERENCES barbers(id),
                FOREIGN KEY (client_id) REFERENCES users(id)
            )
        `, { timeout: 5000 });
        await client.query(`
            CREATE TABLE IF NOT EXISTS recurring_appointments (
                id SERIAL PRIMARY KEY,
                barber_id INTEGER NOT NULL,
                client_id INTEGER NOT NULL,
                day_of_week INTEGER NOT NULL,
                time TIME NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                FOREIGN KEY (barber_id) REFERENCES barbers(id),
                FOREIGN KEY (client_id) REFERENCES users(id)
            )
        `, { timeout: 5000 });

        // Insere usuário admin padrão
        const adminRes = await client.query('SELECT * FROM users WHERE username = $1', ['admin']);
        if (adminRes.rows.length === 0) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await client.query(
                'INSERT INTO users (username, password, role, name, phone) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING',
                ['admin', hashedPassword, 'admin', 'Administrador', '123456789'],
                { timeout: 3000 }
            );
            console.log('Usuário admin criado com sucesso');
        }

        // Insere barbeiros padrão
        const barberRes = await client.query('SELECT * FROM barbers WHERE name = $1', ['João Silva']);
        if (barberRes.rows.length === 0) {
            await client.query('INSERT INTO barbers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', ['João Silva'], { timeout: 3000 });
            await client.query('INSERT INTO barbers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', ['Maria Santos'], { timeout: 3000 });
            console.log('Barbeiros padrão criados com sucesso');
        }

        await client.query('COMMIT', { timeout: 5000 });
        console.log('Tabelas e dados iniciais criados com sucesso');
        res.json({ message: 'Banco de dados configurado com sucesso' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erro ao configurar banco:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    } finally {
        client.release();
    }
});

// Endpoint de login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('Tentativa de login:', { username });

    if (!username || !password) {
        return res.status(400).json({ error: 'Username e senha são obrigatórios' });
    }

    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                'SELECT * FROM users WHERE username = $1',
                [username],
                { timeout: 3000 }
            );
            if (result.rows.length === 0) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }
            const user = result.rows[0];
            const isValid = await bcrypt.compare(password, user.password);
            if (!isValid) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }
            res.json({
                id: user.id,
                role: user.role,
                username: user.username,
                name: user.name,
                phone: user.phone
            });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint de cadastro
app.post('/api/register', async (req, res) => {
    const { username, password, name, phone } = req.body;
    console.log('Tentativa de cadastro:', { username, name, phone });

    if (!username || !password || !name) {
        return res.status(400).json({ error: 'Username, senha e nome são obrigatórios' });
    }

    try {
        const client = await pool.connect();
        try {
            const result = await client.query('SELECT * FROM users WHERE username = $1', [username], { timeout: 3000 });
            if (result.rows.length > 0) {
                return res.status(400).json({ error: 'Usuário já existe' });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            await client.query(
                'INSERT INTO users (username, password, role, name, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id',
                [username, hashedPassword, 'client', name, phone],
                { timeout: 3000 }
            );
            res.json({ message: 'Usuário registrado com sucesso' });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao registrar:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para listar clientes (para painel admin)
app.get('/api/users', async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            const result = await client.query('SELECT id, username, name, phone FROM users WHERE role = $1', ['client'], { timeout: 3000 });
            console.log('Clientes enviados:', result.rows);
            res.json(result.rows);
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao listar clientes:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para listar barbeiros
app.get('/api/barbers', async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            const result = await client.query('SELECT * FROM barbers', { timeout: 3000 });
            console.log('Barbeiros enviados:', result.rows);
            res.json(result.rows);
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao listar barbeiros:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para adicionar barbeiro
app.post('/api/barbers', async (req, res) => {
    const { name } = req.body;
    console.log('Tentativa de adicionar barbeiro:', { name });

    if (!name) {
        return res.status(400).json({ error: 'Nome do barbeiro é obrigatório' });
    }

    try {
        const client = await pool.connect();
        try {
            const result = await client.query('SELECT * FROM barbers WHERE name = $1', [name], { timeout: 3000 });
            if (result.rows.length > 0) {
                console.log('Barbeiro já existe:', name);
                return res.status(400).json({ error: 'Barbeiro já existe' });
            }
            await client.query('INSERT INTO barbers (name) VALUES ($1) RETURNING id', [name], { timeout: 3000 });
            console.log('Barbeiro adicionado com sucesso:', name);
            res.json({ message: 'Barbeiro adicionado com sucesso' });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao adicionar barbeiro:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para editar barbeiro
app.put('/api/barbers/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    console.log('Tentativa de editar barbeiro:', { id, name });

    if (!name) {
        return res.status(400).json({ error: 'Nome do barbeiro é obrigatório' });
    }

    try {
        const client = await pool.connect();
        try {
            const result = await client.query('SELECT * FROM barbers WHERE name = $1 AND id != $2', [name, id], { timeout: 3000 });
            if (result.rows.length > 0) {
                console.log('Nome de barbeiro já existe:', name);
                return res.status(400).json({ error: 'Nome de barbeiro já existe' });
            }
            const updateResult = await client.query('UPDATE barbers SET name = $1 WHERE id = $2 RETURNING id', [name, id], { timeout: 3000 });
            if (updateResult.rowCount === 0) {
                console.log('Barbeiro não encontrado:', id);
                return res.status(404).json({ error: 'Barbeiro não encontrado' });
            }
            console.log('Barbeiro editado com sucesso:', id);
            res.json({ message: 'Barbeiro editado com sucesso' });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao editar barbeiro:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para deletar barbeiro
app.delete('/api/barbers/:id', async (req, res) => {
    const { id } = req.params;
    console.log('Tentativa de deletar barbeiro:', { id });

    try {
        const client = await pool.connect();
        try {
            const result = await client.query('DELETE FROM barbers WHERE id = $1 RETURNING id', [id], { timeout: 3000 });
            if (result.rowCount === 0) {
                console.log('Barbeiro não encontrado:', id);
                return res.status(404).json({ error: 'Barbeiro não encontrado' });
            }
            console.log('Barbeiro deletado com sucesso:', id);
            res.json({ message: 'Barbeiro deletado com sucesso' });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao deletar barbeiro:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Middleware para verificar admin
function isAdmin(req, res, next) {
    const isAdminUser = req.query.isAdmin === 'true' || req.headers['x-is-admin'] === 'true';
    if (isAdminUser) {
        next();
    } else {
        res.status(403).json({ error: 'Acesso não autorizado' });
    }
}

// Endpoint para listar agendamentos
app.get('/api/appointments', async (req, res) => {
    const { barber_id, client_id, date, all, isAdmin } = req.query;

    let query = `
        SELECT a.id, a.date, a.time, a.barber_id, a.client_id, 
               b.name AS barber_name
    `;
    
    if (isAdmin === 'true') {
        query += `, u.name AS client_name, u.phone AS client_phone`;
    } else {
        query += `, 'Cliente' AS client_name, '' AS client_phone`;
    }
    
    query += `
        FROM appointments a
        JOIN barbers b ON a.barber_id = b.id
        JOIN users u ON a.client_id = u.id
    `;
    
    const params = [];
    let whereClauses = [];
    
    if (barber_id) {
        params.push(barber_id);
        whereClauses.push(`a.barber_id = $${params.length}`);
    }
    
    if (client_id && isAdmin === 'true') {
        params.push(client_id);
        whereClauses.push(`a.client_id = $${params.length}`);
    }
    
    if (date) {
        params.push(date);
        whereClauses.push(`a.date = $${params.length}`);
    }
    
    if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`;
    }
    
    query += ` ORDER BY a.date, a.time`;
    
    console.log('Executando query de agendamentos:', query, 'com params:', params);
    
    try {
        const client = await pool.connect();
        try {
            const result = await client.query(query, params, { timeout: 3000 });
            console.log('Agendamentos encontrados:', result.rows.length);
            res.json(result.rows);
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao buscar agendamentos:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para verificar se horário está ocupado
app.get('/api/appointments/check', async (req, res) => {
    const { barber_id, date, time, isAdmin } = req.query;
    console.log('Verificando horário:', { barber_id, date, time });
    
    if (!barber_id || !date || !time) {
        return res.status(400).json({ error: 'Parâmetros barber_id, date e time são obrigatórios' });
    }
    
    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                'SELECT * FROM appointments WHERE barber_id = $1 AND date = $2 AND time = $3',
                [barber_id, date, time],
                { timeout: 3000 }
            );
            const isBooked = result.rows.length > 0;
            let appointmentInfo = null;
            
            if (isBooked && isAdmin === 'true') {
                appointmentInfo = result.rows[0];
            } else if (isBooked) {
                appointmentInfo = { isBooked: true };
            }
            
            res.json({ 
                isBooked: isBooked,
                appointment: appointmentInfo
            });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao verificar horário:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para criar agendamento
app.post('/api/appointments', async (req, res) => {
    const { date, time, barber_id, client_id } = req.body;
    console.log('Tentativa de criar agendamento:', { date, time, barber_id, client_id });
    
    if (!date || !time || !barber_id || !client_id) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }
    
    try {
        const client = await pool.connect();
        try {
            const checkResult = await client.query(
                'SELECT * FROM appointments WHERE barber_id = $1 AND date = $2 AND time = $3',
                [barber_id, date, time],
                { timeout: 3000 }
            );
            
            if (checkResult.rows.length > 0) {
                console.log('Horário já ocupado:', { barber_id, date, time });
                return res.status(400).json({ 
                    error: 'Horário já ocupado',
                    existingAppointment: checkResult.rows[0]
                });
            }
            
            const result = await client.query(
                'INSERT INTO appointments (date, time, barber_id, client_id) VALUES ($1, $2, $3, $4) RETURNING id',
                [date, time, barber_id, client_id],
                { timeout: 3000 }
            );
            
            console.log('Agendamento criado com ID:', result.rows[0].id);
            res.json({ 
                message: 'Agendamento criado com sucesso',
                appointmentId: result.rows[0].id
            });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao criar agendamento:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para criar horário recorrente
app.post('/api/recurring-appointments', async (req, res) => {
    const { barber_id, client_id, day_of_week, time, start_date, end_date } = req.body;
    
    if (!barber_id || !client_id || !day_of_week || !time || !start_date) {
        return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser fornecidos' });
    }

    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO recurring_appointments 
                 (barber_id, client_id, day_of_week, time, start_date, end_date) 
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [barber_id, client_id, day_of_week, time, start_date, end_date],
                { timeout: 3000 }
            );
            res.json(result.rows[0]);
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao criar horário recorrente:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para listar horários recorrentes
app.get('/api/recurring-appointments', async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT ra.*, b.name as barber_name, u.name as client_name, u.phone as client_phone
                FROM recurring_appointments ra
                JOIN barbers b ON ra.barber_id = b.id
                JOIN users u ON ra.client_id = u.id
                WHERE ra.is_active = true
                ORDER BY ra.day_of_week, ra.time
            `, { timeout: 3000 });
            res.json(result.rows);
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao listar horários recorrentes:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para desativar horário recorrente
app.put('/api/recurring-appointments/:id/deactivate', async (req, res) => {
    const { id } = req.params;
    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                'UPDATE recurring_appointments SET is_active = false WHERE id = $1 RETURNING id',
                [id],
                { timeout: 3000 }
            );
            if (result.rowCount === 0) {
                return res.status(404).json({ error: 'Horário recorrente não encontrado' });
            }
            res.json({ message: 'Horário recorrente desativado' });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao desativar horário recorrente:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para gerar agendamentos automaticamente
app.post('/api/generate-recurring-appointments', async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            const recurring = await client.query(`
                SELECT * FROM recurring_appointments 
                WHERE is_active = true 
                AND start_date <= CURRENT_DATE
                AND (end_date IS NULL OR end_date >= CURRENT_DATE)
            `, { timeout: 3000 });

            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];
            const values = [];
            const params = [];

            recurring.rows.forEach((appointment, index) => {
                if (today.getDay() === appointment.day_of_week) {
                    params.push(
                        appointment.barber_id,
                        dateStr,
                        appointment.time,
                        appointment.client_id
                    );
                    values.push(`($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`);
                }
            });

            if (values.length > 0) {
                const existing = await client.query(`
                    SELECT barber_id, date, time 
                    FROM appointments 
                    WHERE (barber_id, date, time) IN (
                        ${values.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3})`).join(',')}
                    )
                `, params, { timeout: 3000 });

                const existingSet = new Set(existing.rows.map(row => `${row.barber_id}-${row.date}-${row.time}`));
                const insertValues = values.filter((_, i) => {
                    const key = `${params[i * 4]}-${params[i * 4 + 1]}-${params[i * 4 + 2]}`;
                    return !existingSet.has(key);
                });

                if (insertValues.length > 0) {
                    await client.query(`
                        INSERT INTO appointments (barber_id, date, time, client_id)
                        VALUES ${insertValues.join(',')}
                    `, params, { timeout: 3000 });
                }
            }

            res.json({ message: 'Agendamentos recorrentes verificados', count: insertValues.length });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao gerar agendamentos recorrentes:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para deletar agendamento
app.delete('/api/appointments/:id', async (req, res) => {
    const { id } = req.params;
    console.log('Tentativa de deletar agendamento:', { id });
    
    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                'DELETE FROM appointments WHERE id = $1 RETURNING id, barber_id, date, time',
                [id],
                { timeout: 3000 }
            );
            
            if (result.rowCount === 0) {
                console.log('Agendamento não encontrado:', id);
                return res.status(404).json({ error: 'Agendamento não encontrado' });
            }
            
            const deletedAppointment = result.rows[0];
            console.log('Agendamento deletado com sucesso:', deletedAppointment);
            
            res.json({ 
                message: 'Agendamento deletado com sucesso',
                deletedAppointment: deletedAppointment
            });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao deletar agendamento:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para buscar agendamentos por data e barbeiro
app.get('/api/appointments/simple', async (req, res) => {
    const { barber_id, date } = req.query;
    
    if (!barber_id || !date) {
        return res.status(400).json({ error: 'Parâmetros barber_id e date são obrigatórios' });
    }
    
    try {
        const client = await pool.connect();
        try {
            const result = await client.query(
                `SELECT a.time 
                 FROM appointments a 
                 WHERE a.barber_id = $1 AND a.date = $2 
                 ORDER BY a.time`,
                [barber_id, date],
                { timeout: 3000 }
            );
            
            const occupiedTimes = result.rows.map(row => row.time);
            res.json(occupiedTimes);
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao buscar agendamentos por data:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));