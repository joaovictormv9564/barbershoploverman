const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();

// Validar variáveis de ambiente
const requiredEnvVars = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGPORT'];
requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
        console.error(`Erro crítico: Variável de ambiente ${varName} não definida`);
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
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
});

// Testar conexão ao iniciar
(async () => {
    try {
        const client = await pool.connect();
        console.log('Conexão ao banco Neon PostgreSQL bem-sucedida');
        const res = await client.query('SELECT NOW()');
        console.log('Resposta do banco:', res.rows[0]);
        client.release();
    } catch (err) {
        console.error('Erro ao conectar ao banco Neon:', err);
    }
})();

app.use(express.json());
app.use(express.static('public'));

// Criação das tabelas
(async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
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
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS barbers (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL
            )
        `);
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
        `);

        // Insere usuário admin padrão
        const adminRes = await client.query('SELECT * FROM users WHERE username = $1', ['admin']);
        if (adminRes.rows.length === 0) {
            await client.query(
                'INSERT INTO users (username, password, role, name, phone) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING',
                ['admin', 'admin123', 'admin', 'Administrador', '123456789']
            );
            console.log('Usuário admin criado com sucesso');
        }

        // Insere barbeiros padrão
        const barberRes = await client.query('SELECT * FROM barbers WHERE name = $1', ['João Silva']);
        if (barberRes.rows.length === 0) {
            await client.query('INSERT INTO barbers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', ['João Silva']);
            await client.query('INSERT INTO barbers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', ['Maria Santos']);
            console.log('Barbeiros padrão criados com sucesso');
        }

        await client.query('COMMIT');
        console.log('Tabelas e dados iniciais criados com sucesso');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erro ao criar tabelas ou inserir dados iniciais:', err);
    } finally {
        client.release();
    }
})();

