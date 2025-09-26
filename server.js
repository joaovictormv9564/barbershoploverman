require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();
const bcrypt = require('bcryptjs');



// Configuração do pool do PostgreSQL 
const pg = require('pg'); // Importar o módulo pg
const pool = new pg.Pool({
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT || 5432,
    ssl: process.env.PGHOST ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    maxUses: 7500,
    allowExitOnIdle: true
});

// Verificar variáveis de ambiente
const requiredEnvVars = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGPORT'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`Erro crítico: Variável de ambiente ${envVar} não definida`);
        process.exit(1);
    }
}

// Testar conexão com o banco
pool.connect((err, client, release) => {
    if (err) {
        console.error('Erro ao conectar ao banco Neon:', err);
        process.exit(1);
    }
    console.log('Conexão com o banco Neon estabelecida com sucesso');
    release();
});
app.use(express.json());
app.use(express.static('public'));



// cria tabelas
async function setupTables() {
    const client = await pool.connect();
    try {
        console.log('Iniciando configuração das tabelas...');
        await client.query('BEGIN');

        // Dropar tabelas existentes
        console.log('Dropando tabelas existentes...');
        await client.query('DROP TABLE IF EXISTS appointments CASCADE;');
        await client.query('DROP TABLE IF EXISTS barbers CASCADE;');
        await client.query('DROP TABLE IF EXISTS users CASCADE;');

        // Criar tabela users
        console.log('Criando tabela users...');
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                name TEXT,
                phone TEXT,
                CONSTRAINT users_username_unique UNIQUE (username)
            );
        `);

        // Criar tabela barbers
        console.log('Criando tabela barbers...');
        await client.query(`
            CREATE TABLE barbers (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                CONSTRAINT barbers_name_unique UNIQUE (name)
            );
        `);

        // Criar tabela appointments
        console.log('Criando tabela appointments...');
        await client.query(`
            CREATE TABLE appointments (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL,
                time TIME NOT NULL,
                barber_id INTEGER NOT NULL,
                client_id INTEGER NOT NULL,
                FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE RESTRICT,
                FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE RESTRICT
            );
        `);

        // Inserir dados iniciais
        console.log('Inserindo dados iniciais...');
        await client.query(`
            INSERT INTO users (username, password, role, name, phone) 
            VALUES 
                ('admin', '$2b$10$K.0XbKq7z7z7z7z7z7z7z.O', 'admin', 'Administrador', '123456789'),
                ('cliente1', '$2b$10$K.0XbKq7z7z7z7z7z7z7z.O', 'client', 'Cliente Teste 1', '987654321'),
                ('cliente2', '$2b$10$K.0XbKq7z7z7z7z7z7z7z.O', 'client', 'Cliente Teste 2', '912345678')
            ON CONFLICT ON CONSTRAINT users_username_unique DO NOTHING;

            INSERT INTO barbers (name) 
            VALUES 
                ('João Silva'),
                ('Maria Santos')
            ON CONFLICT ON CONSTRAINT barbers_name_unique DO NOTHING;
        `);

        await client.query('COMMIT');
        console.log('Tabelas criadas e dados iniciais inseridos com sucesso');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Erro ao criar tabelas ou inserir dados iniciais:', err);
        throw err;
    } finally {
        client.release();
    }
}

// Executar a configuração das tabelas ao iniciar o servidor
setupTables().catch(err => {
    console.error('Erro ao executar setupTables:', err);
    process.exit(1);
});




// Endpoint de login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    // Validar entrada
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    try {
        // Consultar usuário no banco
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        // Verificar se o usuário existe
        if (!user) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        // Verificar senha
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Senha incorreta' });
        }

        // Login bem-sucedido
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
        console.error('Erro no endpoint /api/login:', err);
        res.status(500).json({ error: 'Erro interno do servidor' });
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
    const { date, time, barber_id, client_id, is_recurring } = req.body;
    console.log('Tentativa de criar agendamento:', { date, time, barber_id, client_id, is_recurring });

    if (!date || !time || !barber_id || !client_id) {
        console.log('Campos obrigatórios faltando:', { date, time, barber_id, client_id });
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN', { timeout: 3000 });

            // Validar barber_id e client_id
            const barberCheck = await client.query('SELECT id FROM barbers WHERE id = $1', [barber_id], { timeout: 3000 });
            if (barberCheck.rows.length === 0) {
                console.log('Barbeiro não encontrado:', barber_id);
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Barbeiro não encontrado' });
            }

            const clientCheck = await client.query('SELECT id FROM users WHERE id = $1 AND role = $2', [client_id, 'client'], { timeout: 3000 });
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
                [barber_id, date, time],
                { timeout: 3000 }
            );

            if (checkResult.rows.length > 0) {
                console.log('Horário já ocupado:', { barber_id, date, time });
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Horário já ocupado', existingAppointment: checkResult.rows[0] });
            }

            // Inserir o agendamento inicial
            const result = await client.query(
                'INSERT INTO appointments (date, time, barber_id, client_id) VALUES ($1, $2, $3, $4) RETURNING id',
                [date, time, barber_id, client_id],
                { timeout: 3000 }
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

                // Gerar datas para o mesmo dia da semana
                for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 7)) {
                    if (d > startDate) { // Pular a data inicial já inserida
                        const dateStr = d.toISOString().split('T')[0];
                        params.push(barber_id, dateStr, time, client_id);
                        values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
                    }
                }

                if (values.length > 0) {
                    // Verificar conflitos para todas as datas
                    const conflictParams = [barber_id, ...params.filter((_, i) => i % 4 === 1 || i % 4 === 2)];
                    const conflictValues = values.map((_, i) => `($${i * 2 + 2}, $${i * 2 + 3})`).join(',');
                    const conflictCheck = await client.query(
                        `SELECT date, time FROM appointments WHERE barber_id = $1 AND (date, time) IN (${conflictValues})`,
                        conflictParams,
                        { timeout: 3000 }
                    );

                    if (conflictCheck.rows.length > 0) {
                        console.log('Conflitos encontrados em agendamentos recorrentes:', conflictCheck.rows);
                        await client.query('ROLLBACK');
                        return res.status(400).json({ error: 'Um ou mais horários recorrentes já estão ocupados', conflicts: conflictCheck.rows });
                    }

                    // Inserir agendamentos recorrentes
                    await client.query(
                        `INSERT INTO appointments (barber_id, date, time, client_id) VALUES ${values.join(',')}`,
                        params,
                        { timeout: 3000 }
                    );
                    recurringCount = values.length / 4; // Cada agendamento usa 4 parâmetros
                    console.log(`Inseridos ${recurringCount} agendamentos recorrentes`);
                }
            }

            await client.query('COMMIT', { timeout: 3000 });
            res.json({
                message: 'Agendamento criado com sucesso',
                appointmentId,
                recurringCount
            });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Erro ao criar agendamento:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
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