require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();

// Configuração do pool de conexão com o banco Neon
const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    }
    : {
        host: process.env.PGHOST,
        database: process.env.PGDATABASE,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        port: process.env.PGPORT || 5432,
        ssl: { rejectUnauthorized: false },
    };

const pool = new Pool({
    ...poolConfig,
    max: 5, // Reduzido para Vercel
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: process.env.VERCEL ? 10000 : 2000, // Mais tempo no Vercel
    keepAlive: true
});

// Verificar variáveis de ambiente
if (!process.env.DATABASE_URL) {
    const requiredEnvVars = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGPORT'];
    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingVars.length > 0) {
        console.error(`Erro: Variáveis de ambiente ausentes: ${missingVars.join(', ')}`);
    }
}

// Manipular erros inesperados no pool
pool.on('error', (err, client) => {
    console.error('Erro inesperado no pool de conexões:', {
        message: err.message,
        stack: err.stack,
        code: err.code,
        detail: err.detail
    });
});

// Configurar middlewares
app.use(express.static('public'));
app.use(express.json());
app.use(cors({
    origin: ['http://localhost:3000', 'https://barbershoploverman.vercel.app'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

// Função para configurar tabelas
async function setupTables() {
    console.log('Iniciando configuração das tabelas...');
    let client;
    try {
        client = await pool.connect();
        console.log('Conexão com o banco Neon estabelecida com sucesso');

        // Criar tabela users
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                name TEXT,
                phone TEXT
            );
        `);
        console.log('Tabela users criada ou já existe.');

        // Criar tabela barbers
        await client.query(`
            CREATE TABLE IF NOT EXISTS barbers (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL
            );
        `);
        console.log('Tabela barbers criada ou já existe.');

        // Criar tabela appointments
        await client.query(`
            CREATE TABLE IF NOT EXISTS appointments (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                time TIME NOT NULL,
                barber_id INTEGER REFERENCES barbers(id),
                client_id INTEGER REFERENCES users(id)
            );
        `);
        console.log('Tabela appointments criada ou já existe.');

        // Verificar e criar usuário admin
        const adminResult = await client.query('SELECT 1 FROM users WHERE username = $1', ['admin']);
        if (adminResult.rowCount === 0) {
            console.log('Criando usuário admin...');
            await client.query(
                'INSERT INTO users (username, password, role, name, phone) VALUES ($1, $2, $3, $4, $5)',
                ['admin', 'admin123', 'admin', 'Administrador', '123456789']
            );
            console.log('Usuário admin criado com sucesso');
        } else {
            console.log('Usuário admin já existe, pulando criação.');
        }

        // Verificar e criar barbeiros iniciais
        const barbersResult = await client.query('SELECT 1 FROM barbers LIMIT 1');
        if (barbersResult.rowCount === 0) {
            console.log('Criando barbeiros iniciais...');
            await client.query(
                'INSERT INTO barbers (name) VALUES ($1), ($2)',
                ['João Silva', 'Maria Santos']
            );
            console.log('Barbeiros iniciais criados com sucesso');
        } else {
            console.log('Barbeiros já existem, pulando criação.');
        }
    } catch (err) {
        console.error('Erro ao executar setupTables:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: process.env.VERCEL_INVOCATION_ID || 'unknown'
        });
        throw err;
    } finally {
        if (client) {
            await client.release();
            console.log('Conexão liberada com sucesso');
        }
    }
}

// Endpoint de health check
app.get('/api/health', async (req, res) => {
    let client;
    try {
        console.log('Verificando health check...', {
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        client = await pool.connect();
        await client.query('SELECT 1');
        console.log('Conexão com o banco bem-sucedida', {
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(200).json({ status: 'OK', database: 'connected' });
    } catch (err) {
        console.error('Erro no health check:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(500).json({ 
            status: 'ERROR', 
            error: 'Falha na conexão com o banco', 
            details: err.message || 'Erro desconhecido',
            code: err.code || 'UNKNOWN',
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
    } finally {
        if (client) client.release();
    }
});

// Endpoint de login
app.post('/api/login', async (req, res) => {
    console.log('Requisição recebida em /api/login:', req.body, {
        vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
    });

    const { username, password } = req.body;

    if (!username || !password) {
        console.log('Erro: Usuário ou senha não fornecidos', {
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    let client;
    try {
        console.log('Conectando ao banco para /api/login', {
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        client = await pool.connect();
        await client.query('SELECT 1');

        console.log('Verificando existência da tabela users', {
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        const tableCheck = await client.query(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)",
            ['users']
        );
        if (!tableCheck.rows[0].exists) {
            console.error('Tabela users não encontrada', {
                vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
            });
            return res.status(500).json({ error: 'Erro interno do servidor', details: 'Tabela users não encontrada' });
        }

        console.log('Consultando usuário:', username, {
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        const result = await client.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user) {
            console.log('Usuário não encontrado:', username, {
                vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
            });
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        console.log('Verificando senha para usuário:', username, {
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        if (password !== user.password) {
            console.log('Senha incorreta para usuário:', username, {
                vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
            });
            return res.status(401).json({ error: 'Senha incorreta' });
        }

        console.log('Login bem-sucedido para usuário:', username, {
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(200).json({
            message: 'Login bem-sucedido',
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                name: user.name
            }
        });
    } catch (err) {
        console.error('Erro no endpoint /api/login:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(500).json({ 
            error: 'Erro interno do servidor', 
            details: err.message || 'Falha ao processar login',
            code: err.code || 'UNKNOWN',
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
    } finally {
        if (client) client.release();
    }
});

// Endpoint de cadastro
app.post('/api/register', async (req, res) => {
    const { username, password, name, phone } = req.body;
    console.log('Tentativa de cadastro:', { username, name, phone });
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            console.log('Usuário já existe:', username);
            return res.status(400).json({ error: 'Usuário já existe' });
        }
        await client.query(
            'INSERT INTO users (username, password, role, name, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [username, password, 'client', name, phone]
        );
        console.log('Usuário registrado com sucesso:', username);
        res.json({ message: 'Usuário registrado com sucesso' });
    } catch (err) {
        console.error('Erro ao registrar:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    } finally {
        if (client) client.release();
    }
});

// Endpoint para listar clientes (para painel admin)
app.get('/api/users', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT id, username, name, phone FROM users WHERE role = $1', ['client']);
        console.log('Clientes enviados:', result.rows);
        res.json(result.rows || []);
    } catch (err) {
        console.error('Erro ao listar clientes:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    } finally {
        if (client) client.release();
    }
});

// Endpoint para listar barbeiros
app.get('/api/barbers', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT * FROM barbers');
        console.log('Barbeiros enviados:', result.rows);
        res.json(result.rows || []);
    } catch (err) {
        console.error('Erro ao listar barbeiros:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    } finally {
        if (client) client.release();
    }
});

// Endpoint para adicionar barbeiro
app.post('/api/barbers', async (req, res) => {
    const { name } = req.body;
    console.log('Tentativa de adicionar barbeiro:', { name });
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT * FROM barbers WHERE name = $1', [name]);
        if (result.rows.length > 0) {
            console.log('Barbeiro já existe:', name);
            return res.status(400).json({ error: 'Barbeiro já existe' });
        }
        await client.query('INSERT INTO barbers (name) VALUES ($1) RETURNING id', [name]);
        console.log('Barbeiro adicionado com sucesso:', name);
        res.json({ message: 'Barbeiro adicionado com sucesso' });
    } catch (err) {
        console.error('Erro ao adicionar barbeiro:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    } finally {
        if (client) client.release();
    }
});

// Endpoint para editar barbeiro
app.put('/api/barbers/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    console.log('Tentativa de editar barbeiro:', { id, name });
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT * FROM barbers WHERE name = $1 AND id != $2', [name, id]);
        if (result.rows.length > 0) {
            console.log('Nome de barbeiro já existe:', name);
            return res.status(400).json({ error: 'Nome de barbeiro já existe' });
        }
        const updateResult = await client.query('UPDATE barbers SET name = $1 WHERE id = $2 RETURNING id', [name, id]);
        if (updateResult.rowCount === 0) {
            console.log('Barbeiro não encontrado:', id);
            return res.status(404).json({ error: 'Barbeiro não encontrado' });
        }
        console.log('Barbeiro editado com sucesso:', id);
        res.json({ message: 'Barbeiro editado com sucesso' });
    } catch (err) {
        console.error('Erro ao editar barbeiro:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    } finally {
        if (client) client.release();
    }
});

// Endpoint para deletar barbeiro
app.delete('/api/barbers/:id', async (req, res) => {
    const { id } = req.params;
    console.log('Tentativa de deletar barbeiro:', { id });
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('DELETE FROM barbers WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            console.log('Barbeiro não encontrado:', id);
            return res.status(404).json({ error: 'Barbeiro não encontrado' });
        }
        console.log('Barbeiro deletado com sucesso:', id);
        res.json({ message: 'Barbeiro deletado com sucesso' });
    } catch (err) {
        console.error('Erro ao deletar barbeiro:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    } finally {
        if (client) client.release();
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
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(query, params);
        console.log('Agendamentos encontrados:', result.rows.length);
        res.json(result.rows || []);
    } catch (err) {
        console.error('Erro ao buscar agendamentos:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    } finally {
        if (client) client.release();
    }
});

// Endpoint para verificar se horário está ocupado
app.get('/api/appointments/check', async (req, res) => {
    const { barber_id, date, time, isAdmin } = req.query;
    console.log('Verificando horário:', { barber_id, date, time });
    if (!barber_id || !date || !time) {
        return res.status(400).json({ error: 'Parâmetros barber_id, date e time são obrigatórios' });
    }
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM appointments WHERE barber_id = $1 AND date = $2 AND time = $3',
            [barber_id, date, time]
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
    } catch (err) {
        console.error('Erro ao verificar horário:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    } finally {
        if (client) client.release();
    }
});

// Endpoint para criar agendamento
app.post('/api/appointments', async (req, res) => {
    const { date, time, barber_id, client_id, is_recurring } = req.body;
    console.log('Tentativa de criar agendamento:', { date, time, barber_id, client_id, is_recurring });
    if (!date || !time || !barber_id || !client_id) {
        console.log('Campos obrigatórios faltando:', { date, time, barber_id, client_id });
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Validar barber_id e client_id
        const barberCheck = await client.query('SELECT id FROM barbers WHERE id = $1', [barber_id]);
        if (barberCheck.rows.length === 0) {
            console.log('Barbeiro não encontrado:', barber_id);
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Barbeiro não encontrado' });
        }
        const clientCheck = await client.query('SELECT id FROM users WHERE id = $1 AND role = $2', [client_id, 'client']);
        if (clientCheck.rows.length === 0) {
            console.log('Cliente não encontrado:', client_id);
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Cliente não encontrado' });
        }

        // Validar formato de data e hora
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
            console.log('Formato de data ou hora inválido:', { date, time });
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Formato de data (YYYY-MM-DD) ou hora (HH:MM) inválido' });
        }

        // Verificar se o agendamento inicial está ocupado
        const checkResult = await client.query(
            'SELECT * FROM appointments WHERE barber_id = $1 AND date = $2 AND time = $3',
            [barber_id, date, time]
        );
        if (checkResult.rows.length > 0) {
            console.log('Horário já ocupado:', { barber_id, date, time });
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Horário já ocupado', existingAppointment: checkResult.rows[0] });
        }

        // Inserir o agendamento inicial
        const result = await client.query(
            'INSERT INTO appointments (date, time, barber_id, client_id) VALUES ($1, $2, $3, $4) RETURNING id',
            [date, time, barber_id, client_id]
        );
        const appointmentId = result.rows[0].id;
        console.log('Agendamento inicial criado com ID:', appointmentId);

        // Se for recorrente, criar agendamentos para o mesmo dia da semana até 31/12/2025
        let recurringCount = 0;
        if (is_recurring) {
            const startDate = new Date(date);
            if (isNaN(startDate.getTime())) {
                console.log('Data inicial inválida:', date);
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Data inicial inválida' });
            }
            const endDate = new Date('2025-12-31');
            const values = [];
            const params = [];
            let paramIndex = 1;
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 7)) {
                if (d > startDate) {
                    const dateStr = d.toISOString().split('T')[0];
                    params.push(barber_id, dateStr, time, client_id);
                    values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
                }
            }
            if (values.length > 0) {
                const conflictParams = [barber_id, ...params.filter((_, i) => i % 4 === 1 || i % 4 === 2)];
                const conflictValues = values.map((_, i) => `($${i * 2 + 2}, $${i * 2 + 3})`).join(',');
                const conflictCheck = await client.query(
                    `SELECT date, time FROM appointments WHERE barber_id = $1 AND (date, time) IN (${conflictValues})`,
                    conflictParams
                );
                if (conflictCheck.rows.length > 0) {
                    console.log('Conflitos encontrados em agendamentos recorrentes:', conflictCheck.rows);
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Um ou mais horários recorrentes já estão ocupados', conflicts: conflictCheck.rows });
                }
                await client.query(
                    `INSERT INTO appointments (barber_id, date, time, client_id) VALUES ${values.join(',')}`,
                    params
                );
                recurringCount = values.length / 4;
                console.log(`Inseridos ${recurringCount} agendamentos recorrentes`);
            }
        }

        await client.query('COMMIT');
        res.json({
            message: 'Agendamento criado com sucesso',
            appointmentId,
            recurringCount
        });
    } catch (err) {
        console.error('Erro ao criar agendamento:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        await client.query('ROLLBACK').catch(rollbackErr => {
            console.error('Erro ao executar ROLLBACK:', rollbackErr);
        });
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    } finally {
        if (client) client.release();
    }
});

// Endpoint para deletar agendamento
app.delete('/api/appointments/:id', async (req, res) => {
    const { id } = req.params;
    console.log('Tentativa de deletar agendamento:', { id });
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            'DELETE FROM appointments WHERE id = $1 RETURNING id, barber_id, date, time',
            [id]
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
    } catch (err) {
        console.error('Erro ao deletar agendamento:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    } finally {
        if (client) client.release();
    }
});

// Endpoint para buscar agendamentos por data e barbeiro (sem informações de cliente)
app.get('/api/appointments/simple', async (req, res) => {
    const { barber_id, date } = req.query;
    if (!barber_id || !date) {
        return res.status(400).json({ error: 'Parâmetros barber_id e date são obrigatórios' });
    }
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(
            `SELECT a.time 
             FROM appointments a 
             WHERE a.barber_id = $1 AND a.date = $2 
             ORDER BY a.time`,
            [barber_id, date]
        );
        const occupiedTimes = result.rows.map(row => row.time);
        res.json(occupiedTimes);
    } catch (err) {
        console.error('Erro ao buscar agendamentos por data:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
        });
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    } finally {
        if (client) client.release();
    }
});

// Middleware para capturar erros globais (deve ser o último)
app.use((err, req, res, next) => {
    console.error('Erro global capturado:', {
        message: err.message,
        stack: err.stack,
        code: err.code,
        detail: err.detail,
        path: req.path,
        method: req.method,
        vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
    });
    res.status(500).json({
        error: 'Erro interno do servidor',
        details: err.message || 'Erro desconhecido',
        code: err.code || 'UNKNOWN',
        vercelInvocationId: req.headers['x-vercel-id'] || 'unknown'
    });
});

// Iniciar servidor
const port = process.env.PORT || 3000;
async function startServer() {
    try {
        console.log('Iniciando servidor, verificando banco...');
        const client = await pool.connect();
        try {
            await client.query('SELECT 1');
            console.log('Conexão com o banco confirmada, chamando setupTables...');
            await setupTables();
            app.listen(port, () => {
                console.log(`Servidor rodando em http://localhost:${port}`);
            });
        } finally {
            client.release();
            console.log('Conexão inicial liberada com sucesso');
        }
    } catch (err) {
        console.error('Erro ao iniciar o servidor:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            vercelInvocationId: process.env.VERCEL_INVOCATION_ID || 'unknown'
        });
        process.exit(1);
    }
}
startServer();