// tabela de horarios recorrentes
app.get('/api/create-recurring-table', async (req, res) => {
    try {
        const client = await pool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS recurring_appointments (
                id SERIAL PRIMARY KEY,
                barber_id INTEGER NOT NULL,
                client_id INTEGER NOT NULL,
                day_of_week INTEGER NOT NULL, -- 0=Domingo, 1=Segunda, ..., 6=Sábado
                time TIME NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                FOREIGN KEY (barber_id) REFERENCES barbers(id),
                FOREIGN KEY (client_id) REFERENCES users(id)
            )
        `);
        client.release();
        res.json({ message: 'Tabela de horários recorrentes criada' });
    } catch (err) {
        console.error('Erro ao criar tabela:', err);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint de login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('Tentativa de login:', { username });
    try {
        const client = await pool.connect();
        const result = await client.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2',
            [username, password]
        );
        client.release();
        if (result.rows.length === 0) {
            console.log('Credenciais inválidas para:', username);
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        console.log('Usuário encontrado:', result.rows[0]);
        res.json({ 
            id: result.rows[0].id, 
            role: result.rows[0].role, 
            username: result.rows[0].username,
            name: result.rows[0].name,
            phone: result.rows[0].phone
        });
    } catch (err) {
        console.error('Erro no login:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint de cadastro
app.post('/api/register', async (req, res) => {
    const { username, password, name, phone } = req.body;
    console.log('Tentativa de cadastro:', { username, name, phone });
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            client.release();
            console.log('Usuário já existe:', username);
            return res.status(400).json({ error: 'Usuário já existe' });
        }
        await client.query(
            'INSERT INTO users (username, password, role, name, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [username, password, 'client', name, phone]
        );
        client.release();
        console.log('Usuário registrado com sucesso:', username);
        res.json({ message: 'Usuário registrado com sucesso' });
    } catch (err) {
        console.error('Erro ao registrar:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para listar clientes (para painel admin)
app.get('/api/users', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT id, username, name, phone FROM users WHERE role = $1', ['client']);
        client.release();
        console.log('Clientes enviados:', result.rows);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao listar clientes:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para listar barbeiros
app.get('/api/barbers', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM barbers');
        client.release();
        console.log('Barbeiros enviados:', result.rows);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao listar barbeiros:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para adicionar barbeiro
app.post('/api/barbers', async (req, res) => {
    const { name } = req.body;
    console.log('Tentativa de adicionar barbeiro:', { name });
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM barbers WHERE name = $1', [name]);
        if (result.rows.length > 0) {
            client.release();
            console.log('Barbeiro já existe:', name);
            return res.status(400).json({ error: 'Barbeiro já existe' });
        }
        await client.query('INSERT INTO barbers (name) VALUES ($1) RETURNING id', [name]);
        client.release();
        console.log('Barbeiro adicionado com sucesso:', name);
        res.json({ message: 'Barbeiro adicionado com sucesso' });
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
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM barbers WHERE name = $1 AND id != $2', [name, id]);
        if (result.rows.length > 0) {
            client.release();
            console.log('Nome de barbeiro já existe:', name);
            return res.status(400).json({ error: 'Nome de barbeiro já existe' });
        }
        const updateResult = await client.query('UPDATE barbers SET name = $1 WHERE id = $2 RETURNING id', [name, id]);
        client.release();
        if (updateResult.rowCount === 0) {
            console.log('Barbeiro não encontrado:', id);
            return res.status(404).json({ error: 'Barbeiro não encontrado' });
        }
        console.log('Barbeiro editado com sucesso:', id);
        res.json({ message: 'Barbeiro editado com sucesso' });
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
        const result = await client.query('DELETE FROM barbers WHERE id = $1 RETURNING id', [id]);
        client.release();
        if (result.rowCount === 0) {
            console.log('Barbeiro não encontrado:', id);
            return res.status(404).json({ error: 'Barbeiro não encontrado' });
        }
        console.log('Barbeiro deletado com sucesso:', id);
        res.json({ message: 'Barbeiro deletado com sucesso' });
    } catch (err) {
        console.error('Erro ao deletar barbeiro:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});
function isAdmin(req, res, next) {
    idade
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
    
    // Somente admins veem informações do cliente
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
        // Somente admins podem filtrar por client_id
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
        const result = await client.query(query, params);
        client.release();
        console.log('Agendamentos encontrados:', result.rows.length);
        res.json(result.rows);
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
        const result = await client.query(
            'SELECT * FROM appointments WHERE barber_id = $1 AND date = $2 AND time = $3',
            [barber_id, date, time]
        );
        client.release();
        
        const isBooked = result.rows.length > 0;
        let appointmentInfo = null;
        
        if (isBooked && isAdmin === 'true') {
            // Somente admins veem detalhes do agendamento
            appointmentInfo = result.rows[0];
        } else if (isBooked) {
            
            appointmentInfo = { isBooked: true };
        }
        
        res.json({ 
            isBooked: isBooked,
            appointment: appointmentInfo
        });
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
        
        // Verificar se o horário já está ocupado
        const checkResult = await client.query(
            'SELECT * FROM appointments WHERE barber_id = $1 AND date = $2 AND time = $3',
            [barber_id, date, time]
        );
        
        if (checkResult.rows.length > 0) {
            client.release();
            console.log('Horário já ocupado:', { barber_id, date, time });
            return res.status(400).json({ 
                error: 'Horário já ocupado',
                existingAppointment: checkResult.rows[0]
            });
        }
        
        // Criar o agendamento
        const result = await client.query(
            'INSERT INTO appointments (date, time, barber_id, client_id) VALUES ($1, $2, $3, $4) RETURNING id',
            [date, time, barber_id, client_id]
        );
        
        client.release();
        console.log('Agendamento criado com ID:', result.rows[0].id);
        res.json({ 
            message: 'Agendamento criado com sucesso',
            appointmentId: result.rows[0].id
        });
    } catch (err) {
        console.error('Erro ao criar agendamento:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para criar horário recorrente
app.post('/api/recurring-appointments', async (req, res) => {
    const { barber_id, client_id, day_of_week, time, start_date, end_date } = req.body;
    
    try {
        const client = await pool.connect();
        const result = await client.query(
            `INSERT INTO recurring_appointments 
             (barber_id, client_id, day_of_week, time, start_date, end_date) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [barber_id, client_id, day_of_week, time, start_date, end_date]
        );
        client.release();
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para listar horários recorrentes
app.get('/api/recurring-appointments', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query(`
            SELECT ra.*, b.name as barber_name, u.name as client_name, u.phone as client_phone
            FROM recurring_appointments ra
            JOIN barbers b ON ra.barber_id = b.id
            JOIN users u ON ra.client_id = u.id
            WHERE ra.is_active = true
            ORDER BY ra.day_of_week, ra.time
        `);
        client.release();
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para desativar horário recorrente
app.put('/api/recurring-appointments/:id/deactivate', async (req, res) => {
    try {
        const client = await pool.connect();
        await client.query(
            'UPDATE recurring_appointments SET is_active = false WHERE id = $1',
            [req.params.id]
        );
        client.release();
        res.json({ message: 'Horário recorrente desativado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// endpoint para gerar agendamentos automaticamente
app.post('/api/generate-recurring-appointments', async (req, res) => {
    try {
        const client = await pool.connect();
        
        // Buscar horários recorrentes ativos
        const recurring = await client.query(`
            SELECT * FROM recurring_appointments 
            WHERE is_active = true 
            AND start_date <= CURRENT_DATE
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)
        `);
        
        for (const appointment of recurring.rows) {
            // Verificar se hoje é o dia da semana correto
            const today = new Date();
            if (today.getDay() === appointment.day_of_week) {
                const dateStr = today.toISOString().split('T')[0];
                
                // Verificar se o agendamento já existe
                const existing = await client.query(
                    'SELECT * FROM appointments WHERE barber_id = $1 AND date = $2 AND time = $3',
                    [appointment.barber_id, dateStr, appointment.time]
                );
                
                if (existing.rows.length === 0) {
                    // Criar agendamento
                    await client.query(
                        'INSERT INTO appointments (date, time, barber_id, client_id) VALUES ($1, $2, $3, $4)',
                        [dateStr, appointment.time, appointment.barber_id, appointment.client_id]
                    );
                }
            }
        }
        
        client.release();
        res.json({ message: 'Agendamentos recorrentes verificados' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para deletar agendamento
app.delete('/api/appointments/:id', async (req, res) => {
    const { id } = req.params;
    console.log('Tentativa de deletar agendamento:', { id });
    
    try {
        const client = await pool.connect();
        const result = await client.query(
            'DELETE FROM appointments WHERE id = $1 RETURNING id, barber_id, date, time',
            [id]
        );
        
        client.release();
        
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
        console.error('Erro ao deletar agendamento:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

// Endpoint para buscar agendamentos por data e barbeiro (sem informações de cliente)
app.get('/api/appointments/simple', async (req, res) => {
    const { barber_id, date } = req.query;
    
    if (!barber_id || !date) {
        return res.status(400).json({ error: 'Parâmetros barber_id e date são obrigatórios' });
    }
    
    try {
        const client = await pool.connect();
        const result = await client.query(
            `SELECT a.time 
             FROM appointments a 
             WHERE a.barber_id = $1 AND a.date = $2 
             ORDER BY a.time`,
            [barber_id, date]
        );
        
        client.release();
        
        // Retorna apenas os horários ocupados
        const occupiedTimes = result.rows.map(row => row.time);
        res.json(occupiedTimes);
    } catch (err) {
        console.error('Erro ao buscar agendamentos por data:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));