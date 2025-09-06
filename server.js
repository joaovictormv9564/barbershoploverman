const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const app = express();

// Validar variáveis de ambiente
const requiredEnvVars = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGPORT'];
requiredEnvVars.forEach((varName) => {
    if (!process.env[varName]) {
        console.error(`Erro: Variável de ambiente ${varName} não definida`);
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
    ssl: process.env.PGHOST ? { rejectUnauthorized: false } : false
});

// Testar conexão ao iniciar
(async () => {
    try {
        const client = await pool.connect();
        console.log('Conexão ao banco Neon PostgreSQL bem-sucedida');
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
                username TEXT UNIQUE,
                password TEXT,
                role TEXT,
                name TEXT,
                phone TEXT
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS barbers (
                id SERIAL PRIMARY KEY,
                name TEXT
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS appointments (
                id SERIAL PRIMARY KEY,
                date TEXT,
                time TEXT,
                barber_id INTEGER,
                client_id INTEGER,
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

// Endpoint de login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('Tentativa de login:', { username, password });
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
        res.json({ id: result.rows[0].id, role: result.rows[0].role, username: result.rows[0].username });
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

// Endpoint de agendamentos
app.get('/api/appointments', async (req, res) => {
    const { barber_id, client_id } = req.query;
    let query = `
        SELECT a.id, a.date, a.time, a.barber_id, a.client_id, b.name AS barber_name, u.name AS client_name
        FROM appointments a
        JOIN barbers b ON a.barber_id = b.id
        JOIN users u ON a.client_id = u.id
    `;
    const params = [];
    if (barber_id && client_id) {
        query += ` WHERE a.barber_id = $1 AND a.client_id = $2`;
        params.push(barber_id, client_id);
    } else if (barber_id) {
        query += ` WHERE a.barber_id = $1`;
        params.push(barber_id);
    } else if (client_id) {
        query += ` WHERE a.client_id = $1`;
        params.push(client_id);
    }
    console.log('Executando query:', query, 'com params:', params);
    try {
        const client = await pool.connect();
        const result = await client.query(query, params);
        client.release();
        console.log('Agendamentos enviados:', result.rows);
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar agendamentos:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});

app.post('/api/appointments', async (req, res) => {
    const { date, time, barber_id, client_id } = req.body;
    console.log('Tentativa de criar agendamento:', { date, time, barber_id, client_id });
    try {
        const client = await pool.connect();
        const result = await client.query(
            'INSERT INTO appointments (date, time, barber_id, client_id) VALUES ($1, $2, $3, $4) RETURNING id',
            [date, time, barber_id, client_id]
        );
        client.release();
        console.log('Agendamento criado com ID:', result.rows[0].id);
        res.json({ message: 'Agendamento criado com sucesso' });
    } catch (err) {
        console.error('Erro ao criar agendamento:', err);
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
        console.error('Erro ao buscar barbeiros:', err);
        res.status(500).json({ error: 'Erro no servidor', details: err.message });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
// Adicionar barbeiro
app.post('/api/barbers', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome do barbeiro é obrigatório' });
    db.run('INSERT INTO barbers (name) VALUES (?)', [name], function (err) {
        if (err) {
            console.error('Erro ao adicionar barbeiro:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        res.json({ id: this.lastID, name });
    });
});

// Remover barbeiro
app.delete('/api/barbers/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT COUNT(*) as count FROM appointments WHERE barber_id = ?', [id], (err, row) => {
        if (err) {
            console.error('Erro ao verificar agendamentos:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        if (row.count > 0) {
            return res.status(400).json({ error: 'Barbeiro possui agendamentos e não pode ser removido' });
        }
        db.run('DELETE FROM barbers WHERE id = ?', [id], function (err) {
            if (err) {
                console.error('Erro ao remover barbeiro:', err);
                return res.status(500).json({ error: 'Erro no servidor' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Barbeiro não encontrado' });
            }
            res.json({ message: 'Barbeiro removido com sucesso' });
        });
    });
});

// Editar barbeiro
app.put('/api/barbers/:id', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Nome do barbeiro é obrigatório' });
    }
    db.run('UPDATE barbers SET name = ? WHERE id = ?', [name, id], function (err) {
        if (err) {
            console.error('Erro ao editar barbeiro:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Barbeiro não encontrado' });
        }
        res.json({ message: 'Barbeiro atualizado com sucesso', id, name });
    });
});

// Listar agendamentos
app.get('/api/appointments', (req, res) => {
    const { barber_id, client_id } = req.query;
    let query = `
        SELECT a.id, a.date, a.time, a.barber_id, a.client_id, b.name AS barber_name, u.name AS client_name
        FROM appointments a
        JOIN barbers b ON a.barber_id = b.id
        JOIN users u ON a.client_id = u.id
    `;
    const params = [];
    if (barber_id && client_id) {
        query += ` WHERE a.barber_id = ? AND a.client_id = ?`;
        params.push(barber_id, client_id);
    } else if (barber_id) {
        query += ` WHERE a.barber_id = ?`;
        params.push(barber_id);
    } else if (client_id) {
        query += ` WHERE a.client_id = ?`;
        params.push(client_id);
    }
    console.log('Executando query:', query, 'com params:', params); // Log para depuração
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Erro ao buscar agendamentos:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        console.log('Agendamentos enviados:', rows);
        res.json(rows);
    });
});
// Criar agendamento
app.post('/api/appointments', (req, res) => {
    const { date, time, barber_id, client_id } = req.body;
    if (!date || !time || !barber_id || !client_id) {
        return res.status(400).json({ error: 'Data, horário, barbeiro e cliente são obrigatórios' });
    }
    // Verifica se o horário já está ocupado
    db.get(
        'SELECT * FROM appointments WHERE date = ? AND time = ? AND barber_id = ?',
        [date, time, barber_id],
        (err, row) => {
            if (err) {
                console.error('Erro ao verificar agendamento:', err);
                return res.status(500).json({ error: 'Erro no servidor' });
            }
            if (row) {
                return res.status(400).json({ error: 'Horário já está ocupado' });
            }
            db.run(
                'INSERT INTO appointments (date, time, barber_id, client_id) VALUES (?, ?, ?, ?)',
                [date, time, barber_id, client_id],
                function (err) {
                    if (err) {
                        console.error('Erro ao criar agendamento:', err);
                        return res.status(500).json({ error: 'Erro no servidor' });
                    }
                    res.json({ id: this.lastID, date, time, barber_id, client_id });
                }
            );
        }
    );
});
// Remover agendamento
app.delete('/api/appointments/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM appointments WHERE id = ?', [id], function (err) {
        if (err) {
            console.error('Erro ao remover agendamento:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Agendamento não encontrado' });
        }
        res.json({ message: 'Agendamento removido com sucesso' });
    });
});

app.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));